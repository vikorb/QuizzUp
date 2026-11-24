import { randomBytes, randomInt } from 'node:crypto'

import type { FastifyRequest } from 'fastify'

import type { Knex } from 'knex'

import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  COMPANY_STATUS_ACTIVE,
  GAME_SEED_MAX,
  GAME_STATE_CANCELLED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_ACTIVE,
  GAME_STATUS_DELETED,
  getRoomDesksCount,
  type GameFormat,
  type GameLocale,
  type GameState,
  JOIN_LINK_TTL_MINUTES,
  JOIN_TOKEN_BYTES,
  MINI_GAMES,
  type MiniGame,
  ROOM_STATUS_ACTIVE,
  SESSION_DEFAULT_MINUTES,
  SESSION_HORIZON_DAYS,
  SESSION_OPEN_EARLY_MINUTES,
} from '@quizzup/shared'

import db from '../../db'
import { qrSvg } from '../../utils/qrSvg'
import type { GameJoin, GameParticipantRow, GameRow } from '../../types/game'
import { isUniqueViolation } from '../_shared/dbErrors'
import { findCompanyById } from '../companies/_shared'
import { findRoomInCompany } from '../companies/rooms/_shared'
import { durationMinutesSchema, type GameParticipantInput } from './_schemas'

export const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

export const gameSelect = [
  'games.id',
  'games.company_id as companyId',
  'games.room_id as roomId',
  'rooms.name as roomName',
  'games.admin_id as adminId',
  'games.format',
  'games.rounds_count as roundsCount',
  'games.questions_per_round as questionsPerRound',
  'games.mini_games as miniGames',
  'games.seed',
  'games.state',
  'games.started_at as startedAt',
  'games.finished_at as finishedAt',
  'games.scheduled_at as scheduledAt',
  'games.scheduled_end_at as scheduledEndAt',
  'games.cancelled_at as cancelledAt',
  'games.players_count as playersCount',
  'games.external_ref as externalRef',
  'games.locale',
  'games.status',
  'games.created_at as createdAt',
  'games.updated_at as updatedAt',
]

/** Date d'une partie pour les filtres `from` et `to` et pour le tri (arbitrage 9). */
export const GAME_DATE_SQL = 'COALESCE(games.scheduled_at, games.started_at, games.created_at)'

export const participantSelect = [
  'id',
  'podium',
  'display_name as displayName',
  'email',
  'consent_at as consentAt',
  'marketing_consent_at as marketingConsentAt',
  'second_display_name as secondDisplayName',
  'second_email as secondEmail',
  'second_consent_at as secondConsentAt',
  'second_marketing_consent_at as secondMarketingConsentAt',
  'score',
]

export type ParticipantDbRow = {
  id: number | string
  podium: number | string
  displayName: string
  email: string | null
  consentAt: string | null
  marketingConsentAt?: string | null
  secondDisplayName: string | null
  secondEmail: string | null
  secondConsentAt: string | null
  secondMarketingConsentAt?: string | null
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

/** État d'une partie de la compagnie (sans ses participants), `undefined` si elle n'existe pas. */
export async function findGameState(
  companyId: number,
  gameId: number
): Promise<{ state: GameState; roomId: number } | undefined> {
  const game = await db('games')
    .where('company_id', companyId)
    .where('id', gameId)
    .whereNot('status', GAME_STATUS_DELETED)
    .first(['state', 'room_id as roomId'])

  return game ? { state: game.state as GameState, roomId: Number(game.roomId) } : undefined
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
    adminId: toOptionalNumber(row.adminId) ?? null,
    seed: Number(row.seed),
    format: game.format ?? null,
    miniGames: toMiniGames(row.miniGames),
    scheduledAt: game.scheduledAt ?? null,
    scheduledEndAt: game.scheduledEndAt ?? null,
    cancelledAt: game.cancelledAt ?? null,
    playersCount: toOptionalNumber(row.playersCount) ?? null,
    externalRef: game.externalRef ?? null,
    locale: game.locale ?? null,
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

export function toParticipant(participant: ParticipantDbRow): GameParticipantRow {
  return {
    id: Number(participant.id),
    podium: Number(participant.podium),
    displayName: participant.displayName,
    email: participant.email ?? null,
    hasEmail: Boolean(participant.email),
    consentAt: participant.consentAt ?? null,
    marketingConsent: Boolean(participant.marketingConsentAt),
    secondPlayer: participant.secondDisplayName
      ? {
          displayName: participant.secondDisplayName,
          email: participant.secondEmail ?? null,
          hasEmail: Boolean(participant.secondEmail),
          consentAt: participant.secondConsentAt ?? null,
          marketingConsent: Boolean(participant.secondMarketingConsentAt),
        }
      : null,
    score: Number(participant.score),
  }
}

export async function findGameParticipants(gameId: number): Promise<GameParticipantRow[]> {
  const participants = (await db('game_participants')
    .where('game_id', gameId)
    .select(participantSelect)
    .orderBy('podium', 'asc')) as ParticipantDbRow[]

  return participants.map(toParticipant)
}

/**
 * RGPD (décision d'Enzo, 2026-11-04) : seuls l'admin et le superadmin relisent les emails
 * des joueurs. Le staff (`user`) les saisit à l'inscription, mais ne les voit plus ensuite.
 */
export function canReadPlayerEmails(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_SUPERADMIN || req.user.role === ADMIN_ROLE_ADMIN
}

/** Même masquage pour une personne seule (`participant`) et pour sa demande d'inscription. */
export function maskEmails<
  T extends { email: string | null; secondPlayer: { email: string | null } | null },
>(player: T, req: FastifyRequest): T {
  if (canReadPlayerEmails(req)) {
    return player
  }

  return {
    ...player,
    email: null,
    secondPlayer: player.secondPlayer ? { ...player.secondPlayer, email: null } : null,
  }
}

export function maskPlayerEmails(game: GameRow, req: FastifyRequest): GameRow {
  if (canReadPlayerEmails(req) || !game.participants) {
    return game
  }

  return {
    ...game,
    participants: game.participants.map((participant) => maskEmails(participant, req)),
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

/** Partie du staff avec son lien d'inscription et ses demandes à valider (fiche d'une partie). */
export async function findStaffGameWithJoin(
  req: FastifyRequest,
  companyId: number,
  gameId: number
): Promise<GameRow | undefined> {
  const game = await findStaffGame(req, companyId, gameId)

  return game ? addGameJoin(game) : undefined
}

/** Efface l'email et les consentements des deux joueurs, noms et scores gardés. */
const ERASED_PLAYER_PERSONAL_DATA = {
  email: null,
  consent_at: null,
  marketing_consent_at: null,
  second_email: null,
  second_consent_at: null,
  second_marketing_consent_at: null,
}

function toParticipantRow(gameId: number, participant: GameParticipantInput) {
  const email = participant.email ?? null
  const second = participant.secondPlayer ?? null
  const secondEmail = second?.email ?? null

  return {
    game_id: gameId,
    podium: participant.podium,
    display_name: participant.displayName,
    email,
    consent_at: email ? db.fn.now() : null,
    marketing_consent_at: email && participant.marketingConsent ? db.fn.now() : null,
    second_display_name: second?.displayName ?? null,
    second_email: secondEmail,
    second_consent_at: secondEmail ? db.fn.now() : null,
    second_marketing_consent_at: secondEmail && second?.marketingConsent ? db.fn.now() : null,
  }
}

/** Insère les participants et renvoie les lignes écrites, lues dans la même transaction. */
export async function insertParticipants(
  trx: Knex.Transaction,
  gameId: number,
  participants: GameParticipantInput[]
): Promise<ParticipantDbRow[]> {
  if (participants.length === 0) {
    return []
  }

  return (await trx('game_participants')
    .insert(participants.map((participant) => toParticipantRow(gameId, participant)))
    .returning(participantSelect)) as ParticipantDbRow[]
}

export type NewGame = {
  companyId: number
  roomId: number
  adminId: number | null
  format: GameFormat
  roundsCount: number
  questionsPerRound: number
  /** `undefined` = tous les mini-jeux. */
  miniGames?: MiniGame[]
  state: GameState
  /** Créneau prévu d'une session programmée. */
  schedule?: { startsAt: Date; endsAt: Date }
  playersCount?: number
  externalRef?: string
  locale?: GameLocale
  /** Lien d'inscription ouvert dès la création (partie en attente seulement). */
  join?: { token: string; expiresAt: Date }
}

/** La partie et ses participants sont créés ensemble : rien en base si l'un échoue. */
export async function insertGameWithParticipants(
  trx: Knex.Transaction,
  game: NewGame,
  participants: GameParticipantInput[]
): Promise<number> {
  const inserted = await trx('games')
    .insert({
      company_id: game.companyId,
      room_id: game.roomId,
      admin_id: game.adminId,
      format: game.format,
      rounds_count: game.roundsCount,
      questions_per_round: game.questionsPerRound,
      mini_games: game.miniGames ? JSON.stringify(game.miniGames) : null,
      seed: drawGameSeed(),
      state: game.state,
      scheduled_at: game.schedule?.startsAt.toISOString() ?? null,
      scheduled_end_at: game.schedule?.endsAt.toISOString() ?? null,
      players_count: game.playersCount ?? null,
      external_ref: game.externalRef ?? null,
      locale: game.locale ?? null,
      join_token: game.join?.token ?? null,
      join_expires_at: game.join?.expiresAt.toISOString() ?? null,
      status: GAME_STATUS_ACTIVE,
      deleted_at: null,
    })
    .returning(['id'])
  const gameId = Number((Array.isArray(inserted) ? inserted[0] : inserted)?.id)

  await insertParticipants(trx, gameId, participants)

  return gameId
}

/** Nombre de pupitres de la salle de la partie (`rooms.config`, 4 par défaut). */
export async function getGameDesksCount(companyId: number, roomId: number): Promise<number> {
  const room = await findRoomInCompany(companyId, roomId)

  return getRoomDesksCount(room?.config)
}

/** Jeton d'un lien d'inscription : 32 octets aléatoires, jamais dérivés d'une donnée de la partie. */
export function generateJoinToken(): string {
  return randomBytes(JOIN_TOKEN_BYTES).toString('base64url')
}

/** Date de fin de validité d'un lien ouvert maintenant. */
export function getJoinExpiry(now = new Date()): Date {
  return addMinutes(now, JOIN_LINK_TTL_MINUTES)
}

/**
 * Lien à montrer aux joueurs : `PUBLIC_APP_URL` + `/rejoindre/#<jeton>`. Le jeton est dans le
 * fragment, jamais dans le chemin ni la query : il n'arrive pas dans les journaux du serveur.
 * Sans `PUBLIC_APP_URL`, l'URL est relative (`/rejoindre/#…`) : à compléter par l'appelant, et
 * `qrSvg` vaut `null` (un QR d'adresse relative ne mène nulle part).
 */
export function toGameJoin(token: string, expiresAt: Date | string): GameJoin {
  const base = (process.env.PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')

  const url = `${base}/rejoindre/#${token}`

  return {
    url,
    qrSvg: base ? qrSvg(url) : null,
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

/**
 * Ajoute le lien d'inscription et le nombre de demandes à valider. Le lien n'existe que pour une
 * partie en attente et non expirée ; sinon `join` vaut `null` (à rouvrir par `POST …/join`).
 */
export async function addGameJoin<T extends Pick<GameRow, 'id' | 'state'>>(
  game: T,
  now = new Date()
): Promise<T & { join: GameJoin | null; pendingRegistrationsCount: number }> {
  if (game.state !== GAME_STATE_PENDING) {
    return { ...game, join: null, pendingRegistrationsCount: 0 }
  }

  const row = await db('games')
    .where('id', game.id)
    .first(['join_token as joinToken', 'join_expires_at as joinExpiresAt'])
  const [{ count }] = await db('game_registrations').where('game_id', game.id).count({ count: '*' })
  const isOpen =
    typeof row?.joinToken === 'string' &&
    row.joinExpiresAt &&
    new Date(row.joinExpiresAt).getTime() > now.getTime()

  return {
    ...game,
    join: isOpen ? toGameJoin(row.joinToken, row.joinExpiresAt) : null,
    pendingRegistrationsCount: Number(count),
  }
}

export const registrationSelect = [
  'id',
  'created_at as createdAt',
  'display_name as displayName',
  'email',
  'marketing_consent_at as marketingConsentAt',
  'second_display_name as secondDisplayName',
  'second_email as secondEmail',
  'second_marketing_consent_at as secondMarketingConsentAt',
]

export type RegistrationRow = {
  id: number
  createdAt: string
  displayName: string
  /** `null` si absent, ou masqué pour le rôle `user` (voir `hasEmail`). */
  email: string | null
  hasEmail: boolean
  marketingConsent: boolean
  secondPlayer: {
    displayName: string
    email: string | null
    hasEmail: boolean
    marketingConsent: boolean
  } | null
}

export function toRegistration(row: Record<string, unknown>): RegistrationRow {
  return {
    id: Number(row.id),
    createdAt: row.createdAt as string,
    displayName: row.displayName as string,
    email: (row.email as string | null) ?? null,
    hasEmail: Boolean(row.email),
    marketingConsent: Boolean(row.marketingConsentAt),
    secondPlayer: row.secondDisplayName
      ? {
          displayName: row.secondDisplayName as string,
          email: (row.secondEmail as string | null) ?? null,
          hasEmail: Boolean(row.secondEmail),
          marketingConsent: Boolean(row.secondMarketingConsentAt),
        }
      : null,
  }
}

/** Durée par défaut d'une session : le créneau réglé sur la salle, sinon `SESSION_DEFAULT_MINUTES`. */
export async function getRoomSlotMinutes(roomId: number): Promise<number> {
  const room = await db('rooms').where('id', roomId).first('schedule')
  const slotMinutes = (room?.schedule as { slotMinutes?: unknown } | null | undefined)?.slotMinutes

  const parsed = durationMinutesSchema.safeParse(slotMinutes)

  return parsed.success ? parsed.data : SESSION_DEFAULT_MINUTES
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS)
}

/** Une session qui se termine déjà, ou qui commence au-delà de l'horizon, est refusée. */
export function getSessionWindowError(
  startsAt: Date,
  endsAt: Date,
  now = new Date()
): 'session_in_past' | 'session_too_far' | null {
  if (endsAt.getTime() <= now.getTime()) {
    return 'session_in_past'
  }

  return startsAt.getTime() > now.getTime() + SESSION_HORIZON_DAYS * DAY_MS
    ? 'session_too_far'
    : null
}

/**
 * Annule les sessions `scheduled` d'une partie ou d'une salle et efface sur-le-champ les emails
 * et consentements de leurs joueurs : ils n'ont jamais joué (arbitrage 13). Renvoie le nombre
 * de sessions annulées.
 */
export async function cancelScheduledGames(
  conn: Knex | Knex.Transaction,
  where: { id: number } | { room_id: number }
): Promise<number> {
  const cancelled = (await conn('games')
    .where(where)
    .where('state', GAME_STATE_SCHEDULED)
    .update({
      state: GAME_STATE_CANCELLED,
      cancelled_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning(['id'])) as Array<{ id: number }>

  if (cancelled.length > 0) {
    await conn('game_participants')
      .whereIn(
        'game_id',
        cancelled.map((game) => Number(game.id))
      )
      .update({ ...ERASED_PLAYER_PERSONAL_DATA, updated_at: db.fn.now() })
  }

  return cancelled.length
}

export type OpenGameError =
  | 'not_found'
  | 'game_not_scheduled'
  | 'company_inactive'
  | 'room_inactive'
  | 'session_not_open_yet'
  | 'room_busy'

/**
 * Ouvre une session programmée (`scheduled` → `pending`), pour le backoffice comme pour la salle.
 * Renvoie le code d'erreur, ou `null` si la session est ouverte. Pas de borne de fin : une session
 * non lancée, même après son créneau, peut toujours être ouverte.
 */
export async function openScheduledGame(
  companyId: number,
  gameId: number,
  now = new Date()
): Promise<OpenGameError | null> {
  const game = await db('games')
    .where('company_id', companyId)
    .where('id', gameId)
    .whereNot('status', GAME_STATUS_DELETED)
    .first(['state', 'room_id as roomId', 'scheduled_at as scheduledAt'])

  if (!game) {
    return 'not_found'
  }

  if (game.state !== GAME_STATE_SCHEDULED) {
    return 'game_not_scheduled'
  }

  const company = await findCompanyById(companyId)

  if (Number(company?.status) !== COMPANY_STATUS_ACTIVE) {
    return 'company_inactive'
  }

  const room = await db('rooms').where('id', game.roomId).first('status')

  if (room?.status !== ROOM_STATUS_ACTIVE) {
    return 'room_inactive'
  }

  // Ouvrable si `scheduled_at - SESSION_OPEN_EARLY_MINUTES <= now`, soit `scheduled_at <= horizon`.
  const openingHorizon = new Date(now.getTime() + SESSION_OPEN_EARLY_MINUTES * MINUTE_MS)

  if (new Date(game.scheduledAt as string) > openingHorizon) {
    return 'session_not_open_yet'
  }

  // Seule une partie en attente bloque (arbitrage 4) : une partie en cours n'empêche pas d'ouvrir
  // la suivante.
  const pendingGame = await db('games')
    .where('room_id', game.roomId)
    .where('state', GAME_STATE_PENDING)
    .whereNot('status', GAME_STATUS_DELETED)
    .first('id')

  if (pendingGame) {
    return 'room_busy'
  }

  try {
    const opened = await db('games')
      .where('id', gameId)
      .where('state', GAME_STATE_SCHEDULED)
      // Même fenêtre que le contrôle ci-dessus, rejouée sur la ligne au moment de l'écriture :
      // un changement d'heure entre la lecture et l'UPDATE ne contourne pas la fenêtre.
      .where('scheduled_at', '<=', openingHorizon.toISOString())
      .update({ state: GAME_STATE_PENDING, updated_at: db.fn.now() })

    if (opened > 0) {
      return null
    }

    // Aucune ligne touchée : l'état a changé (annulée, ouverte) ou l'heure a été repoussée.
    const current = await db('games').where('id', gameId).first('state')

    return current?.state === GAME_STATE_SCHEDULED ? 'session_not_open_yet' : 'game_not_scheduled'
  } catch (error) {
    // Deux ouvertures simultanées dans la même salle : l'index unique tranche.
    if (isUniqueViolation(error)) {
      return 'room_busy'
    }

    throw error
  }
}
