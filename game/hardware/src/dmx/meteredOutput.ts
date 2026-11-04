import type { Clock } from '../clock'
import { browserClock } from '../clock'
import type { DmxOutput } from './output'

export type OutputStats = {
  /** Trames de jeu acceptées par l'interface depuis l'ouverture (comptées sur l'univers 0). */
  framesSent: number
  /** Écritures en échec. */
  failures: number
  /** Trames par seconde réellement envoyées sur la dernière seconde glissante. */
  measuredHz: number
  /** Durée moyenne et maximale d'une écriture (ms) : révèle une interface lente ou saturée. */
  averageWriteMs: number
  maxWriteMs: number
  /** Temps écoulé depuis la dernière trame acceptée (ms), `null` si aucune. */
  sinceLastFrameMs: number | null
  lastError: string | null
}

export type MeteredOutput = DmxOutput & {
  getStats: () => OutputStats
  resetStats: () => void
}

const WINDOW_MS = 1_000
const MAX_SAMPLES = 512

/**
 * Enveloppe une sortie DMX pour mesurer ce qui part vraiment : fréquence réelle, durée des
 * écritures, échecs. Base de l'écran de diagnostic (« l'interface reçoit-elle bien 30 trames/s ? »).
 */
export function createMeteredOutput(output: DmxOutput, clock: Clock = browserClock): MeteredOutput {
  let sent: number[] = []
  let framesSent = 0
  let writes = 0
  let failures = 0
  let totalWriteMs = 0
  let maxWriteMs = 0
  let lastFrameAt: number | null = null
  let lastError: string | null = null

  const reset = () => {
    sent = []
    framesSent = 0
    writes = 0
    failures = 0
    totalWriteMs = 0
    maxWriteMs = 0
    lastFrameAt = null
    lastError = null
  }

  return {
    driver: output.driver,
    ...(output.universeCount ? { universeCount: () => output.universeCount!() } : {}),
    async open() {
      reset()
      await output.open()
    },
    async write(data, universe = 0) {
      const startedAt = clock.now()
      try {
        await output.write(data, universe)
      } catch (error) {
        failures += 1
        lastError = error instanceof Error ? error.message : String(error)
        throw error
      }
      const now = clock.now()
      const duration = now - startedAt
      totalWriteMs += duration
      maxWriteMs = Math.max(maxWriteMs, duration)
      lastFrameAt = now
      // La cadence se mesure sur l'univers 0 (toujours émis) : N univers = toujours 1 trame de jeu.
      if (universe === 0) {
        framesSent += 1
        sent.push(now)
        if (sent.length > MAX_SAMPLES) {
          sent = sent.slice(-MAX_SAMPLES)
        }
      }
      writes += 1
    },
    close: () => output.close(),
    onDisconnect: output.onDisconnect,
    getStats() {
      const now = clock.now()
      const recent = sent.filter((at) => now - at <= WINDOW_MS)
      return {
        framesSent,
        failures,
        measuredHz: recent.length,
        averageWriteMs: writes === 0 ? 0 : totalWriteMs / writes,
        maxWriteMs,
        sinceLastFrameMs: lastFrameAt === null ? null : now - lastFrameAt,
        lastError,
      }
    },
    resetStats: reset,
  }
}
