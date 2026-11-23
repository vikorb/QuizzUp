import type { Knex } from 'knex'

/** Durée de conservation d'une demande de démonstration, traitée ou non, à compter de sa création. */
export const DEMO_REQUEST_RETENTION_MONTHS = 12

/**
 * Purge RGPD : supprime définitivement les demandes de démonstration créées il y a plus de
 * `DEMO_REQUEST_RETENTION_MONTHS` mois. L'intervalle est calculé par PostgreSQL (fin de mois
 * comprise), et la suppression est idempotente : aucun verrou nécessaire.
 *
 * Renvoie le nombre de demandes supprimées.
 */
export async function purgeExpiredDemoRequests(db: Knex, now: Date = new Date()): Promise<number> {
  return db('demo_requests')
    .whereRaw(`created_at < ?::timestamptz - interval '${DEMO_REQUEST_RETENTION_MONTHS} months'`, [
      now,
    ])
    .delete()
}
