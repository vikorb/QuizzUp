import {
  type ButtonIndex,
  createGame,
  type EngineParticipant,
  type EngineTheme,
  type GameCommand,
  type GameEvent,
  type GameState,
  type GameTimings,
  reduceGame,
} from '@quizzup/game-engine'

/** Fréquence des ticks envoyés au moteur (l'écran de salle en envoie un toutes les 50 ms). */
const TICK_INTERVAL_MS = 20

export type LoggedEvent = { type: string; at: number; payload: Record<string, unknown> }

export type GameDriver = {
  start: () => void
  press: (podium: number, button: ButtonIndex, at?: number) => void
  state: () => GameState
  events: () => LoggedEvent[]
  stop: () => void
}

/**
 * Fait tourner le vrai moteur comme l'écran de salle : commandes horodatées avec
 * `performance.now()`, tick régulier, événements relayés aux écouteurs (audio, lumières).
 */
export function createGameDriver(options: {
  participants: EngineParticipant[]
  themes: EngineTheme[]
  roundsCount: number
  questionsPerRound: number
  timings?: Partial<GameTimings>
  onEvents: (events: GameEvent[]) => void
}): GameDriver {
  let state = createGame({
    seed: 42,
    participants: options.participants,
    themes: options.themes,
    roundsCount: options.roundsCount,
    questionsPerRound: options.questionsPerRound,
    timings: options.timings,
  })
  const log: LoggedEvent[] = []
  let ticker: ReturnType<typeof setInterval> | null = null

  function dispatch(command: GameCommand): void {
    const step = reduceGame(state, command)
    state = step.state
    if (step.events.length === 0) {
      return
    }
    for (const event of step.events) {
      log.push({ type: event.type, at: event.at, payload: { ...event.payload } })
    }
    options.onEvents(step.events)
  }

  return {
    start() {
      dispatch({ type: 'start', at: performance.now() })
      ticker = setInterval(
        () => dispatch({ type: 'tick', at: performance.now() }),
        TICK_INTERVAL_MS
      )
    },
    press(podium, button, at = performance.now()) {
      dispatch({ type: 'press', at, podium, button })
    },
    state: () => state,
    events: () => log,
    stop() {
      if (ticker !== null) {
        clearInterval(ticker)
        ticker = null
      }
    },
  }
}
