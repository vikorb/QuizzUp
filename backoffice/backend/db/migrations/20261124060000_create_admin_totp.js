/**
 * Double authentification TOTP du superadmin (lot 12d).
 *
 * - `admin_totp` : un secret par admin, chiffré (AES-256-GCM, `v1.<iv>.<tag>.<chiffré>` en base64 ;
 *   la clé `TOTP_ENCRYPTION_KEY` n'est jamais en base). `confirmed_at` reste nul pendant
 *   l'enrôlement. `last_used_step` sert à l'anti-rejeu ; `failed_attempts` et `locked_until` à la
 *   limite d'essais.
 * - `admin_totp_recovery_codes` : codes de secours, stockés hachés (SHA-256), à usage unique
 *   (`used_at`). Un index unique sur (`admin_id`, `code_hash`) empêche un doublon.
 * - `up` révoque les sessions superadmin ouvertes : aucune session d'avant la double
 *   authentification ne survit au déploiement (les superadmins se reconnectent et s'enrôlent).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('admin_totp', (table) => {
    table
      .bigInteger('admin_id')
      .primary()
      .references('id')
      .inTable('admins')
      .onDelete('CASCADE')
    table.text('secret_enc').notNullable()
    table.timestamp('confirmed_at', { useTz: true }).nullable()
    table.bigInteger('last_used_step').nullable()
    table.smallint('failed_attempts').notNullable().defaultTo(0)
    table.timestamp('locked_until', { useTz: true }).nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('admin_totp_recovery_codes', (table) => {
    table.bigIncrements('id').primary()
    table
      .bigInteger('admin_id')
      .notNullable()
      .references('id')
      .inTable('admins')
      .onDelete('CASCADE')
    table.specificType('code_hash', 'char(64)').notNullable()
    table.timestamp('used_at', { useTz: true }).nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.unique(['admin_id', 'code_hash'], {
      indexName: 'admin_totp_recovery_codes_admin_id_code_hash_unique',
    })
  })

  await knex('admin_sessions')
    .whereNull('revoked_at')
    .whereIn('admin_id', knex('admins').select('id').where({ role: 'superadmin' }))
    .update({ revoked_at: knex.fn.now() })
}

/**
 * Supprime les deux tables sans refuser, même si elles contiennent des lignes : ce sont des
 * données de sécurité que seul un nouvel enrôlement recrée, pas des données métier. Les sessions
 * révoquées par `up` ne sont pas rétablies.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('admin_totp_recovery_codes')
  await knex.schema.dropTableIfExists('admin_totp')
}
