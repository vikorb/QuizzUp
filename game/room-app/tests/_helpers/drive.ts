import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'

import type { GameSession } from '@/game/session'

import type { createManualClock } from './fixtures'

type Clock = ReturnType<typeof createManualClock>

/** Fait avancer une partie démarrée jusqu'à la première question (thème A choisi). */
export function driveToQuestion(session: GameSession, clock: Clock): void {
  clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
  session.tick()

  const round = session.state.rounds.at(-1)
  const chooser = session.participants.find(
    (participant) => participant.id === round?.chooserParticipantId
  )

  clock.advance(10)
  session.press(chooser?.podium ?? 1, 0)
}

/** Index (0-3) de la bonne réponse de la question en cours. */
export function correctButton(session: GameSession): 0 | 1 | 2 | 3 {
  const { phase } = session.state
  if (phase.name !== 'question') {
    throw new Error(`not in question: ${phase.name}`)
  }
  return phase.miniGameState.question.answers.findIndex((answer) => answer.isCorrect) as
    0 | 1 | 2 | 3
}
