/**
 * Salles de jeu d'une compagnie (US-ROOM-01).
 * `config` porte la configuration matérielle (buzzers, équipements lumière/fumée)
 * dont le format est défini côté application.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.createTable('rooms', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('company_id').notNullable()

    table.string('name', 255).notNullable()
    table.jsonb('config').notNullable().defaultTo('{}')

    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()
    table.timestamp('deleted_at', { useTz: true }).nullable()

    table.foreign('company_id').references('id').inTable('companies').onDelete('RESTRICT')

    table.index(['company_id'], 'rooms_company_id_index')
    table.index(['company_id', 'status'], 'rooms_company_id_status_index')
  })

  await knex.raw(`
    ALTER TABLE rooms
    ADD CONSTRAINT rooms_status_check CHECK (status IN (0, 1, 2)),
    ADD CONSTRAINT rooms_deleted_at_check CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX rooms_company_id_name_unique_ci
    ON rooms(company_id, LOWER(name))
    WHERE status <> 2
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('rooms')
}
