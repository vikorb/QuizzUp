exports.up = async function (knex) {
  await knex.schema.createTable('companies', (table) => {
    table.bigIncrements('id').primary()
    table.string('name', 255).notNullable()
    table.string('email', 255).notNullable()
  })

  await knex.schema.createTable('admins', (table) => {
    table.bigIncrements('id').primary()

    table
      .bigInteger('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT')

    table.string('role', 50).notNullable()

    table.string('firstname', 255).nullable()
    table.string('lastname', 255).nullable()

    table.string('username', 255).notNullable()
    table.string('email', 255).notNullable()

    table.string('mdp_hash', 255).notNullable()

    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at').nullable()
    table.timestamp('deleted_at').nullable()

    table.index(['company_id'])
    table.index(['company_id', 'status'])

    table.check('status in (1,2,3)')
    table.check(`(status = 3 AND deleted_at IS NOT NULL) OR (status <> 3 AND deleted_at IS NULL)`)
  })

  await knex.raw(`CREATE UNIQUE INDEX companies_name_unique_ci ON companies (lower(name));`)
  await knex.raw(`CREATE UNIQUE INDEX admins_username_unique_ci ON admins (lower(username));`)
  await knex.raw(`CREATE UNIQUE INDEX admins_email_unique_ci ON admins (lower(email));`)
}

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS admins_email_unique_ci;`)
  await knex.raw(`DROP INDEX IF EXISTS admins_username_unique_ci;`)
  await knex.raw(`DROP INDEX IF EXISTS companies_name_unique_ci;`)

  await knex.schema.dropTableIfExists('admins')
  await knex.schema.dropTableIfExists('companies')
}
