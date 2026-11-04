import { MINI_GAME_POINT_STEAL } from '@quizzup/shared'

import type { ScoreLine } from '../draws'
import type { AnswerRecord, EngineParticipant, PendingEvent } from '../types'
import type { MiniGameDefinition, QuestionStep } from './miniGame'
import { getParticipantIds, getScore, isMultipleChoiceQuestion } from './questionRules'
import {
  choiceRecord,
  getAnsweringEnd,
  isAnsweringComplete,
  isChoiceCorrect,
  lockAnswer,
  openAnswering,
  type SimultaneousAnswering,
} from './simultaneous'

/**
 * Vol de points : tout le monde répond en même temps (juste = 50 points). Le plus
 * rapide des bons choisit ensuite un adversaire avec ses buzzers (A = pupitre 1,
 * B = pupitre 2…) et lui vole jusqu'à 100 points. Sans choix dans le temps, le vol
 * vise automatiquement l'adversaire le mieux classé.
 */
export const POINT_STEAL_ANSWER_MS = 15_000
export const POINT_STEAL_TARGET_MS = 8000
export const POINT_STEAL_POINTS = 50
export const POINT_STEAL_AMOUNT = 100

export type PointStealState = {
  kind: typeof MINI_GAME_POINT_STEAL
  status: 'answering' | 'targeting' | 'done'
  participants: EngineParticipant[]
  scoresAtStart: ScoreLine[]
  answering: SimultaneousAnswering
  /** Le plus rapide des bons, qui choisit sa cible. */
  thiefId: number | null
  targetDeadline: number | null
  /** Points de la question avant le vol, par joueur. */
  records: AnswerRecord[]
}

type Step = QuestionStep<PointStealState>

/** Points qu'un joueur peut se faire voler : son score + ce qu'il vient de gagner. */
function getAvailable(state: PointStealState, participantId: number): number {
  const gained = state.records
    .filter((record) => record.participantId === participantId)
    .reduce((total, record) => total + record.points, 0)

  return getScore(state.scoresAtStart, participantId) + gained
}

function getTargets(state: PointStealState): EngineParticipant[] {
  return state.participants.filter(
    (participant) => participant.id !== state.thiefId && getAvailable(state, participant.id) > 0
  )
}

/** Cible automatique : l'adversaire le plus riche, au plus petit pupitre en cas d'égalité. */
export function pickAutomaticTarget(state: PointStealState): number | null {
  const targets = getTargets(state)
  const best = Math.max(...targets.map((target) => getAvailable(state, target.id)))

  return targets.find((target) => getAvailable(state, target.id) === best)?.id ?? null
}

function finish(state: PointStealState, events: PendingEvent[], at: number): Step {
  return {
    state: { ...state, status: 'done' },
    events,
    answers: state.records,
    endedAt: at,
  }
}

function steal(state: PointStealState, targetId: number, automatic: boolean, at: number): Step {
  const thiefId = state.thiefId as number
  const stolen = Math.min(POINT_STEAL_AMOUNT, getAvailable(state, targetId))
  const records = state.records.map((record) => {
    if (record.participantId === thiefId) {
      return { ...record, points: record.points + stolen }
    }

    return { ...record }
  })
  const targetRecord = records.find((record) => record.participantId === targetId)

  if (targetRecord) {
    targetRecord.points -= stolen
  } else {
    // La cible n'avait pas répondu : une ligne porte la perte (une seule par joueur).
    records.push({
      participantId: targetId,
      questionId: state.answering.question.id,
      answerId: null,
      isCorrect: false,
      points: -stolen,
      responseTimeMs: null,
      stage: null,
    })
  }

  return finish(
    { ...state, records },
    [
      {
        type: 'points_stolen',
        at,
        payload: {
          questionId: state.answering.question.id,
          thiefId,
          targetId,
          points: stolen,
          automatic,
        },
      },
    ],
    at
  )
}

/** Réponses closes : points des bons, puis désignation du voleur s'il a une cible. */
function closeAnswers(state: PointStealState, events: PendingEvent[]): Step {
  const { answering } = state
  const at = getAnsweringEnd(answering)
  const records = answering.choices.map((choice) =>
    choiceRecord(
      answering,
      choice,
      isChoiceCorrect(answering.question, choice) ? POINT_STEAL_POINTS : 0
    )
  )
  // Les choix sont dans l'ordre d'arrivée : le premier juste est le plus rapide.
  const thief = answering.choices.find((choice) => isChoiceCorrect(answering.question, choice))
  const next: PointStealState = { ...state, records, thiefId: thief?.participantId ?? null }

  if (!thief || getTargets(next).length === 0) {
    return finish(next, events, at)
  }

  return {
    state: { ...next, status: 'targeting', targetDeadline: at + POINT_STEAL_TARGET_MS },
    events: [
      ...events,
      {
        type: 'steal_target_requested',
        at,
        payload: {
          questionId: answering.question.id,
          participantId: thief.participantId,
          targetIds: getTargets(next).map((target) => target.id),
        },
      },
    ],
  }
}

export const pointSteal: MiniGameDefinition<PointStealState> = {
  id: MINI_GAME_POINT_STEAL,
  minParticipants: 2,
  isQuestionEligible: isMultipleChoiceQuestion,

  start: (question, participants, at, context) => ({
    state: {
      kind: MINI_GAME_POINT_STEAL,
      status: 'answering',
      participants: participants.map((participant) => ({ ...participant })),
      scoresAtStart: context.scores.map((line) => ({ ...line })),
      answering: openAnswering(
        question,
        getParticipantIds(participants),
        at,
        POINT_STEAL_ANSWER_MS
      ),
      thiefId: null,
      targetDeadline: null,
      records: [],
    },
    events: [],
  }),

  tick: (state, at) => {
    if (state.status === 'answering' && isAnsweringComplete(state.answering, at)) {
      return closeAnswers(state, [])
    }

    if (
      state.status === 'targeting' &&
      state.targetDeadline !== null &&
      at >= state.targetDeadline
    ) {
      const targetId = pickAutomaticTarget(state) as number

      return steal(state, targetId, true, state.targetDeadline)
    }

    return { state, events: [] }
  },

  press: (state, { participantId, button, at }) => {
    if (state.status === 'targeting') {
      // Le bouton désigne un pupitre : A = 1, B = 2, C = 3, D = 4.
      const target = state.participants.find((participant) => participant.podium === button + 1)
      const isValidTarget =
        participantId === state.thiefId &&
        target !== undefined &&
        getTargets(state).some((candidate) => candidate.id === target.id)

      return isValidTarget ? steal(state, target.id, false, at) : { state, events: [] }
    }

    const locked =
      state.status === 'answering'
        ? lockAnswer(state.answering, { participantId, button, at })
        : null

    if (!locked) {
      return { state, events: [] }
    }

    const next: PointStealState = { ...state, answering: locked.answering }

    return isAnsweringComplete(next.answering, at)
      ? closeAnswers(next, [locked.event])
      : { state: next, events: [locked.event] }
  },
}
