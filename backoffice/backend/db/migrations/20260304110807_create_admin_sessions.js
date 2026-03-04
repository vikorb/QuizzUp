exports.up = async function (knex) {
  await knex.schema.createTable('admin_sessions', (table) => {
    table.uuid('id').primary()
    table
      .bigInteger('admin_id')
      .notNullable()
      .references('id')
      .inTable('admins')
      .onDelete('CASCADE')

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('last_seen_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('revoked_at').nullable()

    table.index(['admin_id'])
    table.index(['last_seen_at'])
    table.index(['revoked_at'])
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('admin_sessions')
}
