/**
 * Effet joué sur l'extrait d'une question audio (blind test) : `none` (défaut), `short`,
 * `reverse` ou `slowed`. Même liste que `QUESTION_AUDIO_EFFECTS` de `@quizzup/shared` (un test
 * compare les deux). La règle « un effet seulement sur une question audio » est contrôlée par
 * l'API, pas par la base : `type_media` se modifie par ailleurs.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Ne pas bloquer les requêtes de la table `questions` si un verrou est déjà pris.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('questions', (table) => {
    table.string('audio_effect', 20).notNullable().defaultTo('none')
  })

  await knex.raw(`
    ALTER TABLE questions
    ADD CONSTRAINT questions_audio_effect_check CHECK (
      audio_effect IN ('none', 'short', 'reverse', 'slowed')
    )
  `)
}

/**
 * Retour arrière refusé tant qu'une question a un effet : supprimer la colonne le perdrait. Il
 * faut d'abord remettre ces questions sans effet depuis le backoffice.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const { rows } = await knex.raw(
    "SELECT COUNT(*)::int AS count FROM questions WHERE audio_effect <> 'none'"
  )

  if (rows[0].count > 0) {
    throw new Error(
      `Rollback impossible : ${rows[0].count} question(s) ont un effet audio. ` +
        'Remettez-les sans effet avant de revenir en arrière.'
    )
  }

  await knex.raw('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_audio_effect_check')
  await knex.schema.alterTable('questions', (table) => {
    table.dropColumn('audio_effect')
  })
}
