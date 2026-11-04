import type { MiniGame } from '@quizzup/shared'

import type {
  AnswerRecord,
  ButtonIndex,
  EngineParticipant,
  EngineQuestion,
  PendingEvent,
} from '../types'
import type { MiniGameDefinition, QuestionContext, QuestionStep } from './miniGame'

/**
 * Brique commune des mini-jeux où tout le monde répond en même temps avec A-D :
 * chaque joueur autorisé verrouille UNE réponse (le premier appui compte), la
 * question se termine quand tout le monde a répondu ou à l'échéance.
 */
export type SimultaneousChoice = {
  participantId: number
  answerId: number
  button: ButtonIndex
  at: number
}

export type SimultaneousAnswering = {
  question: EngineQuestion
  /** Joueurs autorisés à répondre (ex. mort subite : seulement les survivants). */
  playerIds: number[]
  startedAt: number
  deadline: number
  choices: SimultaneousChoice[]
}

export function openAnswering(
  question: EngineQuestion,
  playerIds: number[],
  at: number,
  durationMs: number
): SimultaneousAnswering {
  return { question, playerIds, startedAt: at, deadline: at + durationMs, choices: [] }
}

export function isAnsweringComplete(answering: SimultaneousAnswering, at: number): boolean {
  return at >= answering.deadline || answering.choices.length >= answering.playerIds.length
}

/** Instant réel de fin : la dernière réponse si tout le monde a répondu, sinon l'échéance. */
export function getAnsweringEnd(answering: SimultaneousAnswering): number {
  if (answering.choices.length >= answering.playerIds.length) {
    return Math.max(answering.startedAt, ...answering.choices.map((choice) => choice.at))
  }

  return answering.deadline
}

/** Verrouille la réponse d'un joueur ; `null` si l'appui ne compte pas. */
export function lockAnswer(
  answering: SimultaneousAnswering,
  press: { participantId: number; button: ButtonIndex; at: number }
): { answering: SimultaneousAnswering; event: PendingEvent } | null {
  const answer = answering.question.answers[press.button]
  const alreadyAnswered = answering.choices.some(
    (choice) => choice.participantId === press.participantId
  )

  if (
    !answer ||
    alreadyAnswered ||
    press.at >= answering.deadline ||
    !answering.playerIds.includes(press.participantId)
  ) {
    return null
  }

  const choice: SimultaneousChoice = {
    participantId: press.participantId,
    answerId: answer.id,
    button: press.button,
    at: press.at,
  }

  return {
    answering: { ...answering, choices: [...answering.choices, choice] },
    // Le choix n'est pas dévoilé avant la fin : l'écran montre seulement qui a répondu.
    event: {
      type: 'answer_locked',
      at: press.at,
      payload: {
        questionId: answering.question.id,
        participantId: press.participantId,
        answeredCount: answering.choices.length + 1,
        playersCount: answering.playerIds.length,
      },
    },
  }
}

export function isChoiceCorrect(question: EngineQuestion, choice: SimultaneousChoice): boolean {
  return question.answers.some((answer) => answer.id === choice.answerId && answer.isCorrect)
}

/** Ligne de `game_answers` pour un choix verrouillé, avec ses points. */
export function choiceRecord(
  answering: SimultaneousAnswering,
  choice: SimultaneousChoice,
  points: number,
  stage: number | null = null
): AnswerRecord {
  return {
    participantId: choice.participantId,
    questionId: answering.question.id,
    answerId: choice.answerId,
    isCorrect: isChoiceCorrect(answering.question, choice),
    points,
    responseTimeMs: Math.round(choice.at - answering.startedAt),
    stage,
  }
}

/** État d'un mini-jeu « tout le monde répond » : `extra` porte ses données propres. */
export type SimultaneousState<K extends MiniGame, TExtra> = {
  kind: K
  status: 'answering' | 'done'
  answering: SimultaneousAnswering
  extra: TExtra
}

type SimultaneousOptions<K extends MiniGame, TExtra> = Omit<
  MiniGameDefinition<SimultaneousState<K, TExtra>>,
  'id' | 'start' | 'tick' | 'press'
> & {
  id: K
  durationMs: number
  /** Joueurs qui peuvent répondre et données propres, calculées au début de la question. */
  prepare: (
    participants: EngineParticipant[],
    context: QuestionContext
  ) => { playerIds: number[]; extra: TExtra }
  /** Points de chaque joueur une fois les réponses closes (au plus une ligne par joueur). */
  score: (answering: SimultaneousAnswering, extra: TExtra) => AnswerRecord[]
  /** Événements propres au mini-jeu à la clôture (ex. joueurs éliminés). */
  endEvents?: (
    answering: SimultaneousAnswering,
    extra: TExtra,
    records: AnswerRecord[],
    at: number
  ) => PendingEvent[]
}

/** Fabrique un mini-jeu « tout le monde répond en même temps ». */
export function createSimultaneousMiniGame<K extends MiniGame, TExtra>(
  options: SimultaneousOptions<K, TExtra>
): MiniGameDefinition<SimultaneousState<K, TExtra>> {
  const { durationMs, prepare, score, endEvents, ...definition } = options
  type State = SimultaneousState<K, TExtra>

  function finish(state: State, events: PendingEvent[]): QuestionStep<State> {
    const records = score(state.answering, state.extra)
    const endedAt = getAnsweringEnd(state.answering)

    return {
      state: { ...state, status: 'done' },
      events: [...events, ...(endEvents?.(state.answering, state.extra, records, endedAt) ?? [])],
      answers: records,
      endedAt,
    }
  }

  return {
    ...definition,

    start: (question, participants, at, context) => {
      const prepared = prepare(participants, context)
      const state: State = {
        kind: options.id,
        status: 'answering',
        answering: openAnswering(question, prepared.playerIds, at, durationMs),
        extra: prepared.extra,
      }
      // Personne ne peut répondre (cas limite) : la question se clôt aussitôt.
      return prepared.playerIds.length === 0 ? finish(state, []) : { state, events: [] }
    },

    tick: (state, at) =>
      state.status === 'answering' && isAnsweringComplete(state.answering, at)
        ? finish(state, [])
        : { state, events: [] },

    press: (state, press) => {
      const locked = state.status === 'answering' ? lockAnswer(state.answering, press) : null

      if (!locked) {
        return { state, events: [] }
      }

      const next: State = { ...state, answering: locked.answering }

      return isAnsweringComplete(next.answering, press.at)
        ? finish(next, [locked.event])
        : { state: next, events: [locked.event] }
    },
  }
}
