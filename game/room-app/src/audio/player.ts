import type { ExtractPlayer, PlayOutcome } from '@quizzup/audio'

/**
 * Port « lecteur d'extraits » de l'écran de salle. Le contrat et le lecteur Web
 * Audio (décodage en mémoire, coupure précise au palier) viennent de `game/audio` ;
 * ici on fournit un lecteur silencieux qui respecte les mêmes durées, pour les tests.
 */
export type { ExtractPlayer, PlayOutcome, PreloadResult } from '@quizzup/audio'

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

/** Lecteur sans son : simule la durée des paliers (mode démo, tests). */
export function createSilentExtractPlayer(scheduler: Scheduler = DEFAULT_SCHEDULER): ExtractPlayer {
  let resolveCurrent: ((outcome: PlayOutcome) => void) | null = null
  let timer: unknown = null
  let startedAt = 0
  let playedBeforePause = 0
  let durationMs = 0
  let paused = false

  function settle(outcome: PlayOutcome): void {
    if (timer !== null) {
      scheduler.clearTimeout(timer)
      timer = null
    }
    const resolve = resolveCurrent
    resolveCurrent = null
    resolve?.(outcome)
  }

  function schedule(remainingMs: number): void {
    startedAt = scheduler.now()
    timer = scheduler.setTimeout(() => settle('ended'), Math.max(0, remainingMs))
  }

  return {
    unlock: async () => undefined,
    preload: async (urls, options) => {
      options?.onProgress?.(urls.length, urls.length)
      return { loaded: [...urls], failed: [] }
    },
    isLoaded: () => true,
    release: () => undefined,
    play(_url, _startSec, duration) {
      settle('stopped')
      durationMs = duration
      playedBeforePause = 0
      paused = false

      return new Promise<PlayOutcome>((resolve) => {
        resolveCurrent = resolve
        schedule(duration)
      })
    },
    pause() {
      if (!resolveCurrent || paused) {
        return playedBeforePause
      }
      paused = true
      playedBeforePause += scheduler.now() - startedAt
      if (timer !== null) {
        scheduler.clearTimeout(timer)
        timer = null
      }
      return playedBeforePause
    },
    resume() {
      if (!resolveCurrent || !paused) {
        return
      }
      paused = false
      schedule(durationMs - playedBeforePause)
    },
    stop() {
      paused = false
      settle('stopped')
    },
  }
}
