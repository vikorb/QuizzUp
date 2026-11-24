/**
 * Format d'une partie : `discovery`, `short`, `standard` ou `custom`. Même liste que
 * `GAME_FORMATS` de `@quizzup/shared` (un test compare les deux). `rounds_count` et
 * `questions_per_round` restent la seule vérité du moteur : le format n'est qu'une étiquette.
 * Les parties existantes gardent `NULL` (affichées « Personnalisé »).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Ne pas bloquer les requêtes de la table `games` si un verrou est déjà pris.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('games', (table) => {
    table.string('format', 30).nullable()
  })

  await knex.raw(`
    ALTER TABLE games
    ADD CONSTRAINT games_format_check CHECK (
      format IN ('discovery', 'short', 'standard', 'custom')
    )
  `)
}

/**
 * Retour arrière sans perte utile : le format se déduit de `rounds_count` et
 * `questions_per_round`, qui restent en base.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw('ALTER TABLE games DROP CONSTRAINT IF EXISTS games_format_check')
  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('format')
  })
}
