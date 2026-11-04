import type { ExtractPlayer, PlayOutcome } from '@/audio/player'
import { DEMO_MEDIA_PREFIX } from '@/game/content'

/**
 * Extraits du mode démo, synthétisés à la volée (oscillateurs Web Audio) : de
 * vraies mélodies, libres de droits, sans fichier à télécharger. Chaque URL
 * `demo://theme/n` donne toujours la même mélodie, et la position dans
 * l'extrait se calcule à partir du temps : pause et reprise tombent juste.
 */
const STEP_SEC = 0.25
const MASTER_GAIN = 0.22
/** Gamme pentatonique (demi-tons au-dessus de la tonique) : toujours consonante. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]
const WAVES: readonly OscillatorType[] = ['triangle', 'square', 'sawtooth', 'sine']

type Scheduler = {
  now: () => number
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const DEFAULT_SCHEDULER: Scheduler = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function isDemoMediaUrl(url: string): boolean {
  return url.startsWith(DEMO_MEDIA_PREFIX)
}

/** Graine stable d'une URL (FNV-1a 32 bits). */
function hashUrl(url: string): number {
  let hash = 0x81_1c_9d_c5
  for (const char of url) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0
  }
  return hash
}

export type DemoMelody = {
  wave: OscillatorType
  /** Fréquence de la note jouée au pas `step` (`null` : silence). */
  frequencyAt: (step: number) => number | null
}

/** Mélodie d'un extrait de démo : motif de 16 pas répété, tonique et timbre tirés de l'URL. */
export function getDemoMelody(url: string): DemoMelody {
  const seed = hashUrl(url)
  const tonic = 220 * 2 ** (((seed >>> 3) % 12) / 12)
  const pattern = Array.from({ length: 16 }, (_unused, index) => {
    const value = (seed >>> (index % 24)) ^ Math.imul(index + 1, 0x9e_37_79_b1)
    // Environ un pas sur cinq est un silence, pour donner du rythme.
    return (value >>> 0) % 5 === 0 ? null : (SCALE[(value >>> 4) % SCALE.length] ?? 0)
  })

  return {
    wave: WAVES[seed % WAVES.length] ?? 'triangle',
    frequencyAt: (step) => {
      const semitones = pattern[((step % 16) + 16) % 16]
      return semitones === null || semitones === undefined ? null : tonic * 2 ** (semitones / 12)
    },
  }
}

type Segment = {
  url: string
  /** Position courante dans l'extrait (s). */
  offsetSec: number
  remainingMs: number
  playedMs: number
  paused: boolean
  resolve: (outcome: PlayOutcome) => void
}

export function createDemoSynthPlayer(
  getContext: () => AudioContext,
  scheduler: Scheduler = DEFAULT_SCHEDULER
): ExtractPlayer {
  let segment: Segment | null = null
  let timer: unknown = null
  let nodes: OscillatorNode[] = []
  /** Instant (horloge du scheduler) où le morceau en cours a (re)commencé. */
  let startedAt = 0

  function silence(): void {
    for (const node of nodes) {
      try {
        node.stop()
      } catch {
        // Déjà arrêté.
      }
    }
    nodes = []
    if (timer !== null) {
      scheduler.clearTimeout(timer)
      timer = null
    }
  }

  function settle(outcome: PlayOutcome): void {
    silence()
    const current = segment
    segment = null
    current?.resolve(outcome)
  }

  function begin(current: Segment): void {
    startedAt = scheduler.now()
    timer = scheduler.setTimeout(() => settle('ended'), Math.max(0, current.remainingMs))

    let context: AudioContext
    try {
      context = getContext()
    } catch {
      return
    }
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }

    const melody = getDemoMelody(current.url)
    const master = context.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(context.destination)

    const origin = context.currentTime + 0.01
    const endSec = current.offsetSec + current.remainingMs / 1000

    for (let step = Math.floor(current.offsetSec / STEP_SEC); step * STEP_SEC < endSec; step += 1) {
      const frequency = melody.frequencyAt(step)
      if (frequency === null) {
        continue
      }
      const noteStart = Math.max(step * STEP_SEC, current.offsetSec)
      const noteEnd = Math.min((step + 0.92) * STEP_SEC, endSec)
      if (noteEnd <= noteStart) {
        continue
      }
      const at = origin + (noteStart - current.offsetSec)
      const until = origin + (noteEnd - current.offsetSec)

      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      oscillator.type = melody.wave
      oscillator.frequency.setValueAtTime(frequency, at)
      // Attaque raccourcie pour une note tronquée (reprise juste avant sa fin) : sans
      // ça, la montée finirait après la descente et la note claquerait à plein niveau.
      const attack = Math.min(0.01, (until - at) / 2)
      envelope.gain.setValueAtTime(0, at)
      envelope.gain.linearRampToValueAtTime(1, at + attack)
      envelope.gain.linearRampToValueAtTime(0, until)
      oscillator.connect(envelope)
      envelope.connect(master)
      oscillator.start(at)
      oscillator.stop(until + 0.02)
      nodes.push(oscillator)
    }
  }

  return {
    unlock: async () => {
      await getContext().resume()
    },
    preload: async (urls, options) => {
      options?.onProgress?.(urls.length, urls.length)
      return { loaded: [...urls], failed: [] }
    },
    play(url, startSec, durationMs) {
      settle('stopped')
      if (durationMs <= 0) {
        return Promise.resolve('ended')
      }
      return new Promise<PlayOutcome>((resolve) => {
        const next: Segment = {
          url,
          offsetSec: Number.isFinite(startSec) && startSec > 0 ? startSec : 0,
          remainingMs: durationMs,
          playedMs: 0,
          paused: false,
          resolve,
        }
        segment = next
        begin(next)
      })
    },
    pause() {
      const current = segment
      if (!current || current.paused) {
        return current?.playedMs ?? 0
      }
      const elapsed = Math.min(current.remainingMs, scheduler.now() - startedAt)
      silence()
      current.paused = true
      current.playedMs += elapsed
      current.remainingMs -= elapsed
      current.offsetSec += elapsed / 1000
      return current.playedMs
    },
    resume() {
      const current = segment
      if (!current || !current.paused) {
        return
      }
      current.paused = false
      begin(current)
    },
    stop() {
      settle('stopped')
    },
    isLoaded: (url) => isDemoMediaUrl(url),
    release: () => undefined,
  }
}

/**
 * Lecteur de la salle : les extraits de démo sont synthétisés, les autres passent
 * par le lecteur Web Audio (fichiers préchargés).
 */
export function createRoutingExtractPlayer(
  main: ExtractPlayer,
  demo: ExtractPlayer
): ExtractPlayer {
  let active: ExtractPlayer | null = null
  const pick = (url: string) => (isDemoMediaUrl(url) ? demo : main)

  return {
    unlock: async () => {
      await main.unlock()
    },
    preload: (urls, options) =>
      main.preload(
        urls.filter((url) => !isDemoMediaUrl(url)),
        options
      ),
    play(url, startSec, durationMs) {
      const next = pick(url)
      if (active && active !== next) {
        active.stop()
      }
      active = next
      return next.play(url, startSec, durationMs)
    },
    pause: () => active?.pause() ?? 0,
    resume: () => active?.resume(),
    stop: () => {
      main.stop()
      demo.stop()
    },
    isLoaded: (url) => pick(url).isLoaded(url),
    release: (urls) => main.release(urls),
  }
}
