import type {
  GameLocale,
  GameState,
  GameStatus,
  MiniGame,
  RoomSchedule,
  RoomStatus,
} from '@quizzup/shared'

/** 2e joueur facultatif d'un pupitre, tel que renvoyé par l'API. */
export type GameSecondPlayer = {
  displayName: string
  /** `null` si absent, ou masqué pour le rôle `user` (voir `hasEmail`). */
  email: string | null
  hasEmail: boolean
  consentAt: string | null
  /** Accepte de recevoir les offres du centre (jamais vrai sans email). */
  marketingConsent: boolean
}

export type GameParticipant = {
  id: number
  podium: number
  displayName: string
  /** `null` si absent, ou masqué pour le rôle `user` (voir `hasEmail`). */
  email: string | null
  hasEmail: boolean
  consentAt: string | null
  /** Accepte de recevoir les offres du centre (jamais vrai sans email). */
  marketingConsent: boolean
  secondPlayer: GameSecondPlayer | null
  /** Score du pupitre, partagé par ses joueurs. */
  score: number
}

/** Ce qui suffit pour afficher l'email d'un joueur (1er ou 2e). */
export type GamePlayerEmail = Pick<GameParticipant, 'email' | 'hasEmail'>

export type Game = {
  id: number
  companyId: number
  roomId: number
  roomName?: string
  /** `null` pour une réservation faite par l'API. */
  adminId: number | null
  roundsCount: number
  questionsPerRound: number
  /** Mini-jeux autorisés pour la partie ; `null` ou absent = tous. */
  miniGames?: MiniGame[] | null
  seed: number
  state: GameState
  startedAt: string | null
  finishedAt: string | null
  status: GameStatus
  createdAt: string
  updatedAt: string | null
  /** Joueurs nommés ; liste des parties seulement. */
  participantsCount?: number
  /** Durée d'une partie terminée, `null` sinon ; liste des parties seulement. */
  durationSeconds?: number | null
  /** Meilleur score d'une partie terminée, `null` sinon ; liste des parties seulement. */
  topScore?: number | null
  participants?: GameParticipant[]
  /** Début prévu (UTC) d'une session programmée ; `null` pour une partie immédiate. */
  scheduledAt?: string | null
  /** Fin prévue (UTC), strictement après `scheduledAt`. */
  scheduledEndAt?: string | null
  cancelledAt?: string | null
  /** Nombre de joueurs annoncé (6 pupitres × 2 joueurs au plus). */
  playersCount?: number | null
  /** Référence du système de réservation du client. */
  externalRef?: string | null
  locale?: GameLocale | null
  /** Origine de la session (lot 14) : absent tant que l'API publique n'est pas livrée. */
  source?: GameSource
}

export type GameSource = 'backoffice' | 'api'

export type GameTableRow = Game & Record<string, unknown>

/** Salle telle que listée pour le lancement d'une partie (appel minimal, US-GAME-08). */
export type GameRoom = {
  id: number
  name: string
  status: RoomStatus
  /** Pupitres de la salle (4 par défaut, jusqu'à 6) ; absent d'une ancienne réponse. */
  desksCount?: number
  /** Créneaux réservables et fuseau de la salle ; `null` ou absent : pas de grille de créneaux. */
  schedule?: RoomSchedule | null
}

export type GameStateFilter = GameState | ''

export type CreateGameSecondPlayerPayload = {
  displayName: string
  email?: string
  emailConsent?: boolean
  /** Offres du centre, distinct de `emailConsent` ; exige un email. */
  marketingConsent?: boolean
}

export type CreateGameParticipantPayload = {
  podium: number
  displayName: string
  email?: string
  emailConsent?: boolean
  marketingConsent?: boolean
  /** Envoyé seulement quand le bloc du 2e joueur est ouvert. */
  secondPlayer?: CreateGameSecondPlayerPayload
}

export type CreateGamePayload = {
  roomId: number
  participants: CreateGameParticipantPayload[]
  roundsCount?: number
  questionsPerRound?: number
  /** Omis quand tous les mini-jeux sont autorisés (= tous, y compris les futurs). */
  miniGames?: MiniGame[]
  /** Instant ISO 8601 de début : présent, la partie est une session programmée. */
  scheduledAt?: string
  /** Absent : durée du créneau de la salle. */
  durationMinutes?: number
  playersCount?: number
  externalRef?: string
}

/**
 * Corps de PATCH /companies/:companyId/games/:gameId : les champs absents sont gardés. Une liste
 * complète de mini-jeux s'écrit `[...MINI_GAMES]` (le serveur la range en « tous »), jamais `null`.
 * `playersCount: null` et `externalRef: null` effacent la valeur.
 */
export type UpdateGamePayload = {
  roomId: number
  roundsCount?: number
  questionsPerRound?: number
  /** Absent : programme inchangé. */
  miniGames?: MiniGame[]
  scheduledAt?: string
  durationMinutes?: number
  playersCount: number | null
  externalRef?: string | null
  /** Absent : participants gardés tels quels (emails masqués pour le rôle `user`). */
  participants?: CreateGameParticipantPayload[]
}

/** Saisie d'un participant dans le formulaire de lancement (champs texte bruts). */
export type GameParticipantFormValues = {
  key: number
  podium: string
  displayName: string
  email: string
  emailConsent: boolean
  /** Case « offres du centre », jamais pré-cochée, inactive sans email. */
  marketingConsent: boolean
  /** Bloc « 2e joueur » ouvert sur ce pupitre. */
  hasSecondPlayer: boolean
  secondDisplayName: string
  secondEmail: string
  secondEmailConsent: boolean
  secondMarketingConsent: boolean
}

/** Champs saisissables d'un pupitre (joueur 1 et 2e joueur). */
export type GameParticipantField =
  | 'podium'
  | 'displayName'
  | 'email'
  | 'emailConsent'
  | 'marketingConsent'
  | 'secondDisplayName'
  | 'secondEmail'
  | 'secondEmailConsent'
  | 'secondMarketingConsent'

export type GameFormValues = {
  roomId: string
  roundsCount: string
  questionsPerRound: string
  /** Mini-jeux cochés (tous par défaut). */
  miniGames: MiniGame[]
  participants: GameParticipantFormValues[]
  /** Case « Programmer pour plus tard » : la partie devient une session à date et heure fixées. */
  scheduled: boolean
  /** Jour (`YYYY-MM-DD`) et heure (`HH:MM`) lus dans le fuseau de la salle choisie. */
  scheduledDate: string
  scheduledTime: string
  /** Vide : durée du créneau de la salle. */
  durationMinutes: string
  /** Effectif annoncé, facultatif. */
  playersCount: string
  /** Référence du système de réservation du centre, facultative. */
  externalRef: string
}

export type GameParticipantFieldErrors = {
  podium: string
  displayName: string
  email: string
  emailConsent: string
  secondDisplayName: string
  secondEmail: string
  secondEmailConsent: string
}

export type GameFieldErrors = {
  roomId: string
  roundsCount: string
  questionsPerRound: string
  miniGames: string
  scheduledAt: string
  durationMinutes: string
  playersCount: string
  externalRef: string
  participants: GameParticipantFieldErrors[]
}

/** Codes d'erreur que l'API des parties peut renvoyer, en plus des codes génériques. */
export type GameApiErrorCode =
  | 'missing_token'
  | 'unauthorized'
  | 'forbidden'
  | 'api_unreachable'
  | 'invalid_json'
  | 'invalid_body'
  | 'invalid_params'
  | 'not_found'
  | 'room_not_found'
  | 'room_inactive'
  | 'room_busy'
  | 'podium_not_in_room'
  | 'company_deleted'
  | 'company_inactive'
  | 'game_already_over'
  | 'email_consent_required'
  | 'marketing_consent_requires_email'
  | 'conflict'
  | 'session_in_past'
  | 'session_too_far'
  | 'slot_taken'
  | 'game_not_scheduled'
  | 'session_not_open_yet'
  | 'server_error'

export type GameApiSuccess<T> = {
  ok: true
  status: number
  data: T
}

export type GameApiFailure = {
  ok: false
  status: number | null
  error: GameApiErrorCode
}

export type GameApiResult<T> = GameApiSuccess<T> | GameApiFailure

export type GamesResponse = {
  games: Game[]
  /** Parties qui passent les filtres, toutes pages confondues. */
  total: number
}

/** Filtres et page de `GET /companies/:companyId/games` ; `from` et `to` sont des instants ISO. */
export type GamesQuery = {
  state?: GameState
  roomId?: number
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export type GameResponse = {
  game: Game
}

export type GameRoomsResponse = {
  rooms: GameRoom[]
}
