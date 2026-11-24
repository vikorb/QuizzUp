/**
 * API de réservation `/public/v1` (lot 14, socle B).
 *
 * - `api_keys` : une clé d'API par intégration d'une compagnie. On ne stocke que l'empreinte
 *   SHA-256 du jeton (`key_hash`) et son préfixe d'affichage (`key_prefix`). La révocation suit la
 *   convention commune : `status = 2` et `deleted_at` renseigné.
 * - `api_idempotency_keys` : une clé `Idempotency-Key` déjà vue, avec l'empreinte du corps
 *   (`request_hash`) et la partie créée. Portée = la compagnie, pour qu'un nouvel essai fait après
 *   une rotation de clé soit encore dédupliqué. Purgée après `API_IDEMPOTENCY_TTL_HOURS`.
 * - `api_request_logs` : journal des appels, sans adresse IP, corps ni paramètres de requête (la
 *   route est le motif, jamais l'URL brute). Conservé `API_LOG_RETENTION_DAYS` jours.
 * - `games.api_key_id` : clé qui a créé la réservation. `games.admin_id` devient facultatif ; une
 *   partie a toujours un créateur (`games_creator_check`).
 *
 * Aucune de ces tables ne contient d'e-mail. Les valeurs de `api_keys.status` restent alignées sur
 * `API_KEY_STATUSES` de `@quizzup/shared` (test `apiKeysSchema.test.ts`).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // `games` est modifiée : si une transaction longue la tient, mieux vaut échouer vite que bloquer
  // en file d'attente toutes les requêtes de parties. Vaut pour la transaction de la migration.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.createTable('api_keys', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('company_id').notNullable()
    table.string('name', 100).notNullable()
    table.string('key_prefix', 16).notNullable()
    table.specificType('key_hash', 'char(64)').notNullable()
    table.bigInteger('created_by_admin_id').nullable()
    table.timestamp('last_used_at', { useTz: true }).nullable()

    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()
    table.timestamp('deleted_at', { useTz: true }).nullable()

    table.foreign('company_id').references('id').inTable('companies').onDelete('RESTRICT')
    table.foreign('created_by_admin_id').references('id').inTable('admins').onDelete('RESTRICT')

    table.unique(['key_prefix'], { indexName: 'api_keys_key_prefix_unique' })
    table.unique(['key_hash'], { indexName: 'api_keys_key_hash_unique' })
    table.index(['company_id', 'status'], 'api_keys_company_id_status_index')
  })

  await knex.raw(`
    ALTER TABLE api_keys
    ADD CONSTRAINT api_keys_status_check CHECK (status IN (1, 2)),
    ADD CONSTRAINT api_keys_deleted_at_check CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    )
  `)

  await knex.schema.createTable('api_idempotency_keys', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('company_id').notNullable()
    table.bigInteger('api_key_id').notNullable()
    table.string('idempotency_key', 255).notNullable()
    table.specificType('request_hash', 'char(64)').notNullable()
    table.bigInteger('game_id').notNullable()

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.foreign('company_id').references('id').inTable('companies').onDelete('RESTRICT')
    table.foreign('api_key_id').references('id').inTable('api_keys').onDelete('RESTRICT')
    table.foreign('game_id').references('id').inTable('games').onDelete('CASCADE')

    table.unique(['company_id', 'idempotency_key'], {
      indexName: 'api_idempotency_keys_company_id_key_unique',
    })
    table.index(['created_at'], 'api_idempotency_keys_created_at_index')
  })

  await knex.schema.createTable('api_request_logs', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('company_id').notNullable()
    table.bigInteger('api_key_id').notNullable()
    table.string('method', 8).notNullable()
    table.string('route', 120).notNullable()
    table.smallint('status_code').notNullable()
    table.string('error_code', 80).nullable()
    table.bigInteger('game_id').nullable()
    table.integer('duration_ms').notNullable()
    table.boolean('idempotent_replay').notNullable().defaultTo(false)

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.foreign('company_id').references('id').inTable('companies').onDelete('RESTRICT')
    table.foreign('api_key_id').references('id').inTable('api_keys').onDelete('RESTRICT')
    table.foreign('game_id').references('id').inTable('games').onDelete('SET NULL')

    table.index(['created_at'], 'api_request_logs_created_at_index')
  })

  // Lecture du journal : les plus récents d'abord, pagination par curseur sur l'id.
  await knex.raw(`
    CREATE INDEX api_request_logs_company_id_created_at_index
    ON api_request_logs (company_id, created_at DESC, id DESC)
  `)

  await knex.schema.alterTable('games', (table) => {
    table.bigInteger('api_key_id').nullable()

    table.foreign('api_key_id').references('id').inTable('api_keys').onDelete('RESTRICT')
    table.index(['api_key_id'], 'games_api_key_id_index')
  })

  await knex.raw(`
    ALTER TABLE games
    ALTER COLUMN admin_id DROP NOT NULL,
    ADD CONSTRAINT games_creator_check CHECK (admin_id IS NOT NULL OR api_key_id IS NOT NULL)
  `)
}

/**
 * Retour arrière refusé tant qu'une partie n'a pas de compte créateur (réservation faite par
 * l'API) ou porte une clé d'API : `admin_id` redeviendrait obligatoire et le lien serait perdu.
 * Les clés, l'idempotence et le journal sont supprimés avec leurs tables : une clé se recrée, le
 * journal et l'idempotence sont temporaires.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const apiGame = await knex('games').whereNull('admin_id').orWhereNotNull('api_key_id').first('id')

  if (apiGame) {
    throw new Error(
      'Rollback impossible : des parties ont été réservées par l\'API (games.admin_id nul ou games.api_key_id renseigné).'
    )
  }

  await knex.raw(`
    ALTER TABLE games
    DROP CONSTRAINT games_creator_check,
    ALTER COLUMN admin_id SET NOT NULL
  `)

  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('api_key_id')
  })

  await knex.schema.dropTableIfExists('api_request_logs')
  await knex.schema.dropTableIfExists('api_idempotency_keys')
  await knex.schema.dropTableIfExists('api_keys')
}
