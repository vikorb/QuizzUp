import { MINI_GAME_STREAK } from '@quizzup/shared'

import type { AnswerRecord, EngineQuestion } from '../types'
import { getParticipantIds, isMultipleChoiceQuestion } from './questionRules'
import {
  choiceRecord,
  createSimultaneousMiniGame,
  isChoiceCorrect,
  type SimultaneousState,
} from './simultaneous'

/**
 * Série : tout le monde répond en même temps. Chaque bonne réponse consécutive
 * dans la manche fait monter le multiplicateur (×1, ×2… jusqu'à ×5) ; une erreur
 * ou une absence de réponse le fait retomber à ×1.
 */
export const STREAK_DURATION_MS = 15_000
export const STREAK_BASE_POINTS = 25
export const STREAK_MAX_MULTIPLIER = 5

/** Bonnes réponses consécutives de chaque joueur sur les questions déjà jouées. */
export function getStreaks(
  participantIds: number[],
  playedQuestions: EngineQuestion[],
  roundAnswers: AnswerRecord[]
): Record<number, number> {
  const streaks: Record<number, number> = {}

  for (const participantId of participantIds) {
    let streak = 0

    for (const question of playedQuestions) {
      const correct = roundAnswers.some(
        (answer) =>
          answer.questionId === question.id &&
          answer.participantId === participantId &&
          answer.isCorrect
      )
      streak = correct ? streak + 1 : 0
    }

    streaks[participantId] = streak
  }

  return streaks
}

export function getStreakMultiplier(streak: number): number {
  return Math.min(STREAK_MAX_MULTIPLIER, 1 + streak)
}

export type StreakExtra = {
  /** Multiplicateur appliqué à chaque joueur sur cette question. */
  multipliers: Record<number, number>
}

export type StreakState = SimultaneousState<typeof MINI_GAME_STREAK, StreakExtra>

export const streak = createSimultaneousMiniGame({
  id: MINI_GAME_STREAK,
  durationMs: STREAK_DURATION_MS,
  isQuestionEligible: isMultipleChoiceQuestion,
  prepare: (participants, context): { playerIds: number[]; extra: StreakExtra } => {
    const playerIds = getParticipantIds(participants)
    const streaks = getStreaks(
      playerIds,
      context.roundQuestions.slice(0, context.questionIndex),
      context.roundAnswers
    )
    const multipliers: Record<number, number> = {}

    for (const participantId of playerIds) {
      multipliers[participantId] = getStreakMultiplier(streaks[participantId] ?? 0)
    }

    return { playerIds, extra: { multipliers } }
  },
  score: (answering, extra) =>
    answering.choices.map((choice) =>
      choiceRecord(
        answering,
        choice,
        isChoiceCorrect(answering.question, choice)
          ? STREAK_BASE_POINTS * (extra.multipliers[choice.participantId] ?? 1)
          : 0,
        extra.multipliers[choice.participantId] ?? 1
      )
    ),
})
