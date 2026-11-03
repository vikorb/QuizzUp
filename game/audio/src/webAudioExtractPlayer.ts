import type { ExtractPlayer, PlayOutcome, PreloadOptions, PreloadResult } from './extractPlayer'

export const DEFAULT_FADE_MS = 15
/** Délai max pour qu'un contexte suspendu reprenne avant que `play()` n'abandonne. */
export const DEFAULT_RESUME_TIMEOUT_MS = 2000
export const DEFAULT_CONCURRENCY = 3

type FetchFn = (url: string) => Promise<Response>

export type WebAudioExtractPlayerOptions = {
  /** Fabrique de l'AudioContext (injectable en test). Défaut : `new AudioContext()`. */
  createContext?: () => AudioContext
  /** Fondu d'entrée/sortie en ms, pour éviter les clics (défaut 15). */
  fadeMs?: number
  resumeTimeoutMs?: number
  /** Volume général entre 0 et 1 (défaut 1). */
  volume?: number
  /** Fetch par défaut pour les chargements à la volée (défaut : `fetch` global). */
  fetch?: FetchFn
}

/** Palier en cours : un extrait joué depuis `startSec` pendant `totalMs`, éventuellement en pause. */
type Segment = {
  url: string
  startSec: number
  totalMs: number
  playedMs: number
  paused: boolean
  buffer: AudioBuffer | null
  source: AudioBufferSourceNode | null
  gain: GainNode | null
  runStartedAt: number
  resolve: (outcome: PlayOutcome) => void
}

/**
 * Lecteur d'extraits basé sur Web Audio : les fichiers sont décodés en `AudioBuffer` et gardés
 * en mémoire, chaque palier est planifié sur l'horloge audio (`source.start(when, offset,
 * duration)`) et sa fin est détectée par `onended`, jamais par un `setTimeout`.
 */
export class WebAudioExtractPlayer implements ExtractPlayer {
  private readonly createContext: () => AudioContext
  private readonly fadeSec: number
  private volume: number
  private fetchFn: FetchFn
  private readonly resumeTimeoutMs: number
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private readonly buffers = new Map<string, AudioBuffer>()
  private readonly inflight = new Map<string, Promise<AudioBuffer>>()
  private current: Segment | null = null

  constructor(options: WebAudioExtractPlayerOptions = {}) {
    this.createContext = options.createContext ?? (() => new AudioContext())
    this.fadeSec = Math.max(0, options.fadeMs ?? DEFAULT_FADE_MS) / 1000
    this.volume = clampVolume(options.volume ?? 1, 1)
    this.fetchFn = options.fetch ?? ((url) => fetch(url))
    this.resumeTimeoutMs = Math.max(0, options.resumeTimeoutMs ?? DEFAULT_RESUME_TIMEOUT_MS)
  }

  /** AudioContext partagé (créé au premier besoin), réutilisable par `UiSoundPlayer`. */
  getContext(): AudioContext {
    if (!this.context) this.context = this.createContext()
    return this.context
  }

  /**
   * À appeler dans un geste utilisateur (politique autoplay). Un contexte fermé est remplacé
   * par un contexte neuf : le palier en cours est arrêté, les buffers décodés sont conservés.
   */
  async unlock(): Promise<void> {
    if (this.context?.state === 'closed') this.replaceClosedContext()
    const context = this.getContext()
    if (context.state === 'running') return
    await context.resume()
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume, this.volume)
    if (this.master) this.master.gain.value = this.volume
  }

  getVolume(): number {
    return this.volume
  }

  isLoaded(url: string): boolean {
    return this.buffers.has(url)
  }

  release(urls?: string[]): void {
    if (!urls) {
      this.buffers.clear()
      this.inflight.clear()
      return
    }
    for (const url of urls) {
      this.buffers.delete(url)
      this.inflight.delete(url)
    }
  }

  /** Le `fetch` passé ici devient aussi celui des chargements à la volée de `play()`. */
  async preload(urls: string[], options: PreloadOptions = {}): Promise<PreloadResult> {
    if (options.fetch) this.fetchFn = options.fetch
    const fetchFn = this.fetchFn
    const unique = [...new Set(urls)]
    const succeeded = new Set<string>()
    let done = 0
    let next = 0

    const worker = async (): Promise<void> => {
      while (next < unique.length) {
        const url = unique[next++] as string
        if (await this.tryLoad(url, fetchFn)) succeeded.add(url)
        done++
        notifyProgress(options.onProgress, done, unique.length)
      }
    }

    const workerCount = Math.min(normalizeConcurrency(options.concurrency), unique.length)
    await Promise.all(Array.from({ length: workerCount }, worker))
    return {
      loaded: unique.filter((url) => succeeded.has(url)),
      failed: unique.filter((url) => !succeeded.has(url)),
    }
  }

  play(url: string, startSec: number, durationMs: number): Promise<PlayOutcome> {
    this.stop()
    if (!(durationMs > 0)) return Promise.resolve('ended')

    const context = this.getContext()
    if (context.state === 'closed') {
      return Promise.reject(
        new Error('AudioContext fermé : appeler unlock() pour en recréer un avant play()')
      )
    }

    return new Promise<PlayOutcome>((resolve, reject) => {
      const segment = createSegment(url, sanitizeStart(startSec), durationMs, resolve)
      this.current = segment
      if (context.state === 'suspended') this.resumeFor(segment, context, reject)
      const buffer = this.buffers.get(url)
      if (buffer) {
        this.begin(segment, buffer)
        return
      }
      this.loadBuffer(url, this.fetchFn).then(
        (loaded) => {
          if (this.current === segment) this.begin(segment, loaded)
        },
        (error: unknown) => {
          if (this.current !== segment) return
          this.current = null
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      )
    })
  }

  pause(): number {
    const segment = this.current
    if (!segment) return 0
    if (segment.paused) return segment.playedMs
    segment.paused = true
    if (!segment.source) return segment.playedMs

    const elapsedMs = (this.getContext().currentTime - segment.runStartedAt) * 1000
    const remainingMs = segment.totalMs - segment.playedMs
    if (elapsedMs >= remainingMs) {
      // La source a déjà fini mais `onended` n'est pas encore livré : le palier est terminé.
      segment.playedMs = segment.totalMs
      this.finish(segment, 'ended')
      return segment.totalMs
    }
    segment.playedMs = roundMs(segment.playedMs + Math.max(0, elapsedMs))
    this.halt(segment)
    return segment.playedMs
  }

  resume(): void {
    const segment = this.current
    if (!segment || !segment.paused) return
    segment.paused = false
    if (!segment.buffer) return
    this.startRun(segment)
  }

  stop(): void {
    const segment = this.current
    if (!segment) return
    this.halt(segment)
    this.finish(segment, 'stopped')
  }

  /**
   * Contexte suspendu au moment de `play()` : on tente de le reprendre. La source peut être
   * planifiée tout de suite (elle démarre quand l'horloge repart) ; si la reprise échoue, le
   * palier est rejeté au lieu de rester bloqué sur une horloge figée.
   */
  private resumeFor(segment: Segment, context: AudioContext, reject: (error: Error) => void): void {
    const abandon = (reason: string): void => {
      if (this.current !== segment) return
      this.halt(segment)
      this.current = null
      reject(
        new Error(`AudioContext suspendu et impossible à reprendre (unlock() oublié ?) : ${reason}`)
      )
    }

    // Sans geste utilisateur, `resume()` peut rester en attente sans jamais rejeter : ce délai
    // de garde (pas une mesure de temps de jeu) évite de bloquer le moteur indéfiniment.
    const watchdog = setTimeout(() => {
      if (context.state !== 'running') abandon('délai dépassé')
    }, this.resumeTimeoutMs)

    context.resume().then(
      () => clearTimeout(watchdog),
      (error: unknown) => {
        clearTimeout(watchdog)
        abandon(error instanceof Error ? error.message : String(error))
      }
    )
  }

  /** Abandonne un contexte fermé (et son gain maître) ; le palier en cours est arrêté. */
  private replaceClosedContext(): void {
    const segment = this.current
    if (segment) this.finish(segment, 'stopped')
    this.context = null
    this.master = null
  }

  /** Le buffer est disponible : on borne le palier à la fin du fichier puis on lance. */
  private begin(segment: Segment, buffer: AudioBuffer): void {
    segment.buffer = buffer
    const availableMs = (buffer.duration - segment.startSec) * 1000
    segment.totalMs = Math.min(segment.totalMs, Math.max(0, availableMs))
    if (segment.paused) return
    this.startRun(segment)
  }

  /** Lance (ou relance après pause) la lecture pour le temps restant du palier. */
  private startRun(segment: Segment): void {
    const remainingMs = segment.totalMs - segment.playedMs
    if (remainingMs <= 0 || !segment.buffer) {
      this.finish(segment, 'ended')
      return
    }
    const context = this.getContext()
    const now = context.currentTime
    const durationSec = remainingMs / 1000
    const offsetSec = segment.startSec + segment.playedMs / 1000

    const output = this.output()
    const gain = context.createGain()
    const source = context.createBufferSource()
    source.buffer = segment.buffer
    source.connect(gain)
    gain.connect(output)
    this.applyFadeEnvelope(gain.gain, now, durationSec)
    source.onended = () => this.handleEnded(segment, source)
    source.start(now, offsetSec, durationSec)

    segment.source = source
    segment.gain = gain
    segment.runStartedAt = now
  }

  private handleEnded(segment: Segment, source: AudioBufferSourceNode): void {
    if (this.current !== segment || segment.source !== source) return
    this.finish(segment, 'ended')
  }

  private finish(segment: Segment, outcome: PlayOutcome): void {
    if (this.current === segment) this.current = null
    segment.source?.disconnect()
    segment.gain?.disconnect()
    segment.source = null
    segment.gain = null
    segment.resolve(outcome)
  }

  /** Coupe la source en cours avec un court fondu de sortie, sans déclencher `ended`. */
  private halt(segment: Segment): void {
    const { source, gain } = segment
    segment.source = null
    segment.gain = null
    if (!source || !gain) return

    const now = this.getContext().currentTime
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + this.fadeSec)
    source.stop(now + this.fadeSec)
  }

  private applyFadeEnvelope(param: AudioParam, startAt: number, durationSec: number): void {
    const fade = Math.min(this.fadeSec, durationSec / 2)
    if (fade <= 0) {
      param.setValueAtTime(1, startAt)
      return
    }
    const endAt = startAt + durationSec
    param.setValueAtTime(0, startAt)
    param.linearRampToValueAtTime(1, startAt + fade)
    param.setValueAtTime(1, endAt - fade)
    param.linearRampToValueAtTime(0, endAt)
  }

  private output(): GainNode {
    if (this.master) return this.master
    const context = this.getContext()
    this.master = context.createGain()
    this.master.gain.value = this.volume
    this.master.connect(context.destination)
    return this.master
  }

  private async tryLoad(url: string, fetchFn: FetchFn): Promise<boolean> {
    if (this.buffers.has(url)) return true
    try {
      await this.loadBuffer(url, fetchFn)
      return true
    } catch {
      return false
    }
  }

  /** Télécharge + décode une URL ; les demandes simultanées pour la même URL sont fusionnées. */
  private loadBuffer(url: string, fetchFn: FetchFn): Promise<AudioBuffer> {
    const pending = this.inflight.get(url)
    if (pending) return pending
    const promise = this.fetchAndDecode(url, fetchFn)
    this.inflight.set(url, promise)
    promise.then(
      (buffer) => this.settleLoad(url, promise, buffer),
      () => this.settleLoad(url, promise, null)
    )
    return promise
  }

  /** Mémorise le buffer, sauf si l'URL a été libérée pendant le chargement. */
  private settleLoad(url: string, promise: Promise<AudioBuffer>, buffer: AudioBuffer | null) {
    if (this.inflight.get(url) !== promise) return
    this.inflight.delete(url)
    if (buffer) this.buffers.set(url, buffer)
  }

  private async fetchAndDecode(url: string, fetchFn: FetchFn): Promise<AudioBuffer> {
    const response = await fetchFn(url)
    if (!response.ok) throw new Error(`Échec du téléchargement (${response.status}) : ${url}`)
    const data = await response.arrayBuffer()
    return this.getContext().decodeAudioData(data)
  }
}

function createSegment(
  url: string,
  startSec: number,
  durationMs: number,
  resolve: (outcome: PlayOutcome) => void
): Segment {
  return {
    url,
    startSec,
    totalMs: durationMs,
    playedMs: 0,
    paused: false,
    buffer: null,
    source: null,
    gain: null,
    runStartedAt: 0,
    resolve,
  }
}

function sanitizeStart(startSec: number): number {
  return Number.isFinite(startSec) && startSec > 0 ? startSec : 0
}

function normalizeConcurrency(concurrency: number | undefined): number {
  if (concurrency === undefined || !Number.isFinite(concurrency)) return DEFAULT_CONCURRENCY
  return Math.max(1, Math.floor(concurrency))
}

function notifyProgress(
  onProgress: PreloadOptions['onProgress'],
  done: number,
  total: number
): void {
  try {
    onProgress?.(done, total)
  } catch {
    // Un callback de progression défaillant ne doit pas faire échouer le préchargement.
  }
}

function clampVolume(volume: number, fallback: number): number {
  return Number.isFinite(volume) ? clamp(volume, 0, 1) : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Arrondi à la microseconde, pour gommer les erreurs de flottants de l'horloge audio. */
function roundMs(ms: number): number {
  return Math.round(ms * 1000) / 1000
}
