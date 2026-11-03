import {
  ROUND_CHOOSER_REASON_FALLBACK_RANDOM,
  ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM,
  ROUND_CHOOSER_REASON_RANDOM_EXCLUDING_LEADER,
  type RoundChooserReason,
} from '@quizzup/shared'

import { drawMany, pickOne, type Random } from './random'
import type { EngineQuestion, EngineTheme } from './types'

export type ScoreLine = {
  participantId: number
  score: number
}

export type ChooserDraw = {
  participantId: number
  reason: RoundChooserReason
}

export function getLeaderIds(scores: ScoreLine[]): number[] {
  if (scores.length === 0) {
    return []
  }

  const best = Math.max(...scores.map((line) => line.score))

  return scores.filter((line) => line.score === best).map((line) => line.participantId)
}

/**
 * Désigne le joueur qui choisit le thème de la manche :
 * - manche 1 : au hasard parmi tous ;
 * - ensuite : au hasard en excluant le ou les leaders, pour que le premier au
 *   score ne choisisse pas toujours ;
 * - si tout le monde est à égalité en tête : repli au hasard parmi tous.
 */
export function drawRoundChooser(
  scores: ScoreLine[],
  roundPosition: number,
  random: Random
): ChooserDraw | null {
  const everyone = scores.map((line) => line.participantId)

  if (roundPosition <= 1) {
    const participantId = pickOne(everyone, random)

    return participantId === undefined
      ? null
      : { participantId, reason: ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM }
  }

  const leaderIds = getLeaderIds(scores)
  const challengers = everyone.filter((participantId) => !leaderIds.includes(participantId))

  if (challengers.length === 0) {
    const participantId = pickOne(everyone, random)

    return participantId === undefined
      ? null
      : { participantId, reason: ROUND_CHOOSER_REASON_FALLBACK_RANDOM }
  }

  const participantId = pickOne(challengers, random) as number

  return { participantId, reason: ROUND_CHOOSER_REASON_RANDOM_EXCLUDING_LEADER }
}

/**
 * Thèmes proposés : parmi les thèmes jouables, on privilégie ceux pas encore
 * joués dans la partie ; si tous l'ont été, on repropose les déjà joués.
 */
export function drawOfferedThemes(
  playableThemes: EngineTheme[],
  usedThemeIds: number[],
  count: number,
  random: Random
): EngineTheme[] {
  const freshThemes = playableThemes.filter((theme) => !usedThemeIds.includes(theme.id))
  const pool = freshThemes.length > 0 ? freshThemes : playableThemes

  return drawMany(pool, count, random)
}

/**
 * Questions de la manche : d'abord celles jamais posées dans la partie, puis,
 * si le thème n'en a pas assez, des questions déjà posées pour compléter.
 */
export function drawRoundQuestions(
  eligibleQuestions: EngineQuestion[],
  usedQuestionIds: number[],
  count: number,
  random: Random
): EngineQuestion[] {
  const fresh = eligibleQuestions.filter((question) => !usedQuestionIds.includes(question.id))
  const alreadyPlayed = eligibleQuestions.filter((question) =>
    usedQuestionIds.includes(question.id)
  )
  const drawnFresh = drawMany(fresh, count, random)

  return [...drawnFresh, ...drawMany(alreadyPlayed, count - drawnFresh.length, random)]
}
