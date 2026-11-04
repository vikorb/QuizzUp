/**
 * Révision de la configuration d'une salle (`rooms.config`) : elle part de 0 et augmente de 1
 * à chaque écriture de `config`. Deux postes connectés au même compte de salle ne s'écrasent
 * plus en silence : `PUT /room/config` refuse (409) une écriture faite sur une révision périmée.
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('rooms', (table) => {
    table.integer('config_revision').notNullable().defaultTo(0)
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('rooms', (table) => {
    table.dropColumn('config_revision')
  })
}
