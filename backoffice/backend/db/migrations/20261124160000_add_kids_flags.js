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
 * Retour arrière refusé tant qu'un thème (non supprimé) est adapté aux enfants, ou qu'une partie
 * non supprimée encore à jouer (programmée, en attente ou en cours) est en mode enfants : supprimer
 * les colonnes ferait servir à cette partie des thèmes qui ne sont pas pour les enfants. Les parties
 * terminées, arrêtées ou annulées ne comptent pas : le mode enfants n'y a plus d'effet.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const usedTheme = await knex('themes')
    .where('kids_friendly', true)
    .whereNot('status', 2)
    .first('id')
  const usedGame = await knex('games')
    .where('kids_mode', true)
    .whereNot('status', 2)
    .whereIn('state', ['scheduled', 'pending', 'running'])
    .first('id')

  if (usedTheme || usedGame) {
    throw new Error(
      'Rollback impossible : des thèmes sont adaptés aux enfants (themes.kids_friendly) ou des parties programmées, en attente ou en cours sont en mode enfants (games.kids_mode). Retire l’option des thèmes, puis termine, annule ou arrête ces parties.'
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
