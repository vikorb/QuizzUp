exports.up = async function (knex) {
  await knex.schema.createTable("companies", (t) => {
    t.bigIncrements("id").primary()
    t.string("name", 255).notNullable()
    t.string("email", 255).notNullable()
  })

  await knex.schema.createTable("admins", (t) => {
    t.bigIncrements("id").primary()

    t.bigInteger("company_id").notNullable()
      .references("id")
      .inTable("companies")
      .onDelete("RESTRICT")

    t.string("role", 50).notNullable()

    t.string("firstname", 255).nullable()
    t.string("lastname", 255).nullable()

    t.string("username", 255).notNullable()
    t.string("email", 255).notNullable()

    t.string("mdp_hash", 255).notNullable()

    t.smallint("status").notNullable().defaultTo(1)
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    t.timestamp("updated_at").nullable()
    t.timestamp("deleted_at").nullable()

    t.index(["company_id"])
    t.index(["company_id", "status"])

    t.check("status in (1,2,3)")
    t.check(`(status = 3 AND deleted_at IS NOT NULL) OR (status <> 3 AND deleted_at IS NULL)`)
  })

  await knex.raw(`CREATE UNIQUE INDEX companies_name_unique_ci ON companies (lower(name));`)
  await knex.raw(`CREATE UNIQUE INDEX admins_username_unique_ci ON admins (lower(username));`)
  await knex.raw(`CREATE UNIQUE INDEX admins_email_unique_ci ON admins (lower(email));`)
}

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS admins_email_unique_ci;`)
  await knex.raw(`DROP INDEX IF EXISTS admins_username_unique_ci;`)
  await knex.raw(`DROP INDEX IF EXISTS companies_name_unique_ci;`)

  await knex.schema.dropTableIfExists("admins")
  await knex.schema.dropTableIfExists("companies")
}