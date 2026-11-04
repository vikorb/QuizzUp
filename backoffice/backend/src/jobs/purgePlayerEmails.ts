import type { Knex } from 'knex'

import { PLAYER_EMAIL_RETENTION_YEARS } from '@quizzup/shared'

/** Où l'email apparaît sur une ligne de `game_participants` : 1er joueur ou 2e joueur du pupitre. */
export type PlayerEmailSlot = 'first' | 'second'

type DateLike = Date | string | null | undefined

/** Une occurrence d'un email dans une partie, avec les dates de cette partie. */
export type EmailOccurrence = {
  participantId: number | string
  slot: PlayerEmailSlot
  email: string
  finishedAt: DateLike
  startedAt: DateLike
  gameCreatedAt: DateLike
}

/** Clé de comparaison d'un email : insensible à la casse et aux espaces autour. */
export function normalizePlayerEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Date limite : un email dont la dernière partie est antérieure à cette date doit être effacé. */
export function getPlayerEmailRetentionCutoff(
  now: Date,
  years: number = PLAYER_EMAIL_RETENTION_YEARS
): Date {
  const cutoff = new Date(now.getTime())
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years)

  return cutoff
}

function toTimestamp(value: DateLike): number | null {
  if (value === null || value === undefined) {
    return null
  }

  const time = (value instanceof Date ? value : new Date(value)).getTime()

  return Number.isNaN(time) ? null : time
}

/**
 * Date de la partie : `COALESCE(finished_at, started_at, created_at)`. `null` si aucune date
 * exploitable (jamais attendu : `created_at` est NOT NULL).
 */
export function resolveGameTimestamp(
  occurrence: Pick<EmailOccurrence, 'finishedAt' | 'startedAt' | 'gameCreatedAt'>
): number | null {
  return (
    toTimestamp(occurrence.finishedAt) ??
    toTimestamp(occurrence.startedAt) ??
    toTimestamp(occurrence.gameCreatedAt)
  )
}

/**
 * Choisit les occurrences à effacer. Un email (normalisé) est périmé si sa partie la plus récente,
 * tous créneaux confondus (1er et 2e joueur), est antérieure à `cutoff` ; alors toutes ses
 * occurrences sont à effacer. Une date illisible compte comme « récente » : dans le doute, on
 * garde l'email plutôt que de l'effacer à tort.
 */
export function selectExpiredOccurrences(
  occurrences: readonly EmailOccurrence[],
  cutoff: Date
): EmailOccurrence[] {
  const cutoffTime = cutoff.getTime()
  const lastGameByEmail = new Map<string, number>()

  for (const occurrence of occurrences) {
    const key = normalizePlayerEmail(occurrence.email)
    const time = resolveGameTimestamp(occurrence) ?? Number.POSITIVE_INFINITY
    const previous = lastGameByEmail.get(key)

    if (previous === undefined || time > previous) {
      lastGameByEmail.set(key, time)
    }
  }

  return occurrences.filter((occurrence) => {
    const lastGame = lastGameByEmail.get(normalizePlayerEmail(occurrence.email))

    return lastGame !== undefined && lastGame < cutoffTime
  })
}

type OccurrenceRow = {
  participantId: number | string
  email: string
  finishedAt: DateLike
  startedAt: DateLike
  gameCreatedAt: DateLike
}

async function loadOccurrences(
  trx: Knex | Knex.Transaction,
  slot: PlayerEmailSlot
): Promise<EmailOccurrence[]> {
  const emailColumn =
    slot === 'first' ? 'game_participants.email' : 'game_participants.second_email'

  // Une requête par créneau (plutôt qu'un OR) : chaque colonne email a son index.
  const rows = (await trx('game_participants')
    .join('games', 'games.id', 'game_participants.game_id')
    .whereNotNull(emailColumn)
    .select(
      'game_participants.id as participantId',
      `${emailColumn} as email`,
      'games.finished_at as finishedAt',
      'games.started_at as startedAt',
      'games.created_at as gameCreatedAt'
    )) as OccurrenceRow[]

  // Les parties supprimées logiquement (status = 2) sont volontairement comptées : leurs
  // participants (et donc l'email) restent en base, et la partie a bien eu lieu à cette date.
  // Les ignorer pourrait effacer trop tôt l'email d'un joueur qui a joué récemment.
  return rows.map((row) => ({ ...row, slot }))
}

async function clearSlot(
  trx: Knex | Knex.Transaction,
  slot: PlayerEmailSlot,
  participantIds: Array<number | string>,
  now: Date
): Promise<void> {
  if (participantIds.length === 0) {
    return
  }

  // Seuls l'email et son consentement sont effacés ; noms et scores sont conservés.
  const payload =
    slot === 'first'
      ? { email: null, consent_at: null, updated_at: now }
      : { second_email: null, second_consent_at: null, updated_at: now }

  await trx('game_participants').whereIn('id', participantIds).update(payload)
}

/**
 * Purge RGPD : efface les emails des joueurs (1er et 2e joueur) dont la dernière partie date de
 * plus de `PLAYER_EMAIL_RETENTION_YEARS` ans, partout où ils apparaissent, en une transaction.
 * Renvoie le nombre de lignes `game_participants` modifiées.
 */
export async function purgeExpiredPlayerEmails(db: Knex, now: Date = new Date()): Promise<number> {
  const cutoff = getPlayerEmailRetentionCutoff(now)

  return db.transaction(async (trx) => {
    const occurrences = [
      ...(await loadOccurrences(trx, 'first')),
      ...(await loadOccurrences(trx, 'second')),
    ]

    const expired = selectExpiredOccurrences(occurrences, cutoff)
    const idsFor = (slot: PlayerEmailSlot) =>
      expired.filter((occurrence) => occurrence.slot === slot).map((o) => o.participantId)

    const firstIds = idsFor('first')
    const secondIds = idsFor('second')

    await clearSlot(trx, 'first', firstIds, now)
    await clearSlot(trx, 'second', secondIds, now)

    // Une ligne dont les deux joueurs sont purgés ne compte qu'une fois.
    return new Set([...firstIds, ...secondIds].map(String)).size
  })
}
