import {
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_MEDIA_TYPE_NONE,
} from '@quizzup/shared'

import type { ScoreLine } from '../draws'
import type { EngineAnswer, EngineParticipant, EngineQuestion } from '../types'

/**
 * Règles communes d'éligibilité des questions. Le type saisi au backoffice
 * (`question.kind`) fait foi ; sans lui (ancien contenu), on le déduit des réponses.
 *
 * Les questions à image sont réservées à la révélation progressive : affichée nette
 * dans un autre mini-jeu, l'image donnerait souvent la réponse.
 */

export function hasPlayableAnswers(question: EngineQuestion, min = 2, max = 4): boolean {
  return (
    question.answers.length >= min &&
    question.answers.length <= max &&
    question.answers.some((answer) => answer.isCorrect)
  )
}

function hasSingleCorrectAnswer(question: EngineQuestion): boolean {
  return question.answers.filter((answer) => answer.isCorrect).length === 1
}

/** Question à lire, sans média : seul le texte est affiché à l'écran. */
function isTextQuestion(question: EngineQuestion): boolean {
  return question.mediaType === QUESTION_MEDIA_TYPE_NONE
}

/** QCM classique : question texte, 2 à 4 réponses, au moins une juste (quel que soit le type). */
export function isMultipleChoiceQuestion(question: EngineQuestion): boolean {
  return isTextQuestion(question) && hasPlayableAnswers(question)
}

/** Minuscules, sans accents ni espaces superflus : « Vrai », « VRAI » et « vrai » se valent. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replaceAll(/[̀-ͯ]/g, '').trim().toLowerCase()
}

const TRUE_WORDS = new Set(['vrai', 'true'])
const FALSE_WORDS = new Set(['faux', 'false'])

export function isTrueAnswer(answer: EngineAnswer): boolean {
  return TRUE_WORDS.has(normalizeText(answer.text))
}

/**
 * Vrai/faux : exactement deux réponses « Vrai » et « Faux » (A = Vrai à l'écran), une
 * seule juste. Une question typée autrement au backoffice n'en est pas une.
 */
export function isTrueFalseQuestion(question: EngineQuestion): boolean {
  const [first, second] = question.answers

  if (
    question.answers.length !== 2 ||
    !first ||
    !second ||
    (question.kind !== undefined && question.kind !== QUESTION_KIND_TRUE_FALSE)
  ) {
    return false
  }

  const words = new Set([normalizeText(first.text), normalizeText(second.text)])
  const hasTrue = [...words].some((word) => TRUE_WORDS.has(word))
  const hasFalse = [...words].some((word) => FALSE_WORDS.has(word))

  return isTextQuestion(question) && hasTrue && hasFalse && hasSingleCorrectAnswer(question)
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

/** Mots de comparaison qui ouvrent une fourchette (texte normalisé, sans accents). */
const RANGE_PREFIX =
  "moins de|plus de|entre|de|environ|au moins|au plus|jusqu'a|jusqu’a|avant|apres|[<>≤≥~]"

/**
 * Une fourchette commence par un nombre, éventuellement précédé d'un mot de
 * comparaison (« Moins de 50 », « Entre 10 et 20 », « Avant 1800 », « < 5 ») :
 * « Henri 4 » ou « Louis 14 » restent des réponses de QCM.
 */
const RANGE_PATTERN = new RegExp(String.raw`^(?:(?:${RANGE_PREFIX})\s*)?-?\d`)

/** Bornes explicites : un mot de comparaison, ou deux nombres reliés (« 10 à 20 », « 10-20 »). */
const RANGE_MARKER_PATTERN = new RegExp(
  String.raw`^(?:${RANGE_PREFIX})|\bou (?:moins|plus)\b|\d\s*(?:a|et|-|–)\s*\d`
)

export function isRangeAnswer(answer: EngineAnswer): boolean {
  return RANGE_PATTERN.test(normalizeText(answer.text))
}

/**
 * Estimation : 3 ou 4 fourchettes chiffrées, une seule juste. Typée au backoffice, il
 * suffit que chaque réponse commence par un nombre (pour les trier) ; sans type, il faut
 * en plus au moins une vraie fourchette, sinon « 4 / 6 / 7 / 12 » serait pris pour une
 * estimation alors que c'est un QCM.
 */
export function isEstimateQuestion(question: EngineQuestion): boolean {
  if (
    !isTextQuestion(question) ||
    !hasPlayableAnswers(question, 3, 4) ||
    !hasSingleCorrectAnswer(question) ||
    !question.answers.every((answer) => isRangeAnswer(answer))
  ) {
    return false
  }

  if (question.kind !== undefined) {
    return question.kind === QUESTION_KIND_ESTIMATE
  }

  return question.answers.some((answer) => RANGE_MARKER_PATTERN.test(normalizeText(answer.text)))
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
