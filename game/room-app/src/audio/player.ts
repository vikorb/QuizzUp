/**
 * Port « lecteur d'extraits » de l'écran de salle. L'implémentation Web Audio
 * (décodage en mémoire, coupure précise au palier) est livrée par `game/audio` ;
 * ici on fixe le contrat et on fournit un lecteur silencieux qui respecte les
 * mêmes durées, pour le mode démo et les tests.
 */
export type PreloadResult = { loaded: string[]; failed: string[] }
export type PlayOutcome = 'ended' | 'stopped'

export type ExtractPlayer = {
  /** À appeler dans un geste utilisateur (bouton « Lancer la salle »). */
  unlock: () => Promise<void>
  preload: (
    urls: string[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<PreloadResult>
  /** Joue `durationMs` depuis `startSec` ; se résout à la fin du palier ou à l'arrêt. */
  play: (url: string, startSec: number, durationMs: number) => Promise<PlayOutcome>
  /** Met en pause et renvoie les millisecondes déjà jouées dans le palier. */
  pause: () => number
  resume: () => void
  stop: () => void
}

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
    preload: async (urls, onProgress) => {
      onProgress?.(urls.length, urls.length)
      return { loaded: [...urls], failed: [] }
    },
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
