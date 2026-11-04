import { MINI_GAME_SUDDEN_DEATH } from '@quizzup/shared'

import type { AnswerRecord, EngineQuestion } from '../types'
import { getParticipantIds, isMultipleChoiceQuestion } from './questionRules'
import {
  choiceRecord,
  createSimultaneousMiniGame,
  isChoiceCorrect,
  type SimultaneousAnswering,
  type SimultaneousState,
} from './simultaneous'

/**
 * Mort subite : les survivants répondent en même temps. Une erreur (ou pas de
 * réponse) = éliminé jusqu'à la fin de la manche ; si TOUS les survivants se
 * trompent sur la même question, personne n'est éliminé. Le dernier debout
 * rafle le bonus et la manche s'arrête ; s'il en reste plusieurs à la dernière
 * question, chaque survivant qui a bien répondu touche le bonus. Seul en jeu :
 * on va le plus loin possible, la première erreur termine la manche.
 */
export const SUDDEN_DEATH_DURATION_MS = 15_000
export const SUDDEN_DEATH_POINTS = 50
export const SUDDEN_DEATH_SURVIVOR_BONUS = 200

/** Survivants après une question, selon qui a bien répondu parmi `alive`. */
export function eliminate(alive: number[], correctIds: number[]): number[] {
  const survivors = alive.filter((participantId) => correctIds.includes(participantId))

  // Tout le monde s'est trompé : personne ne tombe (sauf en solo).
  return survivors.length === 0 && alive.length > 1 ? alive : survivors
}

/** Survivants de la manche après les questions déjà jouées. */
export function getSurvivors(
  participantIds: number[],
  playedQuestions: EngineQuestion[],
  roundAnswers: AnswerRecord[]
): number[] {
  let alive = [...participantIds]

  for (const question of playedQuestions) {
    const correctIds = roundAnswers
      .filter((answer) => answer.questionId === question.id && answer.isCorrect)
      .map((answer) => answer.participantId)
    alive = eliminate(alive, correctIds)
  }

  return alive
}

/** La manche est jouée : plus personne en solo, ou un seul survivant à plusieurs. */
export function isSuddenDeathOver(participantsCount: number, survivorsCount: number): boolean {
  return survivorsCount === 0 || (participantsCount > 1 && survivorsCount === 1)
}

export type SuddenDeathExtra = {
  participantsCount: number
  isLastQuestion: boolean
}

export type SuddenDeathState = SimultaneousState<typeof MINI_GAME_SUDDEN_DEATH, SuddenDeathExtra>

function scoreSuddenDeath(
  answering: SimultaneousAnswering,
  extra: SuddenDeathExtra
): AnswerRecord[] {
  const correctIds = answering.choices
    .filter((choice) => isChoiceCorrect(answering.question, choice))
    .map((choice) => choice.participantId)
  const survivors = eliminate(answering.playerIds, correctIds)
  const wins = extra.isLastQuestion || isSuddenDeathOver(extra.participantsCount, survivors.length)

  return answering.choices.map((choice) => {
    if (!correctIds.includes(choice.participantId)) {
      return choiceRecord(answering, choice, 0)
    }

    const bonus = wins && survivors.includes(choice.participantId) ? SUDDEN_DEATH_SURVIVOR_BONUS : 0

    return choiceRecord(answering, choice, SUDDEN_DEATH_POINTS + bonus)
  })
}

export const suddenDeath = createSimultaneousMiniGame({
  id: MINI_GAME_SUDDEN_DEATH,
  durationMs: SUDDEN_DEATH_DURATION_MS,
  isQuestionEligible: isMultipleChoiceQuestion,
  isRoundOver: ({ participants, playedQuestions, roundAnswers }) =>
    isSuddenDeathOver(
      participants.length,
      getSurvivors(getParticipantIds(participants), playedQuestions, roundAnswers).length
    ),
  prepare: (participants, context) => {
    const participantIds = getParticipantIds(participants)
    const alive = getSurvivors(
      participantIds,
      context.roundQuestions.slice(0, context.questionIndex),
      context.roundAnswers
    )
    return {
      playerIds: alive,
      extra: {
        participantsCount: participantIds.length,
        isLastQuestion: context.questionIndex >= context.questionsCount - 1,
      },
    }
  },
  score: scoreSuddenDeath,
  endEvents: (answering, _extra, records, at) => {
    const correctIds = records
      .filter((record) => record.isCorrect)
      .map((record) => record.participantId)
    const survivorIds = eliminate(answering.playerIds, correctIds)
    const eliminatedIds = answering.playerIds.filter(
      (participantId) => !survivorIds.includes(participantId)
    )

    return eliminatedIds.length > 0
      ? [
          {
            type: 'player_eliminated',
            at,
            payload: { questionId: answering.question.id, eliminatedIds, survivorIds },
          },
        ]
      : []
  },
})
