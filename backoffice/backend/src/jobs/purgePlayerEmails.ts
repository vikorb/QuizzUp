import type { Knex } from 'knex'

import { PLAYER_EMAIL_RETENTION_YEARS } from '@quizzup/shared'

/** Clé du verrou consultatif PostgreSQL : empêche deux purges (deux backends, purge manuelle) de se chevaucher. */
export const PLAYER_EMAIL_PURGE_LOCK_KEY = 7_424_001

/**
 * Date limite : un email dont la dernière partie est antérieure à cette date doit être effacé.
 * Le 29 février recule au 28 février quand l'année cible n'est pas bissextile.
 */
export function getPlayerEmailRetentionCutoff(
  now: Date,
  years: number = PLAYER_EMAIL_RETENTION_YEARS
): Date {
  const cutoff = new Date(now.getTime())
  const month = cutoff.getUTCMonth()

  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years)

  // 29/02 sans équivalent : JavaScript déborde sur le 1er mars, on revient au 28 février.
  if (cutoff.getUTCMonth() !== month) {
    cutoff.setUTCDate(0)
  }

  return cutoff
}

/**
 * Sélection SQL des (compagnie, email) périmés. Chaque apparition d'un email (1er joueur ou 2e
 * joueur d'un pupitre) est datée par `COALESCE(finished_at, started_at, created_at)` de sa partie ;
 * l'email est comparé sans tenir compte de la casse ni des espaces autour.
 *
 * Les parties supprimées logiquement (status = 2) comptent : leurs participants, donc l'email,
 * restent en base et la partie a bien eu lieu à cette date. Les ignorer pourrait effacer trop
 * tôt l'email d'un joueur qui a joué récemment.
 *
 * Le périmètre est la compagnie (`games.company_id`) : chaque centre licencié est responsable de
 * ses données et le consentement est donné au centre. Un email est donc effacé dans les parties
 * d'une compagnie quand sa dernière partie DANS CETTE COMPAGNIE est trop ancienne, même s'il a
 * joué récemment chez une autre.
 *
 * Tout est calculé par PostgreSQL (aucune ligne n'est chargée côté Node). La requête lit toute
 * la table des participants ayant un email : acceptable pour une exécution quotidienne.
 */
const EXPIRED_EMAILS_CTE = `
  WITH occurrences AS (
    SELECT
      g.company_id,
      lower(btrim(gp.email)) AS email_key,
      COALESCE(g.finished_at, g.started_at, g.created_at) AS played_at
    FROM game_participants gp
    JOIN games g ON g.id = gp.game_id
    WHERE gp.email IS NOT NULL
    UNION ALL
    SELECT
      g.company_id,
      lower(btrim(gp.second_email)) AS email_key,
      COALESCE(g.finished_at, g.started_at, g.created_at) AS played_at
    FROM game_participants gp
    JOIN games g ON g.id = gp.game_id
    WHERE gp.second_email IS NOT NULL
  ),
  expired AS (
    SELECT company_id, email_key
    FROM occurrences
    GROUP BY company_id, email_key
    HAVING max(played_at) < :cutoff
  )
`

// Seuls l'email et son consentement sont effacés ; noms et scores sont conservés.
const CLEAR_FIRST_PLAYER_SQL = `
  ${EXPIRED_EMAILS_CTE}
  UPDATE game_participants gp
  SET email = NULL, consent_at = NULL, updated_at = :now
  FROM games g, expired e
  WHERE g.id = gp.game_id
    AND gp.email IS NOT NULL
    AND e.company_id = g.company_id
    AND e.email_key = lower(btrim(gp.email))
`

const CLEAR_SECOND_PLAYER_SQL = `
  ${EXPIRED_EMAILS_CTE}
  UPDATE game_participants gp
  SET second_email = NULL, second_consent_at = NULL, updated_at = :now
  FROM games g, expired e
  WHERE g.id = gp.game_id
    AND gp.second_email IS NOT NULL
    AND e.company_id = g.company_id
    AND e.email_key = lower(btrim(gp.second_email))
`

async function countUpdated(
  trx: Knex.Transaction,
  sql: string,
  bindings: { cutoff: Date; now: Date }
): Promise<number> {
  const result = (await trx.raw(sql, bindings)) as { rowCount?: number | null }

  return result.rowCount ?? 0
}

/**
 * Purge RGPD : efface les emails des joueurs (1er et 2e joueur) dont la dernière partie, dans
 * une compagnie, date de plus de `PLAYER_EMAIL_RETENTION_YEARS` ans — partout où ils apparaissent
 * dans les parties de cette compagnie. Une seule transaction, sous verrou consultatif.
 *
 * Renvoie le nombre d'emails effacés (un par colonne `email` / `second_email` modifiée : une ligne
 * dont les deux joueurs sont purgés compte deux fois).
 */
export async function purgeExpiredPlayerEmails(db: Knex, now: Date = new Date()): Promise<number> {
  const bindings = { cutoff: getPlayerEmailRetentionCutoff(now), now }

  return db.transaction(async (trx) => {
    // Verrou libéré automatiquement à la fin de la transaction.
    await trx.raw('SELECT pg_advisory_xact_lock(?)', [PLAYER_EMAIL_PURGE_LOCK_KEY])

    const firstPlayers = await countUpdated(trx, CLEAR_FIRST_PLAYER_SQL, bindings)
    const secondPlayers = await countUpdated(trx, CLEAR_SECOND_PLAYER_SQL, bindings)

    return firstPlayers + secondPlayers
  })
}
