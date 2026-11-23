/**
 * Sessions programmées (lot 13). Une session reste une ligne de `games` : elle reçoit deux
 * nouveaux états (`scheduled`, `cancelled`) et un intervalle prévu `[scheduled_at, scheduled_end_at)`.
 *
 * - On stocke la fin plutôt qu'une durée : `timestamptz + interval` n'est pas immuable pour
 *   PostgreSQL, il ne peut pas servir dans une contrainte d'exclusion (`tstzrange(a, b)` si).
 * - `games_room_schedule_no_overlap` interdit le chevauchement dans une salle (SQLSTATE 23P01).
 *   Intervalles semi-ouverts : deux sessions bout à bout sont acceptées. Le filtre
 *   `scheduled_at IS NOT NULL` est indispensable (`tstzrange(NULL, NULL)` est infini). Seuls les
 *   états scheduled / pending / running occupent un créneau ; annulée, terminée ou arrêtée libère.
 * - `games_room_id_active_unique` (une partie pending/running par salle) ne change pas : plusieurs
 *   sessions `scheduled` cohabitent dans une salle.
 * - `rooms.schedule` : réglages de créneaux (format `RoomSchedule` de `@quizzup/shared`), nul = salle
 *   sans créneaux. Colonne dédiée : `rooms.config` appartient au PC de salle.
 * - `btree_gist` (comparer `room_id` avec `=` dans un index GiST) : extension « trusted » depuis
 *   PostgreSQL 13, le rôle qui migre doit avoir le droit CREATE sur la base.
 *
 * Les valeurs des CHECK restent alignées sur `GAME_STATES`, `GAME_MAX_PLAYERS`, `GAME_LOCALES` et
 * `GAME_EXTERNAL_REF_MAX_LENGTH` de `@quizzup/shared` (test `gameSchema.test.ts`).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Si une transaction longue tient `games` ou `rooms`, mieux vaut échouer vite que bloquer en
  // file d'attente toutes les requêtes de parties. Vaut pour la transaction de la migration.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist')

  await knex.schema.alterTable('games', (table) => {
    table.timestamp('scheduled_at', { useTz: true }).nullable()
    table.timestamp('scheduled_end_at', { useTz: true }).nullable()
    table.timestamp('cancelled_at', { useTz: true }).nullable()
    table.smallint('players_count').nullable()
    table.string('external_ref', 100).nullable()
    table.string('locale', 5).nullable()
  })

  await knex.schema.alterTable('rooms', (table) => {
    table.jsonb('schedule').nullable()
  })

  await knex.raw(`
    ALTER TABLE games
    DROP CONSTRAINT games_state_check,
    ADD CONSTRAINT games_state_check CHECK (
      state IN ('scheduled', 'pending', 'running', 'finished', 'aborted', 'cancelled')
    ),
    ADD CONSTRAINT games_players_count_check CHECK (players_count BETWEEN 1 AND 12),
    ADD CONSTRAINT games_locale_check CHECK (locale IS NULL OR locale IN ('fr', 'en')),
    ADD CONSTRAINT games_schedule_range_check CHECK (
      (scheduled_at IS NULL AND scheduled_end_at IS NULL)
      OR
      (scheduled_at IS NOT NULL AND scheduled_end_at IS NOT NULL AND scheduled_end_at > scheduled_at)
    ),
    ADD CONSTRAINT games_scheduled_state_check CHECK (
      state <> 'scheduled' OR scheduled_at IS NOT NULL
    ),
    ADD CONSTRAINT games_cancelled_check CHECK (
      (state = 'cancelled') = (cancelled_at IS NOT NULL)
    )
  `)

  await knex.raw(`
    ALTER TABLE games
    ADD CONSTRAINT games_room_schedule_no_overlap EXCLUDE USING gist (
      room_id WITH =,
      tstzrange(scheduled_at, scheduled_end_at, '[)') WITH &&
    )
    WHERE (
      scheduled_at IS NOT NULL
      AND status <> 2
      AND state IN ('scheduled', 'pending', 'running')
    )
  `)

  // Agenda d'une compagnie : sessions programmées triées par date.
  await knex.raw(`
    CREATE INDEX games_company_id_scheduled_at_index
    ON games(company_id, scheduled_at)
    WHERE scheduled_at IS NOT NULL
  `)
}

/**
 * Retour arrière refusé tant qu'il reste des données propres aux sessions programmées : les
 * supprimer fausserait l'agenda et l'historique. L'extension `btree_gist` reste en place
 * (`IF NOT EXISTS` permet de rejouer la migration).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const usedGame = await knex('games')
    .whereIn('state', ['scheduled', 'cancelled'])
    .orWhereNotNull('scheduled_at')
    .orWhereNotNull('players_count')
    .orWhereNotNull('external_ref')
    .orWhereNotNull('locale')
    .first('id')

  if (usedGame) {
    throw new Error(
      'Rollback impossible : des parties sont programmées, annulées ou portent des données de réservation (games.scheduled_at, state scheduled/cancelled, players_count, external_ref, locale).'
    )
  }

  const usedRoom = await knex('rooms').whereNotNull('schedule').first('id')

  if (usedRoom) {
    throw new Error('Rollback impossible : des salles ont des réglages de créneaux (rooms.schedule).')
  }

  await knex.raw('DROP INDEX IF EXISTS games_company_id_scheduled_at_index')

  await knex.raw(`
    ALTER TABLE games
    DROP CONSTRAINT games_room_schedule_no_overlap,
    DROP CONSTRAINT games_cancelled_check,
    DROP CONSTRAINT games_scheduled_state_check,
    DROP CONSTRAINT games_schedule_range_check,
    DROP CONSTRAINT games_locale_check,
    DROP CONSTRAINT games_players_count_check,
    DROP CONSTRAINT games_state_check,
    ADD CONSTRAINT games_state_check CHECK (state IN ('pending', 'running', 'finished', 'aborted'))
  `)

  await knex.schema.alterTable('rooms', (table) => {
    table.dropColumn('schedule')
  })

  await knex.schema.alterTable('games', (table) => {
    table.dropColumns(
      'scheduled_at',
      'scheduled_end_at',
      'cancelled_at',
      'players_count',
      'external_ref',
      'locale'
    )
  })
}
