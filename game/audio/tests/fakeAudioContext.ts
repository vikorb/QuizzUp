/**
 * Faux AudioContext maison pour les tests : horloge contrôlable (`advance`), sources et
 * oscillateurs qui enregistrent leurs appels et déclenchent `onended` quand l'horloge atteint
 * leur fin planifiée, faux GainNode/AudioParam et faux `decodeAudioData`.
 *
 * Format des faux fichiers audio : le texte `duration:<secondes>` ; tout autre contenu fait
 * échouer le décodage.
 */

type ParamEvent = { type: 'set' | 'linear' | 'exponential' | 'cancel'; value: number; time: number }

export class FakeAudioParam {
  value: number
  readonly events: ParamEvent[] = []

  constructor(value = 1) {
    this.value = value
  }

  setValueAtTime(value: number, time: number): this {
    this.events.push({ type: 'set', value, time })
    return this
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ type: 'linear', value, time })
    return this
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.events.push({ type: 'exponential', value, time })
    return this
  }

  cancelScheduledValues(time: number): this {
    this.events.push({ type: 'cancel', value: 0, time })
    return this
  }
}

class FakeNode {
  readonly connections: unknown[] = []
  disconnectCount = 0

  constructor(readonly context: FakeAudioContext) {}

  connect<T>(destination: T): T {
    this.connections.push(destination)
    return destination
  }

  disconnect(): void {
    this.disconnectCount++
  }
}

export class FakeGainNode extends FakeNode {
  readonly gain = new FakeAudioParam(1)
}

export class FakeAudioBuffer {
  constructor(readonly duration: number) {}
}

type StartCall = { when: number; offset: number; duration: number | undefined }

/** Base commune des nœuds planifiables (source de buffer, oscillateur). */
class FakeScheduledNode extends FakeNode {
  onended: (() => void) | null = null
  startCall: StartCall | null = null
  stopTime: number | null = null
  ended = false

  stop(when = 0): void {
    this.stopTime = Math.max(when, this.context.currentTime)
  }

  naturalEnd(): number {
    return Number.POSITIVE_INFINITY
  }

  scheduledEnd(): number {
    if (!this.startCall) return Number.POSITIVE_INFINITY
    return Math.min(this.naturalEnd(), this.stopTime ?? Number.POSITIVE_INFINITY)
  }
}

export class FakeBufferSource extends FakeScheduledNode {
  buffer: FakeAudioBuffer | null = null

  start(when = 0, offset = 0, duration?: number): void {
    this.startCall = { when, offset, duration }
  }

  override naturalEnd(): number {
    if (!this.startCall || !this.buffer) return Number.POSITIVE_INFINITY
    const { when, offset, duration } = this.startCall
    const available = Math.max(0, this.buffer.duration - offset)
    return when + Math.min(duration ?? Number.POSITIVE_INFINITY, available)
  }
}

export class FakeOscillator extends FakeScheduledNode {
  type: OscillatorType = 'sine'
  readonly frequency = new FakeAudioParam(440)

  start(when = 0): void {
    this.startCall = { when, offset: 0, duration: undefined }
  }
}

export class FakeAudioContext {
  currentTime = 0
  state: AudioContextState = 'suspended'
  readonly destination = { kind: 'destination' }
  readonly sources: FakeBufferSource[] = []
  readonly oscillators: FakeOscillator[] = []
  readonly gains: FakeGainNode[] = []
  resumeCalls = 0
  decodeCalls = 0

  async resume(): Promise<void> {
    this.resumeCalls++
    this.state = 'running'
  }

  createGain(): FakeGainNode {
    const node = new FakeGainNode(this)
    this.gains.push(node)
    return node
  }

  createBufferSource(): FakeBufferSource {
    const node = new FakeBufferSource(this)
    this.sources.push(node)
    return node
  }

  createOscillator(): FakeOscillator {
    const node = new FakeOscillator(this)
    this.oscillators.push(node)
    return node
  }

  async decodeAudioData(data: ArrayBuffer): Promise<FakeAudioBuffer> {
    this.decodeCalls++
    const match = /^duration:([\d.]+)$/.exec(new TextDecoder().decode(data))
    if (!match) throw new Error('EncodingError: impossible de décoder')
    return new FakeAudioBuffer(Number(match[1]))
  }

  /** Avance l'horloge audio et déclenche `onended` des nœuds arrivés au bout, dans l'ordre. */
  advance(seconds: number): void {
    this.currentTime = Math.round((this.currentTime + seconds) * 1e9) / 1e9
    const due = [...this.sources, ...this.oscillators]
      .filter((node) => !node.ended && node.scheduledEnd() <= this.currentTime)
      .sort((a, b) => a.scheduledEnd() - b.scheduledEnd())
    for (const node of due) {
      node.ended = true
      node.onended?.()
    }
  }

  /** Sources effectivement lancées (start appelé). */
  startedSources(): FakeBufferSource[] {
    return this.sources.filter((source) => source.startCall !== null)
  }

  lastSource(): FakeBufferSource {
    const source = this.sources.at(-1)
    if (!source) throw new Error('aucune source créée')
    return source
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext
  }
}

export function audioResponse(durationSec: number): Response {
  return new Response(`duration:${durationSec}`)
}

/** Fetch contrôlé à la main : chaque appel reste en attente jusqu'à `respond`/`fail`. */
export class ControlledFetch {
  readonly calls: string[] = []
  private readonly pending = new Map<
    string,
    { resolve: (response: Response) => void; reject: (error: Error) => void }
  >()

  readonly fetch = (url: string): Promise<Response> => {
    this.calls.push(url)
    return new Promise<Response>((resolve, reject) => {
      this.pending.set(url, { resolve, reject })
    })
  }

  inFlight(): string[] {
    return [...this.pending.keys()]
  }

  respond(url: string, response: Response): void {
    this.take(url).resolve(response)
  }

  fail(url: string, error = new Error('réseau indisponible')): void {
    this.take(url).reject(error)
  }

  private take(url: string) {
    const entry = this.pending.get(url)
    if (!entry) throw new Error(`aucun fetch en attente pour ${url}`)
    this.pending.delete(url)
    return entry
  }
}

/** Fetch immédiat à partir d'une table : nombre = durée du fichier, sinon statut ou erreur. */
export function tableFetch(table: Record<string, number | 'corrupt' | 'network' | 404>) {
  const calls: string[] = []
  const fetch = async (url: string): Promise<Response> => {
    calls.push(url)
    const entry = table[url]
    if (entry === undefined || entry === 404) return new Response('not found', { status: 404 })
    if (entry === 'network') throw new TypeError('Failed to fetch')
    if (entry === 'corrupt') return new Response('garbage')
    return audioResponse(entry)
  }
  return { fetch, calls }
}

/** Laisse passer les microtâches et les lectures de corps de Response. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Observe l'état d'une promesse sans l'attendre. */
export function track<T>(promise: Promise<T>) {
  const state: { settled: boolean; value?: T; error?: unknown } = { settled: false }
  promise.then(
    (value) => {
      state.settled = true
      state.value = value
    },
    (error: unknown) => {
      state.settled = true
      state.error = error
    }
  )
  return state
}
