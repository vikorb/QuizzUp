/**
 * Bons de fidélisation (lot 6b).
 *
 * - `companies.voucher_label` : libellé du bon d'un centre, nul = bons désactivés ;
 *   `companies.voucher_validity_days` : durée de validité (1 à 730 jours, 90 par défaut). Les bornes
 *   reprennent `VOUCHER_VALIDITY_*` de `@quizzup/shared`.
 * - `vouchers` : un bon par pupitre et par partie (index unique partiel), code `XXXX-XXXX` unique
 *   (alphabet de Crockford sans I, L, O ni U, soit 40 bits aléatoires), usage unique (`redeemed_at`).
 *   `label` est la copie du libellé du centre à l'émission : changer le libellé ne touche pas aux
 *   bons déjà émis. Aucune donnée personnelle : le bénéficiaire se lit via `participant_id`.
 * - L'état affiché (`valid`, `redeemed`, `expired`, `cancelled`) est calculé, jamais stocké.
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Ne pas bloquer les requêtes de la table `companies` si un verrou est déjà pris.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('companies', (table) => {
    table.string('voucher_label', 120).nullable()
    table.smallint('voucher_validity_days').notNullable().defaultTo(90)
  })

  await knex.raw(`
    ALTER TABLE companies
    ADD CONSTRAINT companies_voucher_validity_days_check
    CHECK (voucher_validity_days BETWEEN 1 AND 730)
  `)

  await knex.schema.createTable('vouchers', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('company_id').notNullable()
    table.bigInteger('game_id').notNullable()
    table.bigInteger('participant_id').notNullable()

    table.string('code', 9).notNullable()
    table.string('label', 120).notNullable()
    table.timestamp('expires_at', { useTz: true }).notNullable()

    table.timestamp('redeemed_at', { useTz: true }).nullable()
    table.bigInteger('redeemed_by').nullable()
    table.bigInteger('created_by').notNullable()

    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()
    table.timestamp('deleted_at', { useTz: true }).nullable()

    table.foreign('company_id').references('id').inTable('companies').onDelete('RESTRICT')
    table.foreign('game_id').references('id').inTable('games').onDelete('RESTRICT')
    table
      .foreign('participant_id')
      .references('id')
      .inTable('game_participants')
      .onDelete('RESTRICT')
    table.foreign('redeemed_by').references('id').inTable('admins').onDelete('SET NULL')
    table.foreign('created_by').references('id').inTable('admins').onDelete('RESTRICT')

    table.unique(['code'], { indexName: 'vouchers_code_unique' })
    table.index(['company_id', 'created_at'], 'vouchers_company_id_created_at_index')
    table.index(['game_id'], 'vouchers_game_id_index')
  })

  await knex.raw(`
    CREATE UNIQUE INDEX vouchers_game_id_participant_id_active_unique
    ON vouchers(game_id, participant_id)
    WHERE status <> 2
  `)

  await knex.raw(`
    ALTER TABLE vouchers
    ADD CONSTRAINT vouchers_code_check CHECK (code ~ '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
    ADD CONSTRAINT vouchers_status_check CHECK (status IN (0, 1, 2)),
    ADD CONSTRAINT vouchers_deleted_at_check CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    ),
    ADD CONSTRAINT vouchers_redeemed_by_check CHECK (redeemed_at IS NOT NULL OR redeemed_by IS NULL)
  `)
}

/**
 * Retour arrière refusé tant qu'un bon existe ou qu'un centre a réglé son libellé : supprimer la
 * table ou la colonne détruirait des bons déjà remis aux joueurs.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const usedVoucher = await knex('vouchers').first('id')

  if (usedVoucher) {
    throw new Error('Rollback impossible : des bons existent (vouchers).')
  }

  const configuredCompany = await knex('companies').whereNotNull('voucher_label').first('id')

  if (configuredCompany) {
    throw new Error('Rollback impossible : des compagnies ont réglé leurs bons (voucher_label).')
  }

  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.dropTable('vouchers')

  await knex.schema.alterTable('companies', (table) => {
    table.dropColumn('voucher_label')
    table.dropColumn('voucher_validity_days')
  })
}
