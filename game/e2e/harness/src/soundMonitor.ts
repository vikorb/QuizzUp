/**
 * Écoute ce qui sort réellement vers les haut-parleurs : chaque connexion vers
 * `context.destination` est doublée vers un analyseur, échantillonné toutes les
 * 5 ms. On en déduit les plages de son audible (début / fin en `performance.now()`).
 */
export type SoundSegment = { start: number; end: number | null }

const SAMPLE_INTERVAL_MS = 5
/** Niveau RMS au-dessus duquel on considère qu'un son est audible. */
const AUDIBLE_RMS = 0.02

export type SoundMonitor = {
  segments: () => SoundSegment[]
  isAudible: () => boolean
}

export function installSoundMonitor(): SoundMonitor {
  const analysers = new Map<BaseAudioContext, AnalyserNode>()
  const segments: SoundSegment[] = []
  const nativeConnect = AudioNode.prototype.connect as (
    this: AudioNode,
    destination: AudioNode | AudioParam,
    output?: number,
    input?: number
  ) => AudioNode | undefined

  function analyserFor(context: BaseAudioContext): AnalyserNode {
    let analyser = analysers.get(context)
    if (!analyser) {
      analyser = context.createAnalyser()
      analyser.fftSize = 256
      analysers.set(context, analyser)
    }
    return analyser
  }

  AudioNode.prototype.connect = function connect(
    this: AudioNode,
    destination: AudioNode | AudioParam,
    output?: number,
    input?: number
  ) {
    if (destination === this.context.destination) {
      nativeConnect.call(this, analyserFor(this.context))
    }
    return nativeConnect.call(this, destination, output, input)
  } as typeof AudioNode.prototype.connect

  let audible = false
  const buffer = new Float32Array(256)

  setInterval(() => {
    let level = 0
    for (const analyser of analysers.values()) {
      analyser.getFloatTimeDomainData(buffer)
      let sum = 0
      for (const sample of buffer) {
        sum += sample * sample
      }
      level = Math.max(level, Math.sqrt(sum / buffer.length))
    }

    const now = performance.now()
    if (!audible && level >= AUDIBLE_RMS) {
      audible = true
      segments.push({ start: now, end: null })
    } else if (audible && level < AUDIBLE_RMS) {
      audible = false
      const current = segments.at(-1)
      if (current) {
        current.end = now
      }
    }
  }, SAMPLE_INTERVAL_MS)

  return {
    segments: () => segments.map((segment) => ({ ...segment })),
    isAudible: () => audible,
  }
}
