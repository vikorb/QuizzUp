import type { MiniGame } from '@quizzup/shared'

import type { AnswerRecord, EngineParticipant, EngineQuestion, PendingEvent } from '../types'
import type { MiniGameDefinition, QuestionContext, QuestionStep } from './miniGame'
import { getScore } from './questionRules'

/**
 * Brique commune des mini-jeux « on buzze, puis on répond seul » (premier buzz,
 * révélation progressive). Une seule fenêtre de buzz : le premier qui appuie
 * (n'importe quel bouton) la met en pause et répond avec A-D. Juste = fin de la
 * question ; faux ou trop lent = bloqué pour la question, la fenêtre reprend
 * pour les autres. Personne à l'échéance : perdu pour tout le monde.
 */
export type BuzzToAnswerState<K extends MiniGame> = {
  kind: K
  question: EngineQuestion
  participantIds: number[]
  status: 'open' | 'answering' | 'done'
  /** Début (virtuel) de la fenêtre : décalé de la durée des pauses de réponse. */
  openedAt: number
  windowMs: number
  pausedAt: number | null
  answeringParticipantId: number | null
  answerDeadline: number | null
  lockedOutIds: number[]
  /** Scores au début de la question (pour borner les pénalités). */
  scoresAtStart: QuestionContext['scores']
  answers: AnswerRecord[]
}

type BuzzToAnswerOptions<K extends MiniGame> = Omit<
  MiniGameDefinition<BuzzToAnswerState<K>>,
  'id' | 'start' | 'tick' | 'press'
> & {
  id: K
  windowMs: number
  answerTimeoutMs: number
  /** Points d'une bonne réponse, selon le temps écoulé dans la fenêtre au moment du buzz. */
  pointsForCorrect: (elapsedMs: number, windowMs: number) => number
  /** Points (≤ 0) d'une erreur ; le score du joueur au début de la question est fourni. */
  pointsForWrong: (scoreAtStart: number) => number
}

export function getBuzzElapsedMs<K extends MiniGame>(
  state: BuzzToAnswerState<K>,
  now: number
): number {
  const reference = state.pausedAt ?? now
  return Math.min(state.windowMs, Math.max(0, reference - state.openedAt))
}

export function createBuzzToAnswerMiniGame<K extends MiniGame>(
  options: BuzzToAnswerOptions<K>
): MiniGameDefinition<BuzzToAnswerState<K>> {
  const { windowMs, answerTimeoutMs, pointsForCorrect, pointsForWrong, ...definition } = options
  type State = BuzzToAnswerState<K>
  type Step = QuestionStep<State>

  function finish(state: State, events: PendingEvent[], at: number): Step {
    return { state: { ...state, status: 'done' }, events, answers: state.answers, endedAt: at }
  }

  function elapsedAtBuzz(state: State, at: number): number {
    return Math.round((state.pausedAt ?? at) - state.openedAt)
  }

  function answerWrong(
    state: State,
    participantId: number,
    answerId: number | null,
    at: number
  ): Step {
    const pausedAt = state.pausedAt ?? at
    const lockedOutIds = [...state.lockedOutIds, participantId]
    const record: AnswerRecord = {
      participantId,
      questionId: state.question.id,
      answerId,
      isCorrect: false,
      points: pointsForWrong(getScore(state.scoresAtStart, participantId)),
      responseTimeMs: elapsedAtBuzz(state, at),
      stage: null,
    }
    const resumed: State = {
      ...state,
      status: 'open',
      // Le temps de réponse n'est pas décompté de la fenêtre de buzz.
      openedAt: state.openedAt + (at - pausedAt),
      pausedAt: null,
      answeringParticipantId: null,
      answerDeadline: null,
      lockedOutIds,
      answers: [...state.answers, record],
    }
    const events: PendingEvent[] = [
      {
        type: 'answer_wrong',
        at,
        payload: {
          questionId: state.question.id,
          participantId,
          answerId,
          timedOut: answerId === null,
        },
      },
    ]

    return lockedOutIds.length >= state.participantIds.length
      ? finish(resumed, events, at)
      : { state: resumed, events }
  }

  return {
    ...definition,

    start: (question, participants: EngineParticipant[], at, context) => ({
      state: {
        kind: options.id,
        question,
        participantIds: participants.map((participant) => participant.id),
        status: 'open',
        openedAt: at,
        windowMs,
        pausedAt: null,
        answeringParticipantId: null,
        answerDeadline: null,
        lockedOutIds: [],
        scoresAtStart: context.scores.map((line) => ({ ...line })),
        answers: [],
      },
      events: [],
    }),

    tick: (state, at) => {
      if (
        state.status === 'answering' &&
        state.answerDeadline !== null &&
        state.answeringParticipantId !== null &&
        at >= state.answerDeadline
      ) {
        return answerWrong(state, state.answeringParticipantId, null, state.answerDeadline)
      }

      if (state.status === 'open' && at >= state.openedAt + state.windowMs) {
        return finish(state, [], state.openedAt + state.windowMs)
      }

      return { state, events: [] }
    },

    press: (state, { participantId, button, at }) => {
      if (state.status === 'open') {
        const canBuzz =
          state.participantIds.includes(participantId) &&
          !state.lockedOutIds.includes(participantId)

        if (!canBuzz) {
          return { state, events: [] }
        }

        return {
          state: {
            ...state,
            status: 'answering',
            pausedAt: at,
            answeringParticipantId: participantId,
            answerDeadline: at + answerTimeoutMs,
          },
          events: [
            {
              type: 'buzzer_pressed',
              at,
              payload: {
                questionId: state.question.id,
                participantId,
                elapsedMs: at - state.openedAt,
              },
            },
          ],
        }
      }

      const answer = state.question.answers[button]

      if (
        state.status !== 'answering' ||
        participantId !== state.answeringParticipantId ||
        !answer
      ) {
        return { state, events: [] }
      }

      if (!answer.isCorrect) {
        return answerWrong(state, participantId, answer.id, at)
      }

      const elapsedMs = elapsedAtBuzz(state, at)
      const record: AnswerRecord = {
        participantId,
        questionId: state.question.id,
        answerId: answer.id,
        isCorrect: true,
        points: pointsForCorrect(elapsedMs, state.windowMs),
        responseTimeMs: elapsedMs,
        stage: null,
      }

      return finish(
        { ...state, answers: [...state.answers, record] },
        [
          {
            type: 'answer_correct',
            at,
            payload: { questionId: state.question.id, participantId, answerId: answer.id },
          },
        ],
        at
      )
    },
  }
}
