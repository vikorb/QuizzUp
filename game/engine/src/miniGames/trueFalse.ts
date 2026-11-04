import { MINI_GAME_TRUE_FALSE } from '@quizzup/shared'

import { getParticipantIds, isTrueAnswer, isTrueFalseQuestion } from './questionRules'
import {
  choiceRecord,
  createSimultaneousMiniGame,
  isChoiceCorrect,
  type SimultaneousState,
} from './simultaneous'

/**
 * Vrai ou faux éclair : rafale d'affirmations, A = vrai, B = faux, tout le monde
 * répond en même temps. Peu de temps, révélation courte, points fixes.
 */
export const TRUE_FALSE_DURATION_MS = 6000
export const TRUE_FALSE_REVEAL_MS = 2500
export const TRUE_FALSE_POINTS = 50

export type TrueFalseState = SimultaneousState<typeof MINI_GAME_TRUE_FALSE, null>

export const trueFalse = createSimultaneousMiniGame({
  id: MINI_GAME_TRUE_FALSE,
  durationMs: TRUE_FALSE_DURATION_MS,
  revealMs: TRUE_FALSE_REVEAL_MS,
  isQuestionEligible: isTrueFalseQuestion,
  // Toujours A = vrai, B = faux : pas de mélange.
  arrangeAnswers: (answers) => [
    ...answers.filter((answer) => isTrueAnswer(answer)),
    ...answers.filter((answer) => !isTrueAnswer(answer)),
  ],
  prepare: (participants) => ({ playerIds: getParticipantIds(participants), extra: null }),
  score: (answering) =>
    answering.choices.map((choice) =>
      choiceRecord(
        answering,
        choice,
        isChoiceCorrect(answering.question, choice) ? TRUE_FALSE_POINTS : 0
      )
    ),
})
