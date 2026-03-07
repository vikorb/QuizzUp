exports.up = async function (knex) {
  await knex.schema.alterTable('companies', (table) => {
    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at').nullable()
    table.timestamp('deleted_at').nullable()

    table.index(['status'])
  })

  await knex.raw(`ALTER TABLE companies ADD CONSTRAINT companies_status_check CHECK (status in (1,2));`)
  await knex.raw(`
    ALTER TABLE companies
    ADD CONSTRAINT companies_status_deleted_at_check
    CHECK ((status = 2 AND deleted_at IS NOT NULL) OR (status <> 2 AND deleted_at IS NULL));
  `)

  await knex.raw(`CREATE UNIQUE INDEX companies_email_unique_ci ON companies (lower(email));`)
}

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS companies_email_unique_ci;`)
  await knex.raw(`ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_deleted_at_check;`)
  await knex.raw(`ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;`)

  await knex.schema.alterTable('companies', (table) => {
    table.dropIndex(['status'])
    table.dropColumn('status')
    table.dropColumn('created_at')
    table.dropColumn('updated_at')
    table.dropColumn('deleted_at')
  })
}
