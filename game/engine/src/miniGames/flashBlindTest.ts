import { MINI_GAME_FLASH_BLIND_TEST, QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'

import type { AnswerRecord, EngineQuestion, PendingEvent } from '../types'
import type { MiniGameDefinition, QuestionStep } from './miniGame'

/**
 * Blind test éclair (US-MINIGAME-01).
 *
 * L'extrait joue 1 s, puis 5 s, puis 20 s. Après chaque écoute, une courte
 * fenêtre laisse le temps de buzzer. Le premier qui buzze met l'extrait en
 * pause et répond seul avec A-D : juste = points du palier, faux = bloqué
 * jusqu'à la fin de la question (pas de pénalité), les autres peuvent encore
 * buzzer. Personne au bout du palier 3 : perdu pour tout le monde.
 */
export const FLASH_BLIND_TEST_STAGE_DURATIONS_MS = [1000, 5000, 20_000] as const
export const FLASH_BLIND_TEST_STAGE_POINTS = [100, 50, 20] as const
/** Temps laissé pour buzzer une fois l'extrait du palier terminé. */
export const FLASH_BLIND_TEST_BUZZ_WINDOW_MS = 3000
/** Temps laissé au joueur qui a buzzé pour répondre. */
export const FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS = 5000

const LAST_STAGE_INDEX = FLASH_BLIND_TEST_STAGE_DURATIONS_MS.length - 1

export type FlashBlindTestState = {
  kind: typeof MINI_GAME_FLASH_BLIND_TEST
  question: EngineQuestion
  participantIds: number[]
  /** Palier en cours, 0-based. */
  stageIndex: number
  status: 'playing' | 'answering' | 'done'
  /** Début (virtuel) du palier : décalé de la durée des pauses de réponse. */
  stageStartedAt: number
  /** Instant de début de pause, quand un joueur répond. */
  pausedAt: number | null
  answeringParticipantId: number | null
  answerDeadline: number | null
  lockedOutIds: number[]
  answers: AnswerRecord[]
}

type Step = QuestionStep<FlashBlindTestState>

function getStageTotalMs(stageIndex: number): number {
  return (FLASH_BLIND_TEST_STAGE_DURATIONS_MS[stageIndex] ?? 0) + FLASH_BLIND_TEST_BUZZ_WINDOW_MS
}

function getStageNumber(state: FlashBlindTestState): number {
  return state.stageIndex + 1
}

function stageStartedEvent(state: FlashBlindTestState, at: number): PendingEvent {
  return {
    type: 'blind_test_stage_started',
    at,
    payload: {
      questionId: state.question.id,
      stage: getStageNumber(state),
      extractMs: FLASH_BLIND_TEST_STAGE_DURATIONS_MS[state.stageIndex],
      buzzWindowMs: FLASH_BLIND_TEST_BUZZ_WINDOW_MS,
      mediaUrl: state.question.mediaUrl,
      mediaStartMs: state.question.mediaStartMs,
    },
  }
}

function finish(state: FlashBlindTestState, events: PendingEvent[], at: number): Step {
  return { state: { ...state, status: 'done' }, events, answers: state.answers, endedAt: at }
}

function startNextStageOrFinish(state: FlashBlindTestState, at: number): Step {
  if (state.stageIndex >= LAST_STAGE_INDEX) {
    return finish(state, [], at)
  }

  const next: FlashBlindTestState = {
    ...state,
    stageIndex: state.stageIndex + 1,
    stageStartedAt: at,
  }

  return { state: next, events: [stageStartedEvent(next, at)] }
}

/** Reprend le palier après une mauvaise réponse (ou une absence de réponse). */
function resumeAfterWrongAnswer(
  state: FlashBlindTestState,
  participantId: number,
  answerId: number | null,
  at: number
): Step {
  const pausedAt = state.pausedAt ?? at
  const lockedOutIds = [...state.lockedOutIds, participantId]
  const answer: AnswerRecord = {
    participantId,
    questionId: state.question.id,
    answerId,
    isCorrect: false,
    points: 0,
    responseTimeMs: Math.round(pausedAt - state.stageStartedAt),
    stage: getStageNumber(state),
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
  const resumed: FlashBlindTestState = {
    ...state,
    status: 'playing',
    // Le temps de réponse ne doit pas être décompté du palier.
    stageStartedAt: state.stageStartedAt + (at - pausedAt),
    pausedAt: null,
    answeringParticipantId: null,
    answerDeadline: null,
    lockedOutIds,
    answers: [...state.answers, answer],
  }

  if (lockedOutIds.length >= state.participantIds.length) {
    return finish(resumed, events, at)
  }

  const elapsedMs = pausedAt - state.stageStartedAt
  events.push({
    type: 'blind_test_stage_resumed',
    at,
    payload: {
      questionId: state.question.id,
      stage: getStageNumber(state),
      elapsedMs,
      remainingMs: getStageTotalMs(state.stageIndex) - elapsedMs,
    },
  })

  return { state: resumed, events }
}

export const flashBlindTest: MiniGameDefinition<FlashBlindTestState> = {
  id: MINI_GAME_FLASH_BLIND_TEST,

  isQuestionEligible: (question) =>
    question.mediaType === QUESTION_MEDIA_TYPE_AUDIO &&
    Boolean(question.mediaUrl) &&
    question.answers.length >= 2 &&
    question.answers.length <= 4 &&
    question.answers.some((answer) => answer.isCorrect),

  start: (question, participants, at) => {
    const state: FlashBlindTestState = {
      kind: MINI_GAME_FLASH_BLIND_TEST,
      question,
      participantIds: participants.map((participant) => participant.id),
      stageIndex: 0,
      status: 'playing',
      stageStartedAt: at,
      pausedAt: null,
      answeringParticipantId: null,
      answerDeadline: null,
      lockedOutIds: [],
      answers: [],
    }

    return { state, events: [stageStartedEvent(state, at)] }
  },

  tick: (state, at) => {
    if (state.status === 'answering') {
      if (
        state.answerDeadline !== null &&
        at >= state.answerDeadline &&
        state.answeringParticipantId !== null
      ) {
        return resumeAfterWrongAnswer(
          state,
          state.answeringParticipantId,
          null,
          state.answerDeadline
        )
      }

      return { state, events: [] }
    }

    if (
      state.status === 'playing' &&
      at >= state.stageStartedAt + getStageTotalMs(state.stageIndex)
    ) {
      return startNextStageOrFinish(state, state.stageStartedAt + getStageTotalMs(state.stageIndex))
    }

    return { state, events: [] }
  },

  press: (state, { participantId, button, at }) => {
    if (state.status === 'playing') {
      const canBuzz =
        state.participantIds.includes(participantId) && !state.lockedOutIds.includes(participantId)

      if (!canBuzz) {
        return { state, events: [] }
      }

      return {
        state: {
          ...state,
          status: 'answering',
          pausedAt: at,
          answeringParticipantId: participantId,
          answerDeadline: at + FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS,
        },
        events: [
          {
            type: 'buzzer_pressed',
            at,
            payload: { questionId: state.question.id, participantId, stage: getStageNumber(state) },
          },
          {
            type: 'blind_test_paused',
            at,
            payload: { questionId: state.question.id, elapsedMs: at - state.stageStartedAt },
          },
        ],
      }
    }

    if (state.status !== 'answering' || participantId !== state.answeringParticipantId) {
      return { state, events: [] }
    }

    const answer = state.question.answers[button]

    if (!answer) {
      return { state, events: [] }
    }

    if (!answer.isCorrect) {
      return resumeAfterWrongAnswer(state, participantId, answer.id, at)
    }

    const points = FLASH_BLIND_TEST_STAGE_POINTS[state.stageIndex] ?? 0
    const pausedAt = state.pausedAt ?? at
    const record: AnswerRecord = {
      participantId,
      questionId: state.question.id,
      answerId: answer.id,
      isCorrect: true,
      points,
      responseTimeMs: Math.round(pausedAt - state.stageStartedAt),
      stage: getStageNumber(state),
    }

    return finish(
      { ...state, answers: [...state.answers, record] },
      [
        {
          type: 'answer_correct',
          at,
          payload: {
            questionId: state.question.id,
            participantId,
            answerId: answer.id,
            stage: getStageNumber(state),
          },
        },
      ],
      at
    )
  },
}
