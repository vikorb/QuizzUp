import { performance } from 'node:perf_hooks'

export type TimerHandle = ReturnType<typeof setTimeout>

/**
 * Horloge injectable (même forme que `game/hardware/src/clock.ts`) : `now()` en millisecondes
 * monotones. Remplacée par une horloge manuelle en test (chien de garde).
 */
export type Clock = {
  now: () => number
  setInterval: (callback: () => void, ms: number) => TimerHandle
  clearInterval: (handle: TimerHandle) => void
  setTimeout: (callback: () => void, ms: number) => TimerHandle
  clearTimeout: (handle: TimerHandle) => void
}

export const systemClock: Clock = {
  now: () => performance.now(),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle),
}
