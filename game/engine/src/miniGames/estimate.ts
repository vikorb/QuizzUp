import { MINI_GAME_ESTIMATE } from '@quizzup/shared'

import type { EngineAnswer } from '../types'
import { getParticipantIds, isEstimateQuestion, parseLeadingNumber } from './questionRules'
import {
  choiceRecord,
  createSimultaneousMiniGame,
  isChoiceCorrect,
  type SimultaneousState,
} from './simultaneous'

/**
 * Estimation : question chiffrée, 3 ou 4 fourchettes affichées dans l'ordre
 * croissant (A = la plus petite). Tout le monde répond en même temps : la bonne
 * fourchette rapporte 100 points, une fourchette voisine 30 (on était proche).
 */
export const ESTIMATE_DURATION_MS = 20_000
export const ESTIMATE_POINTS = 100
export const ESTIMATE_NEIGHBOUR_POINTS = 30

/** Fourchettes triées par leur premier nombre (ordre stable à égalité). */
export function sortRanges(answers: EngineAnswer[]): EngineAnswer[] {
  return answers
    .map((answer, index) => ({ answer, index, value: parseLeadingNumber(answer.text) ?? 0 }))
    .sort((first, second) => first.value - second.value || first.index - second.index)
    .map((item) => item.answer)
}

export type EstimateState = SimultaneousState<typeof MINI_GAME_ESTIMATE, null>

export const estimate = createSimultaneousMiniGame({
  id: MINI_GAME_ESTIMATE,
  durationMs: ESTIMATE_DURATION_MS,
  isQuestionEligible: isEstimateQuestion,
  arrangeAnswers: sortRanges,
  prepare: (participants) => ({ playerIds: getParticipantIds(participants), extra: null }),
  score: (answering) => {
    const { answers } = answering.question
    const correctIndex = answers.findIndex((answer) => answer.isCorrect)

    return answering.choices.map((choice) => {
      if (isChoiceCorrect(answering.question, choice)) {
        return choiceRecord(answering, choice, ESTIMATE_POINTS)
      }

      const distance = Math.abs(choice.button - correctIndex)

      return choiceRecord(answering, choice, distance === 1 ? ESTIMATE_NEIGHBOUR_POINTS : 0)
    })
  },
})
