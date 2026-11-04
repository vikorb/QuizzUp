import {
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  type QuestionMediaType,
} from '@quizzup/shared'

import type { ScoreLine } from '../draws'
import type { EngineAnswer, EngineParticipant, EngineQuestion } from '../types'

/**
 * Règles communes d'éligibilité des questions. Le backoffice n'a pas encore de
 * « type de question » (QCM, vrai/faux, estimation) : on le déduit du contenu.
 */

/** Médias affichables à l'écran pendant une question à lire (pas d'audio à jouer). */
const READABLE_MEDIA_TYPES: readonly QuestionMediaType[] = [
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_IMAGE,
]

export function hasPlayableAnswers(question: EngineQuestion, min = 2, max = 4): boolean {
  return (
    question.answers.length >= min &&
    question.answers.length <= max &&
    question.answers.some((answer) => answer.isCorrect)
  )
}

/** QCM classique : texte (ou image en illustration), 2 à 4 réponses, au moins une juste. */
export function isMultipleChoiceQuestion(question: EngineQuestion): boolean {
  return READABLE_MEDIA_TYPES.includes(question.mediaType) && hasPlayableAnswers(question)
}

/** Minuscules, sans accents ni espaces superflus : « Vrai », « VRAI » et « vrai » se valent. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .trim()
    .toLowerCase()
}

const TRUE_WORDS = new Set(['vrai', 'true'])
const FALSE_WORDS = new Set(['faux', 'false'])

export function isTrueAnswer(answer: EngineAnswer): boolean {
  return TRUE_WORDS.has(normalizeText(answer.text))
}

/** Vrai/faux : exactement deux réponses « Vrai » et « Faux », une seule juste. */
export function isTrueFalseQuestion(question: EngineQuestion): boolean {
  const [first, second] = question.answers

  if (question.answers.length !== 2 || !first || !second) {
    return false
  }

  const words = new Set([normalizeText(first.text), normalizeText(second.text)])
  const hasTrue = [...words].some((word) => TRUE_WORDS.has(word))
  const hasFalse = [...words].some((word) => FALSE_WORDS.has(word))

  return (
    READABLE_MEDIA_TYPES.includes(question.mediaType) &&
    hasTrue &&
    hasFalse &&
    question.answers.filter((answer) => answer.isCorrect).length === 1
  )
}

/** Premier nombre d'un texte (« Entre 1 000 et 2 000 » → 1000, « 1,5 m » → 1.5). */
export function parseLeadingNumber(text: string): number | null {
  // Séparateurs de milliers : espaces (« 1 000 ») ou point suivi de 3 chiffres (« 1.000 »).
  const compact = text
    .replaceAll(/(\d)[\s\u00A0\u202F](?=\d)/g, '$1')
    .replaceAll(/(?<![\d.])([1-9]\d{0,2})\.(?=\d{3}(?!\d))/g, '$1')
  const match = /-?\d+(?:[.,]\d+)?/.exec(compact)

  return match ? Number(match[0].replace(',', '.')) : null
}

/**
 * Une fourchette commence par un nombre, éventuellement précédé d'un mot de
 * comparaison (« Moins de 50 », « Entre 10 et 20 », « < 5 ») : « Henri 4 » ou
 * « Louis 14 » restent des réponses de QCM.
 */
const RANGE_PATTERN =
  /^(?:(?:moins de|plus de|entre|de|environ|au moins|au plus|jusqu'a|jusqu’a|[<>≤≥~])\s*)?-?\d/

export function isRangeAnswer(answer: EngineAnswer): boolean {
  return RANGE_PATTERN.test(normalizeText(answer.text))
}

/** Estimation : 3 ou 4 fourchettes chiffrées, une seule juste. */
export function isEstimateQuestion(question: EngineQuestion): boolean {
  return (
    READABLE_MEDIA_TYPES.includes(question.mediaType) &&
    hasPlayableAnswers(question, 3, 4) &&
    question.answers.filter((answer) => answer.isCorrect).length === 1 &&
    question.answers.every((answer) => isRangeAnswer(answer))
  )
}

export function getScore(scores: ScoreLine[], participantId: number): number {
  return scores.find((line) => line.participantId === participantId)?.score ?? 0
}

export function getParticipantIds(participants: EngineParticipant[]): number[] {
  return participants.map((participant) => participant.id)
}

/** Points perdus, bornés au score du joueur : un score ne descend jamais sous zéro. */
export function cappedLoss(stake: number, available: number): number {
  return 0 - Math.min(stake, Math.max(0, available))
}
