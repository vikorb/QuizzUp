/**
 * Logo d'un centre (compagnie). `logo_key` est la clé du fichier dans le stockage média
 * (`logos/<uuid>.<ext>`, jamais exposée), `logo_mime_type` le type vérifié sur les octets à
 * l'envoi, `logo_updated_at` la date du dernier envoi. Les trois sont nulles tant qu'aucun logo
 * n'est envoyé.
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Ne pas bloquer les requêtes de la table `companies` si un verrou est déjà pris.
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('companies', (table) => {
    table.text('logo_key').nullable()
    table.string('logo_mime_type', 50).nullable()
    table.timestamp('logo_updated_at', { useTz: true }).nullable()
  })
}

/**
 * Retour arrière refusé tant qu'une compagnie a un logo : supprimer la colonne `logo_key`
 * perdrait la référence du fichier, qui resterait orphelin dans le stockage média. Il faut
 * d'abord retirer les logos depuis le backoffice.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const usedCompany = await knex('companies').whereNotNull('logo_key').first('id')

  if (usedCompany) {
    throw new Error('Rollback impossible : des compagnies ont un logo (companies.logo_key).')
  }

  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.schema.alterTable('companies', (table) => {
    table.dropColumn('logo_key')
    table.dropColumn('logo_mime_type')
    table.dropColumn('logo_updated_at')
  })
}
