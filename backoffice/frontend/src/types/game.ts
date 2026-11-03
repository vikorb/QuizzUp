import type { GameState, GameStatus, RoomStatus } from '@quizzup/shared'

export type GameParticipant = {
  id: number
  podium: number
  displayName: string
  email: string | null
  consentAt: string | null
  score: number
}

export type Game = {
  id: number
  companyId: number
  roomId: number
  roomName?: string
  adminId: number
  roundsCount: number
  questionsPerRound: number
  seed: number
  state: GameState
  startedAt: string | null
  finishedAt: string | null
  status: GameStatus
  createdAt: string
  updatedAt: string | null
  participantsCount?: number
  participants?: GameParticipant[]
}

export type GameTableRow = Game & Record<string, unknown>

/** Salle telle que listée pour le lancement d'une partie (appel minimal, US-GAME-08). */
export type GameRoom = {
  id: number
  name: string
  status: RoomStatus
}

export type GameStateFilter = GameState | ''

export type CreateGameParticipantPayload = {
  podium: number
  displayName: string
  email?: string
  emailConsent?: boolean
}

export type CreateGamePayload = {
  roomId: number
  participants: CreateGameParticipantPayload[]
  roundsCount?: number
  questionsPerRound?: number
}

/** Saisie d'un participant dans le formulaire de lancement (champs texte bruts). */
export type GameParticipantFormValues = {
  key: number
  podium: string
  displayName: string
  email: string
  emailConsent: boolean
}

export type GameFormValues = {
  roomId: string
  roundsCount: string
  questionsPerRound: string
  participants: GameParticipantFormValues[]
}

export type GameParticipantFieldErrors = {
  podium: string
  displayName: string
  email: string
  emailConsent: string
}

export type GameFieldErrors = {
  roomId: string
  roundsCount: string
  questionsPerRound: string
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
  | 'game_already_over'
  | 'email_consent_required'
  | 'conflict'
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
}

export type GameResponse = {
  game: Game
}

export type GameRoomsResponse = {
  rooms: GameRoom[]
}
