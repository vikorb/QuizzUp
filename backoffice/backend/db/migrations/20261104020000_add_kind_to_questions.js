/**
 * Type de question (décision d'Enzo, 2026-11-04) : QCM, vrai/faux ou estimation. Le moteur de
 * jeu s'en sert pour l'éligibilité des mini-jeux. Les questions existantes deviennent des QCM.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('questions', (table) => {
    table.string('kind', 20).notNullable().defaultTo('qcm')
    table.index(['kind'], 'questions_kind_index')
  })

  await knex.raw(`
    ALTER TABLE questions
    ADD CONSTRAINT questions_kind_check CHECK (kind IN ('qcm', 'true_false', 'estimate'))
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_kind_check')

  await knex.schema.alterTable('questions', (table) => {
    table.dropIndex(['kind'], 'questions_kind_index')
    table.dropColumn('kind')
  })
}
