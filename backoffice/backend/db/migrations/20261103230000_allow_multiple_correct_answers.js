/**
 * Une question peut avoir plusieurs bonnes réponses (le formulaire le permet
 * déjà) : on retire l'index qui n'en autorisait qu'une. La règle « au moins une
 * bonne réponse » reste portée par l'API.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS answers_one_correct_answer_per_question_index')
}

/**
 * Ne garde qu'une bonne réponse par question (la plus ancienne active en
 * priorité) avant de recréer l'index unique.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw(`
    UPDATE answers
    SET is_correct = false,
        updated_at = NOW()
    WHERE is_correct = true
    AND status <> 2
    AND id NOT IN (
      SELECT DISTINCT ON (question_id) id
      FROM answers
      WHERE is_correct = true AND status <> 2
      ORDER BY question_id, (status = 1) DESC, id
    )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX answers_one_correct_answer_per_question_index
    ON answers(question_id)
    WHERE is_correct = true AND status <> 2
  `)
}
