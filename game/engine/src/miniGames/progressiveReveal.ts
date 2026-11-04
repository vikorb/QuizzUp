import { MINI_GAME_PROGRESSIVE_REVEAL, QUESTION_MEDIA_TYPE_IMAGE } from '@quizzup/shared'

import { type BuzzToAnswerState, createBuzzToAnswerMiniGame } from './buzzToAnswer'
import { hasPlayableAnswers } from './questionRules'

/**
 * Révélation progressive : une image floue se dévoile pendant 20 s. Le premier
 * qui buzze fige l'image et répond seul avec A-D. Plus on trouve tôt, plus on
 * gagne (100 → 20 points). Faux = bloqué pour l'image, sans pénalité.
 */
export const PROGRESSIVE_REVEAL_WINDOW_MS = 20_000
export const PROGRESSIVE_REVEAL_ANSWER_TIMEOUT_MS = 5000
export const PROGRESSIVE_REVEAL_MAX_POINTS = 100
export const PROGRESSIVE_REVEAL_MIN_POINTS = 20

export function getProgressiveRevealPoints(elapsedMs: number): number {
  const ratio = Math.min(1, Math.max(0, elapsedMs / PROGRESSIVE_REVEAL_WINDOW_MS))

  return Math.round(
    PROGRESSIVE_REVEAL_MAX_POINTS -
      (PROGRESSIVE_REVEAL_MAX_POINTS - PROGRESSIVE_REVEAL_MIN_POINTS) * ratio
  )
}

export type ProgressiveRevealState = BuzzToAnswerState<typeof MINI_GAME_PROGRESSIVE_REVEAL>

export const progressiveReveal = createBuzzToAnswerMiniGame({
  id: MINI_GAME_PROGRESSIVE_REVEAL,
  windowMs: PROGRESSIVE_REVEAL_WINDOW_MS,
  answerTimeoutMs: PROGRESSIVE_REVEAL_ANSWER_TIMEOUT_MS,
  isQuestionEligible: (question) =>
    question.mediaType === QUESTION_MEDIA_TYPE_IMAGE &&
    Boolean(question.mediaUrl) &&
    hasPlayableAnswers(question),
  pointsForCorrect: (elapsedMs) => getProgressiveRevealPoints(elapsedMs),
  pointsForWrong: () => 0,
})
