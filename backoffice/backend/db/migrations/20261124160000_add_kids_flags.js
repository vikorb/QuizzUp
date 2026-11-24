/**
 * Option « enfants » : un thème peut être déclaré adapté aux enfants (`themes.kids_friendly`), et
 * une partie peut être jouée en mode enfants (`games.kids_mode`). Dans ce mode, l'écran de salle ne
 * reçoit que les thèmes adaptés aux enfants (et le téléphone ne demande pas d'e-mail).
 *
 * Les deux colonnes sont fausses par défaut : aucun thème ni partie existants ne change de
 * comportement.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Ne pas bloquer les requêtes des tables `themes` et `games` si un verrou est déjà pris.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('themes', (table) => {
    table.boolean('kids_friendly').notNullable().defaultTo(false)
  })

  await knex.schema.alterTable('games', (table) => {
    table.boolean('kids_mode').notNullable().defaultTo(false)
  })
}

/**
 * Retour arrière refusé tant qu'un thème ou une partie utilise l'option : supprimer les colonnes
 * ferait servir à une partie enfants des thèmes qui ne le sont pas. Il faut d'abord retirer l'option
 * depuis le backoffice.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const usedTheme = await knex('themes').where('kids_friendly', true).first('id')
  const usedGame = await knex('games').where('kids_mode', true).first('id')

  if (usedTheme || usedGame) {
    throw new Error(
      "Rollback impossible : des thèmes ou des parties utilisent l'option enfants (themes.kids_friendly, games.kids_mode)."
    )
  }

  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('games', (table) => {
    table.dropColumn('kids_mode')
  })

  await knex.schema.alterTable('themes', (table) => {
    table.dropColumn('kids_friendly')
  })
}
