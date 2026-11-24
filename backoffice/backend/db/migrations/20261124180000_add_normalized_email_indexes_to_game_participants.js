/**
 * Questions déjà vues (lot 8e) : `GET /room/games/current` retrouve les autres parties d'un joueur
 * par son e-mail normalisé, comme la purge RGPD et la liste des joueurs : `lower(btrim(email))`.
 * Les index simples sur `email` et `second_email` ne servent pas à cette recherche : on indexe
 * l'expression elle-même. Elle doit rester écrite à l'identique dans les requêtes
 * (`routes/room/_history.ts`).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.raw(
    'CREATE INDEX game_participants_email_normalized_index ON game_participants (lower(btrim(email)))'
  )
  await knex.raw(
    'CREATE INDEX game_participants_second_email_normalized_index ON game_participants (lower(btrim(second_email)))'
  )
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX game_participants_second_email_normalized_index')
  await knex.raw('DROP INDEX game_participants_email_normalized_index')
}
