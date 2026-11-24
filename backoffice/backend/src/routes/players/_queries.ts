import type { Knex } from 'knex'

import { GAME_STATE_FINISHED, GAME_STATUS_DELETED, PLAYER_ERASED_NAME } from '@quizzup/shared'

import db from '../../db'

/**
 * Un joueur est une adresse e-mail normalisée (`lower(btrim(email))`) dans une compagnie, la règle
 * de la purge RGPD. Il se lit sur les pupitres des parties, premier et second joueur ; la date
 * d'une apparition est celle de la purge (`COALESCE(finished_at, started_at, created_at)`).
 *
 * Toutes les parties de la compagnie comptent, supprimées logiquement comprises : un e-mail stocké
 * doit pouvoir se retrouver, s'exporter et s'effacer. Les demandes d'inscription en attente ne sont
 * pas des joueurs (elles n'ont rien joué) : seuls l'effacement et la désinscription les touchent.
 *
 * Le nom et le consentement aux offres sont ceux de la dernière apparition : un joueur qui, à sa
 * dernière partie, n'accepte plus les offres n'est pas relancé. `slot` ordonne les deux joueurs
 * d'un même pupitre.
 */
const PLAYERS_CTE = `
  WITH occurrences AS (
    SELECT
      lower(btrim(gp.email)) AS email_key,
      gp.display_name AS name,
      gp.marketing_consent_at AS marketing_at,
      gp.score,
      gp.game_id,
      gp.id AS participant_id,
      1 AS slot,
      COALESCE(g.finished_at, g.started_at, g.created_at) AS played_at
    FROM game_participants gp
    JOIN games g ON g.id = gp.game_id
    WHERE g.company_id = :companyId AND gp.email IS NOT NULL
    UNION ALL
    SELECT
      lower(btrim(gp.second_email)),
      gp.second_display_name,
      gp.second_marketing_consent_at,
      gp.score,
      gp.game_id,
      gp.id,
      2,
      COALESCE(g.finished_at, g.started_at, g.created_at)
    FROM game_participants gp
    JOIN games g ON g.id = gp.game_id
    WHERE g.company_id = :companyId AND gp.second_email IS NOT NULL
  ),
  players AS (
    SELECT
      email_key,
      (array_agg(name ORDER BY played_at DESC, participant_id DESC, slot DESC))[1] AS display_name,
      CAST(count(DISTINCT game_id) AS integer) AS sessions,
      max(played_at) AS last_played_at,
      max(score) AS best_score,
      (array_agg(marketing_at ORDER BY played_at DESC, participant_id DESC, slot DESC))[1]
        AS marketing_consent_at
    FROM occurrences
    GROUP BY email_key
  )
`

const PLAYER_COLUMNS = `
  email_key AS email,
  display_name AS "displayName",
  sessions,
  last_played_at AS "lastPlayedAt",
  best_score AS "bestScore",
  marketing_consent_at AS "marketingConsentAt"
`

type PlayerDbRow = {
  email: string
  displayName: string | null
  sessions: number
  lastPlayedAt: Date
  bestScore: number
  marketingConsentAt: Date | null
}

export type ListedPlayer = {
  email: string
  displayName: string
  sessions: number
  lastPlayedAt: string
  bestScore: number
  marketingConsent: boolean
}

export type ExportedPlayer = {
  email: string
  displayName: string
  lastPlayedAt: string
  sessions: number
  marketingConsentAt: string
}

/** Échappe `%`, `_` et `\` : la recherche est un morceau de nom, pas un motif. */
function toLikePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

async function queryRows<T>(sql: string, bindings: Knex.RawBinding): Promise<T[]> {
  const result = (await db.raw(sql, bindings)) as { rows: T[] }

  return result.rows
}

/** Joueurs d'une compagnie, le plus récemment vu d'abord. `search` filtre sur le nom. */
export async function listPlayers(params: {
  companyId: number
  search?: string
  limit: number
  offset: number
}): Promise<{ players: ListedPlayer[]; total: number }> {
  const { companyId, search, limit, offset } = params
  const filter = search ? "WHERE display_name ILIKE :pattern ESCAPE '\\'" : ''
  const bindings = { companyId, pattern: search ? toLikePattern(search) : '', limit, offset }

  const [rows, totals] = await Promise.all([
    queryRows<PlayerDbRow>(
      `${PLAYERS_CTE}
       SELECT ${PLAYER_COLUMNS} FROM players ${filter}
       ORDER BY last_played_at DESC, email_key ASC
       LIMIT :limit OFFSET :offset`,
      bindings
    ),
    queryRows<{ total: number }>(
      `${PLAYERS_CTE} SELECT CAST(count(*) AS integer) AS total FROM players ${filter}`,
      bindings
    ),
  ])

  return {
    players: rows.map((row) => ({
      email: row.email,
      displayName: row.displayName ?? '',
      sessions: row.sessions,
      lastPlayedAt: new Date(row.lastPlayedAt).toISOString(),
      bestScore: row.bestScore,
      marketingConsent: row.marketingConsentAt !== null,
    })),
    total: totals[0]?.total ?? 0,
  }
}

/** Joueurs sans e-mail des parties terminées (pupitres et seconds joueurs) : on ne peut que les compter. */
export async function countAnonymousPlayers(companyId: number): Promise<number> {
  const rows = await queryRows<{ total: number }>(
    `SELECT CAST(
       count(*) FILTER (WHERE gp.email IS NULL)
       + count(*) FILTER (WHERE gp.second_display_name IS NOT NULL AND gp.second_email IS NULL)
       AS integer) AS total
     FROM game_participants gp
     JOIN games g ON g.id = gp.game_id
     WHERE g.company_id = :companyId AND g.state = :state AND g.status <> :deleted`,
    { companyId, state: GAME_STATE_FINISHED, deleted: GAME_STATUS_DELETED }
  )

  return rows[0]?.total ?? 0
}

/** Joueurs dont le dernier consentement aux offres est donné, par adresse. */
export async function listMarketingPlayers(companyId: number): Promise<ExportedPlayer[]> {
  const rows = await queryRows<PlayerDbRow>(
    `${PLAYERS_CTE}
     SELECT ${PLAYER_COLUMNS} FROM players
     WHERE marketing_consent_at IS NOT NULL
     ORDER BY email_key ASC`,
    { companyId }
  )

  return rows.map((row) => ({
    email: row.email,
    displayName: row.displayName ?? '',
    lastPlayedAt: new Date(row.lastPlayedAt).toISOString(),
    sessions: row.sessions,
    marketingConsentAt: new Date(row.marketingConsentAt as Date).toISOString(),
  }))
}

async function rowCount(trx: Knex.Transaction, sql: string, bindings: Knex.RawBinding) {
  const result = (await trx.raw(sql, bindings)) as { rowCount?: number | null }

  return result.rowCount ?? 0
}

/**
 * Retire le consentement aux offres de l'adresse, partout dans la compagnie : pupitres des parties
 * et demandes en attente. Ne dit pas si l'adresse existait.
 */
export async function withdrawMarketingConsent(companyId: number, email: string): Promise<void> {
  const bindings = { companyId, email, now: new Date() }

  await db.transaction(async (trx) => {
    await trx.raw(
      `UPDATE game_participants gp
       SET marketing_consent_at = NULL, updated_at = :now
       FROM games g
       WHERE g.id = gp.game_id AND g.company_id = :companyId
         AND gp.marketing_consent_at IS NOT NULL
         AND lower(btrim(gp.email)) = lower(btrim(:email))`,
      bindings
    )
    await trx.raw(
      `UPDATE game_participants gp
       SET second_marketing_consent_at = NULL, updated_at = :now
       FROM games g
       WHERE g.id = gp.game_id AND g.company_id = :companyId
         AND gp.second_marketing_consent_at IS NOT NULL
         AND lower(btrim(gp.second_email)) = lower(btrim(:email))`,
      bindings
    )
    await trx.raw(
      `UPDATE game_registrations gr
       SET marketing_consent_at = NULL
       FROM games g
       WHERE g.id = gr.game_id AND g.company_id = :companyId
         AND gr.marketing_consent_at IS NOT NULL
         AND lower(btrim(gr.email)) = lower(btrim(:email))`,
      bindings
    )
    await trx.raw(
      `UPDATE game_registrations gr
       SET second_marketing_consent_at = NULL
       FROM games g
       WHERE g.id = gr.game_id AND g.company_id = :companyId
         AND gr.second_marketing_consent_at IS NOT NULL
         AND lower(btrim(gr.second_email)) = lower(btrim(:email))`,
      bindings
    )
  })
}

/**
 * Droit à l'effacement : dans toute la compagnie, l'adresse et ses consentements sont mis à null
 * et le nom du joueur est remplacé par un libellé fixe (Q13), sur chaque pupitre où l'adresse
 * figure. Scores, rangs et autre joueur du pupitre restent. Les demandes d'inscription en attente
 * qui la portent sont supprimées. Une seule transaction.
 *
 * Renvoie le nombre de joueurs de pupitre effacés plus le nombre de demandes supprimées ; 0 si
 * l'adresse est inconnue de la compagnie (rien n'a été écrit).
 */
export async function erasePlayer(companyId: number, email: string): Promise<number> {
  const bindings = { companyId, email, now: new Date(), name: PLAYER_ERASED_NAME }

  return db.transaction(async (trx) => {
    const first = await rowCount(
      trx,
      `UPDATE game_participants gp
       SET display_name = :name, email = NULL, consent_at = NULL, marketing_consent_at = NULL,
         updated_at = :now
       FROM games g
       WHERE g.id = gp.game_id AND g.company_id = :companyId
         AND lower(btrim(gp.email)) = lower(btrim(:email))`,
      bindings
    )
    const second = await rowCount(
      trx,
      `UPDATE game_participants gp
       SET second_display_name = :name, second_email = NULL, second_consent_at = NULL,
         second_marketing_consent_at = NULL, updated_at = :now
       FROM games g
       WHERE g.id = gp.game_id AND g.company_id = :companyId
         AND lower(btrim(gp.second_email)) = lower(btrim(:email))`,
      bindings
    )
    // La demande entière part, second joueur compris : une demande en attente n'a rien joué, le
    // second joueur peut se réinscrire.
    const registrations = await rowCount(
      trx,
      `DELETE FROM game_registrations gr
       USING games g
       WHERE g.id = gr.game_id AND g.company_id = :companyId
         AND (lower(btrim(gr.email)) = lower(btrim(:email))
           OR lower(btrim(gr.second_email)) = lower(btrim(:email)))`,
      bindings
    )

    return first + second + registrations
  })
}
