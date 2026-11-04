/**
 * Programme de mini-jeux choisi au lancement d'une partie (backoffice). `null` : tous les
 * mini-jeux du moteur, comme avant. Valeurs validées par l'API (`MINI_GAMES` de `@quizzup/shared`).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('games', (table) => {
    table.jsonb('mini_games').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('mini_games')
  })
}
