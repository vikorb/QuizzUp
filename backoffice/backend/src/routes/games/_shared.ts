import { randomInt } from 'node:crypto'

import { GAME_SEED_MAX, GAME_STATUS_DELETED } from '@quizzup/shared'

import db from '../../db'
import type { GameParticipantRow, GameRow } from '../../types/game'

export const gameSelect = [
  'games.id',
  'games.company_id as companyId',
  'games.room_id as roomId',
  'rooms.name as roomName',
  'games.admin_id as adminId',
  'games.rounds_count as roundsCount',
  'games.questions_per_round as questionsPerRound',
  'games.seed',
  'games.state',
  'games.started_at as startedAt',
  'games.finished_at as finishedAt',
  'games.status',
  'games.created_at as createdAt',
  'games.updated_at as updatedAt',
]

export const participantSelect = [
  'id',
  'podium',
  'display_name as displayName',
  'email',
  'consent_at as consentAt',
  'score',
]

/** Graine du moteur de jeu (0 à 2³² − 1), tirée côté serveur. */
export function drawGameSeed(): number {
  return randomInt(0, GAME_SEED_MAX + 1)
}

export async function findGameInCompany(
  companyId: number,
  gameId: number
): Promise<GameRow | undefined> {
  const game = await db('games')
    .join('rooms', 'rooms.id', 'games.room_id')
    .where('games.company_id', companyId)
    .where('games.id', gameId)
    .whereNot('games.status', GAME_STATUS_DELETED)
    .first(gameSelect)

  if (!game) {
    return undefined
  }

  const participants = await findGameParticipants(Number(game.id))

  return { ...toGameRow(game), participants }
}

function toOptionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null ? undefined : Number(value)
}

/**
 * Ids, graine et compteurs sont des bigint : `pg` les renvoie en texte. Le moteur de jeu
 * compare les ids strictement, on renvoie donc des nombres (contrat OpenAPI `integer`).
 */
export function toGameRow(row: Record<string, unknown>): GameRow {
  const game = row as GameRow
  const participantsCount = toOptionalNumber(row.participantsCount)

  return {
    ...game,
    id: Number(row.id),
    companyId: Number(row.companyId),
    roomId: Number(row.roomId),
    adminId: Number(row.adminId),
    seed: Number(row.seed),
    ...(participantsCount === undefined ? {} : { participantsCount }),
  }
}

export async function findGameParticipants(gameId: number): Promise<GameParticipantRow[]> {
  const participants = await db('game_participants')
    .where('game_id', gameId)
    .select(participantSelect)
    .orderBy('podium', 'asc')

  return (participants as GameParticipantRow[]).map((participant) => ({
    ...participant,
    id: Number(participant.id),
    podium: Number(participant.podium),
    score: Number(participant.score),
  }))
}
