import {
  GAME_STATE_PENDING,
  GAME_STATUS_DELETED,
  JOIN_REGISTRATION_MAX_AGE_HOURS,
} from '@quizzup/shared'
import type { Knex } from 'knex'

/**
 * Purge RGPD : supprime les demandes d'inscription des joueurs qui n'ont plus d'utilité, c'est-à-
 * dire celles de plus de `JOIN_REGISTRATION_MAX_AGE_HOURS` heures et celles d'une partie qui n'est
 * plus en attente (lancée, terminée, arrêtée, supprimée) : le personnel ne les validera plus.
 * Une demande validée ou refusée est déjà supprimée sur le moment. L'intervalle est calculé par
 * PostgreSQL ; la suppression est idempotente, aucun verrou nécessaire.
 *
 * Renvoie le nombre de demandes supprimées.
 */
export async function purgeStaleJoinRegistrations(
  db: Knex,
  now: Date = new Date()
): Promise<number> {
  return db('game_registrations')
    .whereRaw(`created_at < ?::timestamptz - interval '${JOIN_REGISTRATION_MAX_AGE_HOURS} hours'`, [
      now,
    ])
    .orWhereIn(
      'game_id',
      db('games')
        .select('id')
        .whereNot('state', GAME_STATE_PENDING)
        .orWhere('status', GAME_STATUS_DELETED)
    )
    .delete()
}
