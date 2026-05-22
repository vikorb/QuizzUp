/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('question_themes', (table) => {
    table.bigInteger('question_id').notNullable()
    table.bigInteger('theme_id').notNullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.primary(['question_id', 'theme_id'], {
      constraintName: 'question_themes_primary',
    })

    table
      .foreign('question_id', 'question_themes_question_id_foreign')
      .references('id')
      .inTable('questions')
      .onDelete('CASCADE')

    table
      .foreign('theme_id', 'question_themes_theme_id_foreign')
      .references('id')
      .inTable('themes')
      .onDelete('CASCADE')

    table.index(['question_id'], 'question_themes_question_id_index')
    table.index(['theme_id'], 'question_themes_theme_id_index')
  })

  const hasThemeIdColumn = await knex.schema.hasColumn('questions', 'theme_id')

  if (hasThemeIdColumn) {
    await knex.raw(`
      INSERT INTO question_themes (question_id, theme_id, created_at)
      SELECT id, theme_id, COALESCE(created_at, NOW())
      FROM questions
      WHERE theme_id IS NOT NULL
      ON CONFLICT (question_id, theme_id) DO NOTHING
    `)
    await knex.schema.alterTable('questions', (table) => {
      table.dropForeign(['theme_id'])
    })

    await knex.schema.alterTable('questions', (table) => {
      table.dropIndex(['theme_id'], 'questions_theme_id_index')
      table.dropColumn('theme_id')
    })
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasThemeIdColumn = await knex.schema.hasColumn('questions', 'theme_id')

  if (!hasThemeIdColumn) {
    await knex.schema.alterTable('questions', (table) => {
      table.bigInteger('theme_id').nullable()
    })

    await knex.raw(`
      UPDATE questions
      SET theme_id = selected_theme.theme_id
      FROM (
        SELECT DISTINCT ON (question_id) question_id, theme_id
        FROM question_themes
        ORDER BY question_id, theme_id
      ) AS selected_theme
      WHERE questions.id = selected_theme.question_id
    `)

    await knex.schema.alterTable('questions', (table) => {
      table
        .foreign('theme_id')
        .references('id')
        .inTable('themes')
        .onDelete('RESTRICT')

      table.index(['theme_id'], 'questions_theme_id_index')
    })
  }

  await knex.schema.dropTableIfExists('question_themes')
}
