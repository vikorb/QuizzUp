/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('themes', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('admin_id').notNullable()
    table.bigInteger('company_id').nullable()

    table.string('scope', 50).notNullable().defaultTo('global')
    table.string('name', 255).notNullable()
    table.string('mode', 50).notNullable()

    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()
    table.timestamp('deleted_at', { useTz: true }).nullable()

    table.foreign('admin_id').references('id').inTable('admins').onDelete('RESTRICT')
    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE')

    table.index(['admin_id'], 'themes_admin_id_index')
    table.index(['company_id'], 'themes_company_id_index')
    table.index(['name'], 'themes_name_index')
    table.index(['status'], 'themes_status_index')
    table.index(['scope'], 'themes_scope_index')
  })

  await knex.raw(`
    ALTER TABLE themes
    ADD CONSTRAINT themes_status_check CHECK (status IN (0, 1, 2, 3)),
    ADD CONSTRAINT themes_mode_check CHECK (mode IN ('classic', 'image', 'audio', 'mixed')),
    ADD CONSTRAINT themes_scope_check CHECK (scope IN ('global', 'company')),
    ADD CONSTRAINT themes_scope_company_check CHECK (
      (scope = 'global' AND company_id IS NULL)
      OR
      (scope = 'company' AND company_id IS NOT NULL)
    ),
    ADD CONSTRAINT themes_deleted_at_check CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    )
  `)

  await knex.schema.createTable('questions', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('admin_id').notNullable()
    table.bigInteger('company_id').nullable()
    table.bigInteger('theme_id').notNullable()

    table.string('scope', 50).notNullable().defaultTo('global')
    table.text('question').notNullable()
    table.string('type_media', 50).notNullable().defaultTo('none')
    table.text('media_url').nullable()

    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()
    table.timestamp('deleted_at', { useTz: true }).nullable()

    table.foreign('admin_id').references('id').inTable('admins').onDelete('RESTRICT')
    table.foreign('company_id').references('id').inTable('companies').onDelete('CASCADE')
    table.foreign('theme_id').references('id').inTable('themes').onDelete('RESTRICT')

    table.index(['admin_id'], 'questions_admin_id_index')
    table.index(['company_id'], 'questions_company_id_index')
    table.index(['theme_id'], 'questions_theme_id_index')
    table.index(['status'], 'questions_status_index')
    table.index(['scope'], 'questions_scope_index')
  })

  await knex.raw(`
    ALTER TABLE questions
    ADD CONSTRAINT questions_status_check CHECK (status IN (0, 1, 2, 3)),
    ADD CONSTRAINT questions_type_media_check CHECK (type_media IN ('none', 'image', 'audio', 'video')),
    ADD CONSTRAINT questions_scope_check CHECK (scope IN ('global', 'company')),
    ADD CONSTRAINT questions_scope_company_check CHECK (
      (scope = 'global' AND company_id IS NULL)
      OR
      (scope = 'company' AND company_id IS NOT NULL)
    ),
    ADD CONSTRAINT questions_deleted_at_check CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    )
  `)

  await knex.schema.createTable('answers', (table) => {
    table.bigIncrements('id').primary()

    table.bigInteger('admin_id').notNullable()
    table.bigInteger('question_id').notNullable()

    table.text('response').notNullable()
    table.boolean('is_correct').notNullable().defaultTo(false)

    table.smallint('status').notNullable().defaultTo(1)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).nullable()
    table.timestamp('deleted_at', { useTz: true }).nullable()

    table.foreign('admin_id').references('id').inTable('admins').onDelete('RESTRICT')
    table.foreign('question_id').references('id').inTable('questions').onDelete('CASCADE')

    table.index(['admin_id'], 'answers_admin_id_index')
    table.index(['question_id'], 'answers_question_id_index')
    table.index(['status'], 'answers_status_index')
  })

  await knex.raw(`
    ALTER TABLE answers
    ADD CONSTRAINT answers_status_check CHECK (status IN (0, 1, 2, 3)),
    ADD CONSTRAINT answers_deleted_at_check CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX answers_one_correct_answer_per_question_index
    ON answers(question_id)
    WHERE is_correct = true AND status <> 2
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('answers')
  await knex.schema.dropTableIfExists('questions')
  await knex.schema.dropTableIfExists('themes')
}
