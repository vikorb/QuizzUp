import { MINI_GAME_QUICK_ANSWER } from '@quizzup/shared'

import { getParticipantIds, isMultipleChoiceQuestion } from './questionRules'
import {
  choiceRecord,
  createSimultaneousMiniGame,
  isChoiceCorrect,
  type SimultaneousState,
} from './simultaneous'

/**
 * Rapidité : tout le monde répond en même temps avec A-D. Une bonne réponse
 * rapporte de 100 points (réponse immédiate) à 20 points (dernière seconde).
 * Pas de pénalité ; seule la première réponse de chaque joueur compte.
 */
export const QUICK_ANSWER_DURATION_MS = 15_000
export const QUICK_ANSWER_MAX_POINTS = 100
export const QUICK_ANSWER_MIN_POINTS = 20

/** Points d'une bonne réponse donnée `elapsedMs` après le début de la question. */
export function getQuickAnswerPoints(elapsedMs: number): number {
  const ratio = Math.min(1, Math.max(0, elapsedMs / QUICK_ANSWER_DURATION_MS))

  return Math.round(
    QUICK_ANSWER_MAX_POINTS - (QUICK_ANSWER_MAX_POINTS - QUICK_ANSWER_MIN_POINTS) * ratio
  )
}

export type QuickAnswerState = SimultaneousState<typeof MINI_GAME_QUICK_ANSWER, null>

export const quickAnswer = createSimultaneousMiniGame({
  id: MINI_GAME_QUICK_ANSWER,
  durationMs: QUICK_ANSWER_DURATION_MS,
  isQuestionEligible: isMultipleChoiceQuestion,
  prepare: (participants) => ({ playerIds: getParticipantIds(participants), extra: null }),
  score: (answering) =>
    answering.choices.map((choice) =>
      choiceRecord(
        answering,
        choice,
        isChoiceCorrect(answering.question, choice)
          ? getQuickAnswerPoints(choice.at - answering.startedAt)
          : 0
      )
    ),
})
