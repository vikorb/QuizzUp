import {
  cleanRoomLogText,
  pickRoomLogContext,
  ROOM_LOG_APP_VERSION_MAX_LENGTH,
  ROOM_LOG_BATCH_MAX_ENTRIES,
  ROOM_LOG_CODE_MAX_LENGTH,
  ROOM_LOG_CODE_PATTERN,
  ROOM_LOG_DEFAULT_RETENTION_DAYS,
  ROOM_LOG_LEVELS,
  ROOM_LOG_MAX_PER_ROOM,
  ROOM_LOG_MESSAGE_MAX_LENGTH,
  ROOM_LOG_OCCURRENCES_MAX,
} from '@quizzup/shared'
import type { Knex } from 'knex'
import { z } from 'zod'

/** Au plus 6 envois par minute et par salle (l'écran de salle en fait 2 par minute). */
export const ROOM_LOG_RATE_LIMIT_MAX = 6
export const ROOM_LOG_RATE_LIMIT_WINDOW_MS = 60_000

/** Taille maximale d'un envoi : 50 entrées de 300 caractères et leur contexte tiennent dans 128 Ko. */
export const ROOM_LOG_BODY_LIMIT_BYTES = 128 * 1024

/** Longueur maximale d'une valeur de contexte à l'arrivée. */
const ROOM_LOG_CONTEXT_INPUT_MAX_LENGTH = 256

/** Plafond de `ROOM_LOG_RETENTION_DAYS` : dix ans. */
export const ROOM_LOG_RETENTION_MAX_DAYS = 3650

const roomLogEntrySchema = z
  .object({
    level: z.enum(ROOM_LOG_LEVELS),
    code: z.string().max(ROOM_LOG_CODE_MAX_LENGTH).regex(ROOM_LOG_CODE_PATTERN),
    message: z.string().trim().min(1).max(ROOM_LOG_MESSAGE_MAX_LENGTH),
    // Forme libre à l'arrivée ; seules les clés de la liste blanche sont gardées. Une chaîne est
    // bornée avant tout nettoyage (le client n'en envoie jamais plus de 64).
    context: z
      .record(
        z.string(),
        z
          .unknown()
          .refine(
            (value) =>
              typeof value !== 'string' || value.length <= ROOM_LOG_CONTEXT_INPUT_MAX_LENGTH
          )
      )
      .optional(),
    occurrences: z.number().int().min(1).max(ROOM_LOG_OCCURRENCES_MAX).default(1),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .transform((entry) => ({
    ...entry,
    // `[email]` rallonge parfois le texte : on masque d'abord, on coupe ensuite.
    message: cleanRoomLogText(entry.message, ROOM_LOG_MESSAGE_MAX_LENGTH),
    context: pickRoomLogContext(entry.context),
  }))

export const roomLogsBodySchema = z.object({
  appVersion: z
    .string()
    .trim()
    .min(1)
    .max(ROOM_LOG_APP_VERSION_MAX_LENGTH)
    .transform((version) => cleanRoomLogText(version, ROOM_LOG_APP_VERSION_MAX_LENGTH)),
  entries: z.array(roomLogEntrySchema).min(1).max(ROOM_LOG_BATCH_MAX_ENTRIES),
})

/**
 * Jours de conservation (`ROOM_LOG_RETENTION_DAYS`). Une valeur absente, non entière, inférieure
 * à 1 ou au-dessus de 3650 retombe sur le défaut : un journal sans durée de vie ne serait jamais
 * nettoyé (et PostgreSQL refuse un intervalle démesuré).
 */
export function getRoomLogRetentionDays(value = process.env.ROOM_LOG_RETENTION_DAYS): number {
  const days = Number(value?.trim())

  return Number.isInteger(days) && days >= 1 && days <= ROOM_LOG_RETENTION_MAX_DAYS
    ? days
    : ROOM_LOG_DEFAULT_RETENTION_DAYS
}

/**
 * Nettoie les journaux d'une salle : lignes plus vieilles que la durée de conservation, puis tout
 * ce qui dépasse les 5 000 plus récentes. Appelé à chaque insertion, dans la même transaction.
 */
export async function pruneRoomLogs(db: Knex | Knex.Transaction, roomId: number): Promise<void> {
  await db.raw(
    `DELETE FROM room_logs
     WHERE room_id = ?
       AND (
         created_at < now() - make_interval(days => ?)
         OR id <= COALESCE(
           (SELECT id FROM room_logs WHERE room_id = ? ORDER BY id DESC OFFSET ? LIMIT 1),
           0
         )
       )`,
    [roomId, getRoomLogRetentionDays(), roomId, ROOM_LOG_MAX_PER_ROOM]
  )
}
