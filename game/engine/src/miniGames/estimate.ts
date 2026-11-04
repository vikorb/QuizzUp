import { MINI_GAME_ESTIMATE } from '@quizzup/shared'

import type { EngineAnswer } from '../types'
import {
  getParticipantIds,
  isEstimateQuestion,
  normalizeText,
  parseLeadingNumber,
} from './questionRules'
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

/**
 * Valeur de tri d'une fourchette : « Moins de 10 » passe avant « Entre 10 et 50 »,
 * « Plus de 50 » / « 50 ou plus » après « Entre 10 et 50 ».
 */
export function getRangeSortValue(text: string): number {
  const value = parseLeadingNumber(text) ?? 0
  const normalized = normalizeText(text)

  if (/^(?:moins de|au plus|jusqu['’]a|[<≤])/.test(normalized) || normalized.includes('ou moins')) {
    return value - 0.5
  }

  if (/^(?:plus de|au moins|[>≥])/.test(normalized) || normalized.includes('ou plus')) {
    return value + 0.5
  }

  return value
}

/** Fourchettes triées de la plus petite à la plus grande (ordre stable à égalité). */
export function sortRanges(answers: EngineAnswer[]): EngineAnswer[] {
  return answers
    .map((answer, index) => ({ answer, index, value: getRangeSortValue(answer.text) }))
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
