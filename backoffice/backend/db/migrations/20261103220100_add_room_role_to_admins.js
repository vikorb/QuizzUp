/**
 * Comptes de salle (US-ROOM-02) : un compte `admins` de rôle `room`,
 * rattaché à sa compagnie et à UNE salle. Un seul compte non supprimé par salle.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('admins', (table) => {
    table.bigInteger('room_id').nullable()

    table.foreign('room_id').references('id').inTable('rooms').onDelete('RESTRICT')

    table.index(['room_id'], 'admins_room_id_index')
  })

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_role_check;
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_role_check
    CHECK (role IN ('superadmin', 'admin', 'user', 'room')),
    ADD CONSTRAINT admins_room_role_check CHECK (
      (role = 'room' AND room_id IS NOT NULL)
      OR
      (role <> 'room' AND room_id IS NULL)
    )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX admins_room_id_unique
    ON admins(room_id)
    WHERE room_id IS NOT NULL AND status <> 2
  `)
}

/**
 * Supprime les comptes de salle (leurs sessions partent en cascade) avant de
 * restaurer l'ancienne contrainte de rôle.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex('admins').where('role', 'room').delete()

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_room_role_check,
    DROP CONSTRAINT IF EXISTS admins_role_check;
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_role_check
    CHECK (role IN ('superadmin', 'admin', 'user'));
  `)

  await knex.schema.alterTable('admins', (table) => {
    table.dropForeign(['room_id'])
    table.dropIndex(['room_id'], 'admins_room_id_index')
  })

  await knex.raw('DROP INDEX IF EXISTS admins_room_id_unique')

  await knex.schema.alterTable('admins', (table) => {
    table.dropColumn('room_id')
  })
}
