import type { GameState, GameStatus, MiniGame } from '@quizzup/shared'

/** 2e joueur facultatif d'un pupitre. */
export type GameSecondPlayerRow = {
  displayName: string
  /** `null` si absent, ou masqué pour le rôle `user` (voir `hasEmail`). */
  email: string | null
  hasEmail: boolean
  consentAt: string | null
}

export type GameParticipantRow = {
  id: number
  podium: number
  displayName: string
  /** `null` si absent, ou masqué pour le rôle `user` (voir `hasEmail`). */
  email: string | null
  hasEmail: boolean
  consentAt: string | null
  secondPlayer: GameSecondPlayerRow | null
  /** Score du pupitre, partagé par ses joueurs. */
  score: number
}

export type GameRow = {
  id: number
  companyId: number
  roomId: number
  roomName?: string
  adminId: number
  roundsCount: number
  questionsPerRound: number
  /** Mini-jeux choisis au lancement, `null` = tous. */
  miniGames: MiniGame[] | null
  seed: number
  state: GameState
  startedAt: string | null
  finishedAt: string | null
  status: GameStatus
  createdAt: string
  updatedAt: string | null
  participantsCount?: number
  participants?: GameParticipantRow[]
}
