import type { MiniGame, QuestionMediaType, RoundChooserReason } from '@quizzup/shared'

/** Index d'un buzzer sur un pupitre : 0 = A, 1 = B, 2 = C, 3 = D. */
export type ButtonIndex = 0 | 1 | 2 | 3

export type EngineAnswer = {
  id: number
  text: string
  isCorrect: boolean
}

export type EngineQuestion = {
  id: number
  text: string
  mediaType: QuestionMediaType
  mediaUrl: string | null
  /** Point de départ de l'extrait dans le fichier média, en millisecondes. */
  mediaStartMs: number
  answers: EngineAnswer[]
}

export type EngineTheme = {
  id: number
  name: string
  questions: EngineQuestion[]
}

export type EngineParticipant = {
  id: number
  /** Pupitre 1 à 4. */
  podium: number
  displayName: string
}

export type GameTimings = {
  /** Annonce du mini-jeu de la manche. */
  roundIntroMs: number
  /** Temps laissé au joueur désigné pour choisir le thème. */
  themeChoiceMs: number
  /** Affichage de la bonne réponse après une question. */
  revealMs: number
  /** Bilan de fin de manche. */
  roundSummaryMs: number
}

export type GameSetup = {
  seed: number
  participants: EngineParticipant[]
  themes: EngineTheme[]
  roundsCount?: number
  questionsPerRound?: number
  /** Mini-jeux activés (tous par défaut). */
  miniGames?: MiniGame[]
  timings?: Partial<GameTimings>
}

export type ResolvedSetup = {
  seed: number
  participants: EngineParticipant[]
  themes: EngineTheme[]
  roundsCount: number
  questionsPerRound: number
  miniGames: MiniGame[]
  timings: GameTimings
}

/** Une réponse jouée, telle qu'elle sera stockée dans `game_answers`. */
export type AnswerRecord = {
  participantId: number
  questionId: number
  answerId: number | null
  isCorrect: boolean
  points: number
  responseTimeMs: number | null
  /** Palier du mini-jeu (ex. blind test : 1, 2 ou 3). */
  stage: number | null
}

export type RoundRecord = {
  position: number
  miniGame: MiniGame
  offeredThemeIds: number[]
  chooserParticipantId: number | null
  chooserReason: RoundChooserReason | null
  themeId: number | null
  /** Snapshot des questions jouées dans la manche. */
  questions: EngineQuestion[]
  answers: AnswerRecord[]
}

export type GameCommand =
  | { type: 'start'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'press'; at: number; podium: number; button: ButtonIndex }
  | { type: 'abort'; at: number; reason: string }

export type GameEventType =
  | 'game_started'
  | 'round_started'
  | 'round_themes_offered'
  | 'round_chooser_selected'
  | 'round_theme_selected'
  | 'question_started'
  | 'question_ended'
  | 'buzzer_pressed'
  | 'answer_correct'
  | 'answer_wrong'
  | 'points_awarded'
  | 'blind_test_stage_started'
  | 'blind_test_stage_resumed'
  | 'blind_test_paused'
  | 'answer_locked'
  | 'bet_placed'
  | 'bets_closed'
  | 'player_eliminated'
  | 'steal_target_requested'
  | 'points_stolen'
  | 'round_ended'
  | 'game_ended'
  | 'game_aborted'

/** Événement émis, tel qu'il sera stocké dans `game_events`. */
export type GameEvent = {
  seq: number
  type: GameEventType
  at: number
  payload: Record<string, unknown>
}

/** Événement produit par un mini-jeu, avant numérotation par le moteur. */
export type PendingEvent = Omit<GameEvent, 'seq'>
