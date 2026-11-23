import type { PreloadResult } from './extractPlayer'

/**
 * Lecteur des annonces vocales du présentateur (« Manche trois », « Bonne réponse »…). Les clips
 * sont des fichiers statiques décrits par un manifeste ; aucun n'est dans le dépôt. Règle
 * absolue : **repli silencieux**. Manifeste ou fichier absent, décodage raté, contexte audio
 * suspendu ou fermé : `preload` et `say` ne lèvent jamais d'erreur et ne bloquent rien, la
 * partie continue simplement sans voix.
 */

export const ANNOUNCER_MANIFEST_URL = '/announcer/manifest.json'
/** Annonces en attente (en plus de celle qui parle) : au-delà, la plus ancienne est abandonnée. */
export const ANNOUNCER_QUEUE_MAX = 2
/** Attente maximale d'une annonce avant d'être jugée périmée (elle n'est alors jamais jouée). */
export const ANNOUNCER_MAX_WAIT_MS = 4000
/** Niveau des extraits pendant une annonce, et durées des rampes d'atténuation et de retour. */
export const ANNOUNCER_DUCK_FACTOR = 0.3
export const ANNOUNCER_DUCK_IN_MS = 80
export const ANNOUNCER_DUCK_OUT_MS = 300
/** Fondu de sortie d'une annonce coupée, pour éviter un clic. */
const CUT_FADE_SEC = 0.02

export type AnnouncerPlayerOptions = {
  /** Fournit l'AudioContext : passer `() => extractPlayer.getContext()` pour le partager. */
  context?: () => AudioContext
  /** URL du manifeste (défaut `/announcer/manifest.json`) ; les clips sont cherchés à côté. */
  manifestUrl?: string
  /** Fetch injectable (défaut : `fetch` global). Aucun jeton : le contenu est fixe et public. */
  fetch?: (url: string) => Promise<Response>
  /** Volume des annonces entre 0 et 1 (défaut 1). */
  volume?: number
  /** Atténue les extraits : `(0.3, 80)` au début d'une annonce, `(1, 300)` quand tout est dit. */
  duck?: (factor: number, rampMs: number) => void
}

export type SayOptions = {
  /** Une annonce de priorité plus haute coupe celle en cours et vide la file (défaut 0). */
  priority?: number
  /** Attente max en file avant d'être abandonnée (défaut `ANNOUNCER_MAX_WAIT_MS`). */
  maxWaitMs?: number
}

type Waiting = { id: string; buffer: AudioBuffer; priority: number; expiresAt: number }
type Speaking = {
  id: string
  priority: number
  source: AudioBufferSourceNode
  gain: GainNode
}

export class AnnouncerPlayer {
  private readonly getContext: () => AudioContext
  private readonly manifestUrl: string
  private readonly fetchFn: (url: string) => Promise<Response>
  private readonly duckFn: ((factor: number, rampMs: number) => void) | undefined
  private volume: number
  private master: GainNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private generation = 0
  private current: Speaking | null = null
  private queue: Waiting[] = []
  private ducked = false

  constructor(options: AnnouncerPlayerOptions = {}) {
    let ownContext: AudioContext | null = null
    this.getContext = options.context ?? (() => (ownContext ??= new AudioContext()))
    this.manifestUrl = options.manifestUrl ?? ANNOUNCER_MANIFEST_URL
    this.fetchFn = options.fetch ?? ((url) => fetch(url))
    this.duckFn = options.duck
    this.volume = clampVolume(options.volume ?? 1, 1)
  }

  /** Partage l'AudioContext et l'atténuation d'un lecteur d'extraits. */
  static sharing(
    player: { getContext(): AudioContext; duck(factor: number, rampMs: number): void },
    options: Omit<AnnouncerPlayerOptions, 'context' | 'duck'> = {}
  ): AnnouncerPlayer {
    return new AnnouncerPlayer({
      ...options,
      context: () => player.getContext(),
      duck: (factor, rampMs) => player.duck(factor, rampMs),
    })
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume, this.volume)
    if (this.master) this.master.gain.value = this.volume
  }

  /** Vrai si le clip est décodé et prêt à être dit. */
  has(id: string): boolean {
    return this.buffers.has(id)
  }

  /**
   * Charge le manifeste puis décode les clips de `lang`. Ne rejette jamais : sans manifeste,
   * `{ loaded: [], failed: [] }` ; un clip en échec est listé dans `failed` et sera muet.
   * Le manifeste est `{ version, <lang>: { <id>: durationMs } }`, les clips sont dans
   * `<dossier du manifeste>/<lang>/<id>.mp3` ; `version` sert de paramètre `?v=` (cache).
   */
  async preload(lang: string): Promise<PreloadResult> {
    const generation = ++this.generation
    const decoded = new Map<string, AudioBuffer>()
    let ids: string[] = []
    try {
      const manifest = await this.fetchManifest()
      ids = clipIds(manifest, lang)
      const base = this.manifestUrl.slice(0, this.manifestUrl.lastIndexOf('/') + 1)
      const version = manifest.version
      const query =
        typeof version === 'string' || typeof version === 'number'
          ? `?v=${encodeURIComponent(String(version))}`
          : ''
      await Promise.all(
        ids.map(async (id) => {
          try {
            const url = `${base}${encodeURIComponent(lang)}/${encodeURIComponent(id)}.mp3${query}`
            decoded.set(id, await this.fetchAndDecode(url))
          } catch {
            // Clip absent ou illisible : cette annonce sera muette, les autres restent jouables.
          }
        })
      )
    } catch {
      // Manifeste absent ou illisible : pas de voix, ce n'est pas une erreur.
    }
    // Un `preload` plus récent (changement de langue) a la priorité sur celui-ci.
    if (generation === this.generation) this.buffers = decoded
    return {
      loaded: ids.filter((id) => decoded.has(id)),
      failed: ids.filter((id) => !decoded.has(id)),
    }
  }

  /**
   * Dit une annonce, sans jamais lever d'erreur. Rien ne se passe si le clip est inconnu ou
   * non chargé, si le contexte audio ne tourne pas, ou s'il est déjà en cours ou en attente
   * (doublon). Sinon : une priorité plus haute que l'annonce en cours la coupe et vide la
   * file ; une priorité égale ou plus basse attend son tour (`ANNOUNCER_QUEUE_MAX` places, la
   * plus ancienne est abandonnée), et n'est plus jouée si elle a attendu plus de `maxWaitMs`.
   */
  say(id: string, options: SayOptions = {}): void {
    try {
      const buffer = this.buffers.get(id)
      if (!buffer) return
      const context = this.getContext()
      if (context.state !== 'running') {
        // Horloge figée : la file ne se viderait jamais et l'annonce sortirait en retard.
        this.stop()
        return
      }
      if (this.current?.id === id || this.queue.some((waiting) => waiting.id === id)) return

      const priority = options.priority ?? 0
      const maxWaitMs = options.maxWaitMs ?? ANNOUNCER_MAX_WAIT_MS
      if (this.current && priority > this.current.priority) {
        this.queue = []
        this.cut(this.current)
      }
      this.queue.push({ id, buffer, priority, expiresAt: context.currentTime + maxWaitMs / 1000 })
      if (this.queue.length > ANNOUNCER_QUEUE_MAX) this.queue.shift()
      if (!this.current) this.pump()
    } catch {
      this.stop()
    }
  }

  /** Coupe l'annonce en cours, vide la file et rétablit le niveau des extraits. */
  stop(): void {
    this.queue = []
    try {
      if (this.current) this.cut(this.current)
    } catch {
      this.current = null
    }
    this.setDucked(false)
  }

  /** Joue la prochaine annonce encore valable ; rétablit les extraits quand la file est vide. */
  private pump(): void {
    try {
      const context = this.getContext()
      while (!this.current) {
        const next = this.queue.shift()
        if (!next) {
          this.setDucked(false)
          return
        }
        if (context.currentTime > next.expiresAt) continue
        this.setDucked(true)
        try {
          this.speak(context, next)
        } catch {
          // Clip impossible à lancer : on passe au suivant, ou on rétablit le niveau.
          this.current = null
        }
      }
    } catch {
      this.stop()
    }
  }

  private speak(context: AudioContext, waiting: Waiting): void {
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = waiting.buffer
    source.connect(gain)
    gain.connect(this.output(context))
    const speaking: Speaking = { id: waiting.id, priority: waiting.priority, source, gain }
    source.onended = () => {
      if (this.current !== speaking) return
      this.current = null
      source.disconnect()
      gain.disconnect()
      this.pump()
    }
    source.start(context.currentTime)
    this.current = speaking
  }

  /** Coupe une annonce avec un court fondu, sans relancer la file. */
  private cut(speaking: Speaking): void {
    const { source, gain } = speaking
    this.current = null
    const now = this.getContext().currentTime
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + CUT_FADE_SEC)
    source.stop(now + CUT_FADE_SEC)
  }

  private setDucked(ducked: boolean): void {
    if (ducked === this.ducked) return
    this.ducked = ducked
    try {
      if (ducked) this.duckFn?.(ANNOUNCER_DUCK_FACTOR, ANNOUNCER_DUCK_IN_MS)
      else this.duckFn?.(1, ANNOUNCER_DUCK_OUT_MS)
    } catch {
      // Une atténuation qui échoue ne doit pas empêcher l'annonce.
    }
  }

  private async fetchManifest(): Promise<Record<string, unknown>> {
    const response = await this.fetchFn(this.manifestUrl)
    if (!response.ok) throw new Error(`Manifeste indisponible (${response.status})`)
    const manifest: unknown = await response.json()
    if (!isRecord(manifest)) throw new Error('Manifeste invalide')
    return manifest
  }

  private async fetchAndDecode(url: string): Promise<AudioBuffer> {
    const response = await this.fetchFn(url)
    if (!response.ok) throw new Error(`Clip indisponible (${response.status}) : ${url}`)
    return this.getContext().decodeAudioData(await response.arrayBuffer())
  }

  private output(context: AudioContext): GainNode {
    if (this.master && this.master.context === context) return this.master
    this.master = context.createGain()
    this.master.gain.value = this.volume
    this.master.connect(context.destination)
    return this.master
  }
}

/** Identifiants de la langue demandée ; une langue absente ou mal formée n'en a aucun. */
function clipIds(manifest: Record<string, unknown>, lang: string): string[] {
  const clips = manifest[lang]
  return isRecord(clips) ? Object.keys(clips) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampVolume(volume: number, fallback: number): number {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : fallback
}
