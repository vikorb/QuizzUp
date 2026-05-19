/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasDeletedAt = await knex.schema.hasColumn('admins', 'deleted_at')
  const hasUpdatedAt = await knex.schema.hasColumn('admins', 'updated_at')

  await knex.schema.alterTable('admins', (table) => {
    if (!hasDeletedAt) {
      table.timestamp('deleted_at').nullable()
    }

    if (!hasUpdatedAt) {
      table.timestamp('updated_at').nullable()
    }
  })

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_status_check
  `)

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_status_deleted_at_check
  `)

  await knex.raw(`
    UPDATE admins
    SET status = CASE
      WHEN status = 3 THEN 2
      WHEN status = 2 THEN 0
      ELSE status
    END
  `)

  await knex.raw(`
    UPDATE admins
    SET deleted_at = NULL
    WHERE status <> 2
  `)

  await knex.raw(`
    UPDATE admins
    SET deleted_at = NOW()
    WHERE status = 2
      AND deleted_at IS NULL
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_status_check
    CHECK (status IN (0, 1, 2))
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_status_deleted_at_check
    CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    )
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_status_deleted_at_check
  `)

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_status_check
  `)

  await knex.raw(`
    UPDATE admins
    SET status = CASE
      WHEN status = 2 THEN 3
      WHEN status = 0 THEN 2
      ELSE status
    END
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_status_check
    CHECK (status IN (1, 2, 3))
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_status_deleted_at_check
    CHECK (
      (status = 3 AND deleted_at IS NOT NULL)
      OR
      (status <> 3 AND deleted_at IS NULL)
    )
  `)
}
