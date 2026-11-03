import type { MiniGame } from '@quizzup/shared'

import type {
  AnswerRecord,
  ButtonIndex,
  EngineParticipant,
  EngineQuestion,
  PendingEvent,
} from '../types'

/** Résultat d'une étape de mini-jeu sur la question en cours. */
export type QuestionStep<TState> = {
  state: TState
  events: PendingEvent[]
  /** Renseigné quand la question est terminée : réponses jouées, à scorer par le moteur. */
  answers?: AnswerRecord[]
  /** Instant réel de fin de la question (peut précéder le tick qui la constate). */
  endedAt?: number
}

/**
 * Contrat d'un mini-jeu. Un mini-jeu ne gère QUE la question en cours ; le
 * moteur gère les manches, le choix du thème, les scores et l'enchaînement.
 * Toutes les méthodes sont pures : elles reçoivent un état et en rendent un nouveau.
 */
export type MiniGameDefinition<TState> = {
  id: MiniGame
  /** Une question est-elle jouable dans ce mini-jeu (type de média, nombre de réponses…) ? */
  isQuestionEligible: (question: EngineQuestion) => boolean
  start: (
    question: EngineQuestion,
    participants: EngineParticipant[],
    at: number
  ) => QuestionStep<TState>
  tick: (state: TState, at: number) => QuestionStep<TState>
  press: (
    state: TState,
    press: { participantId: number; button: ButtonIndex; at: number }
  ) => QuestionStep<TState>
}
