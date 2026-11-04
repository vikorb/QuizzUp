import { MINI_GAME_FIRST_BUZZ } from '@quizzup/shared'

import { type BuzzToAnswerState, createBuzzToAnswerMiniGame } from './buzzToAnswer'
import { cappedLoss, isMultipleChoiceQuestion } from './questionRules'

/**
 * Premier buzz : la question s'affiche, le premier qui buzze (n'importe quel
 * bouton) répond seul avec A-D. Juste = 100 points. Faux ou trop lent = 25 points
 * de pénalité (sans passer sous zéro) et bloqué : la main passe aux autres.
 */
export const FIRST_BUZZ_WINDOW_MS = 15_000
export const FIRST_BUZZ_ANSWER_TIMEOUT_MS = 5000
export const FIRST_BUZZ_POINTS = 100
export const FIRST_BUZZ_PENALTY = 25

export type FirstBuzzState = BuzzToAnswerState<typeof MINI_GAME_FIRST_BUZZ>

export const firstBuzz = createBuzzToAnswerMiniGame({
  id: MINI_GAME_FIRST_BUZZ,
  windowMs: FIRST_BUZZ_WINDOW_MS,
  answerTimeoutMs: FIRST_BUZZ_ANSWER_TIMEOUT_MS,
  isQuestionEligible: isMultipleChoiceQuestion,
  pointsForCorrect: () => FIRST_BUZZ_POINTS,
  pointsForWrong: (scoreAtStart) => cappedLoss(FIRST_BUZZ_PENALTY, scoreAtStart),
})
