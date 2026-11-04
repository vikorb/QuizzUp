import { MINI_GAME_DOUBLE_OR_NOTHING } from '@quizzup/shared'

import type { ScoreLine } from '../draws'
import type { AnswerRecord, ButtonIndex, PendingEvent } from '../types'
import type { MiniGameDefinition, QuestionStep } from './miniGame'
import { cappedLoss, getParticipantIds, getScore, isMultipleChoiceQuestion } from './questionRules'
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
 * Quitte ou double : avant de voir la question, chacun mise avec ses buzzers
 * (A = je passe, B = 100, C = 200, D = tapis : tout son score, au moins 300).
 * Puis tout le monde répond en même temps : juste = gagne sa mise, faux ou pas de
 * réponse = la perd (sans passer sous zéro). Sans mise, on joue 100.
 */
export const DOUBLE_OR_NOTHING_BET_MS = 8000
export const DOUBLE_OR_NOTHING_ANSWER_MS = 15_000
export const DOUBLE_OR_NOTHING_STAKES = [0, 100, 200] as const
export const DOUBLE_OR_NOTHING_ALL_IN_MIN = 300
/** Mise appliquée à qui n'a pas misé dans le temps : B (100). */
export const DOUBLE_OR_NOTHING_DEFAULT_BUTTON: ButtonIndex = 1
export const DOUBLE_OR_NOTHING_ALL_IN_BUTTON: ButtonIndex = 3

export function getStake(button: ButtonIndex, score: number): number {
  if (button === DOUBLE_OR_NOTHING_ALL_IN_BUTTON) {
    return Math.max(score, DOUBLE_OR_NOTHING_ALL_IN_MIN)
  }

  return (DOUBLE_OR_NOTHING_STAKES as readonly number[])[button] ?? 0
}

export type DoubleOrNothingBet = { participantId: number; button: ButtonIndex; stake: number }

export type DoubleOrNothingState = {
  kind: typeof MINI_GAME_DOUBLE_OR_NOTHING
  status: 'betting' | 'answering' | 'done'
  participantIds: number[]
  scoresAtStart: ScoreLine[]
  betDeadline: number
  bets: DoubleOrNothingBet[]
  answering: SimultaneousAnswering
}

type Step = QuestionStep<DoubleOrNothingState>

function closeBets(state: DoubleOrNothingState, at: number): Step {
  const bets = state.participantIds.map(
    (participantId) =>
      state.bets.find((bet) => bet.participantId === participantId) ?? {
        participantId,
        button: DOUBLE_OR_NOTHING_DEFAULT_BUTTON,
        stake: getStake(
          DOUBLE_OR_NOTHING_DEFAULT_BUTTON,
          getScore(state.scoresAtStart, participantId)
        ),
      }
  )

  return {
    state: {
      ...state,
      status: 'answering',
      bets,
      answering: openAnswering(
        state.answering.question,
        state.participantIds,
        at,
        DOUBLE_OR_NOTHING_ANSWER_MS
      ),
    },
    events: [
      {
        type: 'bets_closed',
        at,
        payload: { questionId: state.answering.question.id, bets: bets.map((bet) => ({ ...bet })) },
      },
    ],
  }
}

function scoreBets(state: DoubleOrNothingState): AnswerRecord[] {
  const { answering } = state
  const records: AnswerRecord[] = []

  for (const bet of state.bets) {
    const choice = answering.choices.find((item) => item.participantId === bet.participantId)
    const available = getScore(state.scoresAtStart, bet.participantId)

    if (choice) {
      const points = isChoiceCorrect(answering.question, choice)
        ? bet.stake
        : cappedLoss(bet.stake, available)
      records.push(choiceRecord(answering, choice, points))
    } else if (bet.stake > 0) {
      // Miser puis ne pas répondre, c'est perdre sa mise.
      records.push({
        participantId: bet.participantId,
        questionId: answering.question.id,
        answerId: null,
        isCorrect: false,
        points: cappedLoss(bet.stake, available),
        responseTimeMs: null,
        stage: null,
      })
    }
  }

  return records
}

function finish(state: DoubleOrNothingState, events: PendingEvent[]): Step {
  return {
    state: { ...state, status: 'done' },
    events,
    answers: scoreBets(state),
    endedAt: getAnsweringEnd(state.answering),
  }
}

export const doubleOrNothing: MiniGameDefinition<DoubleOrNothingState> = {
  id: MINI_GAME_DOUBLE_OR_NOTHING,
  isQuestionEligible: isMultipleChoiceQuestion,

  start: (question, participants, at, context) => {
    const participantIds = getParticipantIds(participants)

    return {
      state: {
        kind: MINI_GAME_DOUBLE_OR_NOTHING,
        status: 'betting',
        participantIds,
        scoresAtStart: context.scores.map((line) => ({ ...line })),
        betDeadline: at + DOUBLE_OR_NOTHING_BET_MS,
        bets: [],
        // Fenêtre de réponse provisoire : rouverte à la clôture des mises.
        answering: openAnswering(question, participantIds, at, 0),
      },
      events: [],
    }
  },

  tick: (state, at) => {
    if (state.status === 'betting' && at >= state.betDeadline) {
      return closeBets(state, state.betDeadline)
    }

    if (state.status === 'answering' && isAnsweringComplete(state.answering, at)) {
      return finish(state, [])
    }

    return { state, events: [] }
  },

  press: (state, { participantId, button, at }) => {
    if (state.status === 'betting') {
      const alreadyBet = state.bets.some((bet) => bet.participantId === participantId)

      if (alreadyBet || !state.participantIds.includes(participantId)) {
        return { state, events: [] }
      }

      const bet: DoubleOrNothingBet = {
        participantId,
        button,
        stake: getStake(button, getScore(state.scoresAtStart, participantId)),
      }
      const next: DoubleOrNothingState = { ...state, bets: [...state.bets, bet] }
      // La mise reste secrète jusqu'à la clôture.
      const event: PendingEvent = {
        type: 'bet_placed',
        at,
        payload: { questionId: state.answering.question.id, participantId },
      }

      if (next.bets.length < state.participantIds.length) {
        return { state: next, events: [event] }
      }

      const closed = closeBets(next, at)

      return { ...closed, events: [event, ...closed.events] }
    }

    const locked =
      state.status === 'answering'
        ? lockAnswer(state.answering, { participantId, button, at })
        : null

    if (!locked) {
      return { state, events: [] }
    }

    const next: DoubleOrNothingState = { ...state, answering: locked.answering }

    return isAnsweringComplete(next.answering, at)
      ? finish(next, [locked.event])
      : { state: next, events: [locked.event] }
  },
}
