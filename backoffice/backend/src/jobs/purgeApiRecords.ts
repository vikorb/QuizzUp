import type { Knex } from 'knex'

import { API_IDEMPOTENCY_TTL_HOURS, API_LOG_RETENTION_DAYS } from '@quizzup/shared'

/**
 * Purge de l'API de réservation : supprime les appels journalisés depuis plus de
 * `API_LOG_RETENTION_DAYS` jours et les clés d'idempotence de plus de `API_IDEMPOTENCY_TTL_HOURS`
 * heures. L'intervalle est calculé par PostgreSQL ; la suppression est idempotente.
 *
 * Renvoie le nombre de lignes supprimées (journal et idempotence confondus).
 */
export async function purgeExpiredApiRecords(db: Knex, now: Date = new Date()): Promise<number> {
  const logs = await db('api_request_logs')
    .whereRaw(`created_at < ?::timestamptz - interval '${API_LOG_RETENTION_DAYS} days'`, [now])
    .delete()
  const idempotencyKeys = await db('api_idempotency_keys')
    .whereRaw(`created_at < ?::timestamptz - interval '${API_IDEMPOTENCY_TTL_HOURS} hours'`, [now])
    .delete()

  return logs + idempotencyKeys
}
