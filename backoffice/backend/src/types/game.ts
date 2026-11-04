import type { GameState, GameStatus } from '@quizzup/shared'

export type GameParticipantRow = {
  id: number
  podium: number
  displayName: string
  email: string | null
  consentAt: string | null
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
