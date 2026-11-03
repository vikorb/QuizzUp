export type TimerHandle = ReturnType<typeof setTimeout>

/**
 * Horloge injectable : `now()` en millisecondes monotones (même base que `performance.now()`,
 * donc la même que les `at` envoyés au moteur de jeu). Remplacée par une horloge manuelle en test.
 */
export type Clock = {
  now: () => number
  setInterval: (callback: () => void, ms: number) => TimerHandle
  clearInterval: (handle: TimerHandle) => void
  setTimeout: (callback: () => void, ms: number) => TimerHandle
  clearTimeout: (handle: TimerHandle) => void
}

export const browserClock: Clock = {
  now: () => performance.now(),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle),
}
