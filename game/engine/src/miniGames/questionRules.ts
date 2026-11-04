import {
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_MEDIA_TYPE_NONE,
} from '@quizzup/shared'

import type { ScoreLine } from '../draws'
import type { EngineAnswer, EngineParticipant, EngineQuestion } from '../types'

/**
 * Règles communes d'éligibilité des questions. Un type « vrai/faux » ou « estimation »
 * saisi au backoffice (`question.kind`) fait foi. « QCM » est le type par défaut en
 * base, y compris pour l'ancien contenu saisi avant le champ : on ne peut pas s'y fier
 * et l'on déduit alors le type des réponses, comme sans type.
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
  return text
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase()
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
    question.kind === QUESTION_KIND_ESTIMATE
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

/** Mot de comparaison explicite (« environ » ou « ~ » seuls ne bornent rien). */
const RANGE_WORD_PATTERN =
  /^(?:moins de|plus de|entre|de|au moins|au plus|jusqu'a|jusqu\u2019a|avant|apres|[<>\u2264\u2265])\s*-?\d|\b(?:ou|et) (?:moins|plus|avant|apres)\b/

/** Deux nombres croissants reliés (« 10 à 20 », « 10-20 ») : « 3-0 », un score, n'en est pas. */
const LINKED_NUMBERS_PATTERN = /(-?\d+(?:[.,]\d+)?)\s*(?:a|et|-|\u2013)\s*(-?\d+(?:[.,]\d+)?)/

function hasRangeMarker(text: string): boolean {
  const normalized = normalizeText(text).replaceAll(/(\d)[\s\u00A0\u202F](?=\d)/g, '$1')
  if (RANGE_WORD_PATTERN.test(normalized)) {
    return true
  }

  const linked = LINKED_NUMBERS_PATTERN.exec(normalized)
  if (!linked?.[1] || !linked[2]) {
    return false
  }

  return Number(linked[1].replace(',', '.')) < Number(linked[2].replace(',', '.'))
}

export function isRangeAnswer(answer: EngineAnswer): boolean {
  return RANGE_PATTERN.test(normalizeText(answer.text))
}

/**
 * Estimation : 3 ou 4 fourchettes chiffrées, une seule juste. Typée « estimation », il
 * suffit que chaque réponse commence par un nombre (pour les trier) ; sinon il faut en
 * plus au moins une vraie fourchette, pour que « 4 / 6 / 7 / 12 » ou des scores
 * (« 3-0 / 2-1 ») restent des QCM.
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

  if (question.kind === QUESTION_KIND_ESTIMATE) {
    return true
  }

  return (
    question.kind !== QUESTION_KIND_TRUE_FALSE &&
    question.answers.some((answer) => hasRangeMarker(answer.text))
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
