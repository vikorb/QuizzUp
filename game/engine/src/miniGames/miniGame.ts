import type { MiniGame } from '@quizzup/shared'

import type { ScoreLine } from '../draws'
import type {
  AnswerRecord,
  ButtonIndex,
  EngineAnswer,
  EngineParticipant,
  EngineQuestion,
  PendingEvent,
} from '../types'

/** Résultat d'une étape de mini-jeu sur la question en cours. */
export type QuestionStep<TState> = {
  state: TState
  events: PendingEvent[]
  /**
   * Renseigné quand la question est terminée : réponses jouées, à scorer par le moteur.
   * Au plus une ligne par participant (contrainte unique de `game_answers`).
   */
  answers?: AnswerRecord[]
  /** Instant réel de fin de la question (peut précéder le tick qui la constate). */
  endedAt?: number
}

/** Ce que le moteur sait de la manche quand une question commence. */
export type QuestionContext = {
  /** Position de la question dans la manche, 0-based. */
  questionIndex: number
  questionsCount: number
  /** Questions de la manche (snapshot), dans l'ordre. */
  roundQuestions: EngineQuestion[]
  /** Réponses déjà jouées dans la manche (questions précédentes). */
  roundAnswers: AnswerRecord[]
  /** Scores de la partie au début de la question, dans l'ordre des pupitres. */
  scores: ScoreLine[]
}

/** Ce que le moteur sait de la manche entre deux questions. */
export type RoundContext = {
  participants: EngineParticipant[]
  /** Questions déjà jouées dans la manche, dans l'ordre. */
  playedQuestions: EngineQuestion[]
  roundAnswers: AnswerRecord[]
}

/**
 * Contrat d'un mini-jeu. Un mini-jeu ne gère QUE la question en cours ; le
 * moteur gère les manches, le choix du thème, les scores et l'enchaînement.
 * Toutes les méthodes sont pures : elles reçoivent un état et en rendent un nouveau.
 * L'état doit rester sérialisable (`structuredClone`, JSON) : il est sauvegardé.
 */
export type MiniGameDefinition<TState> = {
  id: MiniGame
  /** Une question est-elle jouable dans ce mini-jeu (type de média, nombre de réponses…) ? */
  isQuestionEligible: (question: EngineQuestion) => boolean
  /** Nombre minimum de joueurs (1 par défaut). Ex. vol de points : il faut un adversaire. */
  minParticipants?: number
  /**
   * Ordre des réponses A-D. Par défaut le moteur les mélange avec la graine ; un
   * mini-jeu peut imposer un ordre (vrai/faux : A = vrai ; estimation : fourchettes
   * croissantes). Doit être déterministe.
   */
  arrangeAnswers?: (answers: EngineAnswer[]) => EngineAnswer[]
  /** Durée de la révélation, si elle diffère de `timings.revealMs` (rafale de vrai/faux). */
  revealMs?: number
  /** Fin de manche anticipée, évaluée après chaque question (ex. mort subite). */
  isRoundOver?: (context: RoundContext) => boolean
  start: (
    question: EngineQuestion,
    participants: EngineParticipant[],
    at: number,
    context: QuestionContext
  ) => QuestionStep<TState>
  tick: (state: TState, at: number) => QuestionStep<TState>
  press: (
    state: TState,
    press: { participantId: number; button: ButtonIndex; at: number }
  ) => QuestionStep<TState>
}
