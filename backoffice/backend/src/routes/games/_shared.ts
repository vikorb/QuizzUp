import { randomInt } from 'node:crypto'

import type { FastifyRequest } from 'fastify'

import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  GAME_SEED_MAX,
  GAME_STATE_FINISHED,
  GAME_STATUS_DELETED,
  MINI_GAMES,
  type MiniGame,
} from '@quizzup/shared'

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
  'games.mini_games as miniGames',
  'games.seed',
  'games.state',
  'games.started_at as startedAt',
  'games.finished_at as finishedAt',
  'games.status',
  'games.created_at as createdAt',
  'games.updated_at as updatedAt',
]

/**
 * Date d'une partie pour les filtres `from` et `to` : le lot des sessions programmées ajoutera
 * `games.scheduled_at` en tête du COALESCE (arbitrage 9).
 */
export const GAME_DATE_SQL = 'COALESCE(games.started_at, games.created_at)'

export const participantSelect = [
  'id',
  'podium',
  'display_name as displayName',
  'email',
  'consent_at as consentAt',
  'second_display_name as secondDisplayName',
  'second_email as secondEmail',
  'second_consent_at as secondConsentAt',
  'score',
]

type ParticipantDbRow = {
  id: number | string
  podium: number | string
  displayName: string
  email: string | null
  consentAt: string | null
  secondDisplayName: string | null
  secondEmail: string | null
  secondConsentAt: string | null
  score: number | string
}

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

/** `jsonb` relu par `pg` (tableau) ou texte : seuls les mini-jeux connus, `null` = tous. */
function toMiniGames(value: unknown): MiniGame[] | null {
  let list: unknown = value

  if (typeof value === 'string') {
    try {
      list = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!Array.isArray(list)) {
    return null
  }
  const miniGames = MINI_GAMES.filter((miniGame) => list.includes(miniGame))
  return miniGames.length > 0 ? miniGames : null
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
    miniGames: toMiniGames(row.miniGames),
    ...(participantsCount === undefined ? {} : { participantsCount }),
  }
}

type ParticipantStatsRow = {
  game_id: number | string
  second_display_name: string | null
  score: number | string
}

function secondsBetween(start: unknown, end: unknown): number | null {
  const seconds = (new Date(end as string).getTime() - new Date(start as string).getTime()) / 1000

  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : null
}

/**
 * Champs calculés de la liste des parties : joueurs nommés, durée et meilleur score. Durée et
 * meilleur score n'existent que pour une partie terminée (un score n'est enregistré qu'à la fin).
 */
export async function addGameListFields(games: GameRow[]): Promise<GameRow[]> {
  if (games.length === 0) {
    return games
  }

  const participants = (await db('game_participants')
    .whereIn(
      'game_id',
      games.map((game) => game.id)
    )
    .select(['game_id', 'second_display_name', 'score'])) as ParticipantStatsRow[]

  return games.map((game) => {
    const own = participants.filter((participant) => Number(participant.game_id) === game.id)
    const finished = game.state === GAME_STATE_FINISHED

    return {
      ...game,
      participantsCount:
        own.length + own.filter((participant) => participant.second_display_name).length,
      durationSeconds:
        finished && game.startedAt && game.finishedAt
          ? secondsBetween(game.startedAt, game.finishedAt)
          : null,
      topScore: finished && own.length > 0 ? Math.max(...own.map((p) => Number(p.score))) : null,
    }
  })
}

export async function findGameParticipants(gameId: number): Promise<GameParticipantRow[]> {
  const participants = (await db('game_participants')
    .where('game_id', gameId)
    .select(participantSelect)
    .orderBy('podium', 'asc')) as ParticipantDbRow[]

  return participants.map((participant) => ({
    id: Number(participant.id),
    podium: Number(participant.podium),
    displayName: participant.displayName,
    email: participant.email ?? null,
    hasEmail: Boolean(participant.email),
    consentAt: participant.consentAt ?? null,
    secondPlayer: participant.secondDisplayName
      ? {
          displayName: participant.secondDisplayName,
          email: participant.secondEmail ?? null,
          hasEmail: Boolean(participant.secondEmail),
          consentAt: participant.secondConsentAt ?? null,
        }
      : null,
    score: Number(participant.score),
  }))
}

/**
 * RGPD (décision d'Enzo, 2026-11-04) : seuls l'admin et le superadmin relisent les emails
 * des joueurs. Le staff (`user`) les saisit à l'inscription, mais ne les voit plus ensuite.
 */
export function canReadPlayerEmails(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_SUPERADMIN || req.user.role === ADMIN_ROLE_ADMIN
}

export function maskPlayerEmails(game: GameRow, req: FastifyRequest): GameRow {
  if (canReadPlayerEmails(req) || !game.participants) {
    return game
  }

  return {
    ...game,
    participants: game.participants.map((participant) => ({
      ...participant,
      email: null,
      secondPlayer: participant.secondPlayer ? { ...participant.secondPlayer, email: null } : null,
    })),
  }
}

/** Partie vue par le staff du backoffice, emails masqués selon le rôle. */
export async function findStaffGame(
  req: FastifyRequest,
  companyId: number,
  gameId: number
): Promise<GameRow | undefined> {
  const game = await findGameInCompany(companyId, gameId)

  return game ? maskPlayerEmails(game, req) : undefined
}
