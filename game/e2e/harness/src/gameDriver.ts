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
import { MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'

/** Bonne réponse et une mauvaise réponse de la question en cours, dans l'ordre A-D du moteur. */
export function answerButtons(state: GameState): { correct: ButtonIndex; wrong: ButtonIndex } {
  const { phase } = state
  if (phase.name !== 'question' || phase.miniGameState.kind !== MINI_GAME_FLASH_BLIND_TEST) {
    throw new Error(`Pas de question de blind test éclair en cours (phase ${phase.name})`)
  }
  const { miniGameState } = phase
  // Tous les mini-jeux n'ont pas une question unique (paris du quitte ou double…).
  if (!('question' in miniGameState)) {
    throw new Error(`Mini-jeu sans question à choix : ${miniGameState.kind}`)
  }
  const { answers } = miniGameState.question
  const correct = answers.findIndex((answer) => answer.isCorrect)
  const wrong = answers.findIndex((answer) => !answer.isCorrect)
  if (correct < 0 || wrong < 0) {
    throw new Error('La question doit avoir une bonne et une mauvaise réponse')
  }
  return { correct: correct as ButtonIndex, wrong: wrong as ButtonIndex }
}

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
    // Le banc ne joue que le blind test éclair (audio, lumières des paliers).
    miniGames: [MINI_GAME_FLASH_BLIND_TEST],
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
