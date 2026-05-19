/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasDeletedAt = await knex.schema.hasColumn('admins', 'deleted_at')

  if (!hasDeletedAt) {
    await knex.schema.alterTable('admins', (table) => {
      table.timestamp('deleted_at').nullable()
    })
  }

  await knex.raw(`
    DO $$
    DECLARE
      constraint_record RECORD;
    BEGIN
      FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'admins'::regclass
          AND contype = 'c'
          AND (
            pg_get_constraintdef(oid) ILIKE '%status%'
            OR pg_get_constraintdef(oid) ILIKE '%deleted_at%'
          )
      LOOP
        EXECUTE format('ALTER TABLE admins DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
      END LOOP;
    END $$;
  `)

  await knex.raw(`
    UPDATE admins
    SET status = 2
    WHERE status = 0
  `)

  await knex.raw(`
    UPDATE admins
    SET deleted_at = NULL
    WHERE status <> 3
  `)

  await knex.raw(`
    UPDATE admins
    SET deleted_at = NOW()
    WHERE status = 3
      AND deleted_at IS NULL
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

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasDeletedAt = await knex.schema.hasColumn('admins', 'deleted_at')

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_status_deleted_at_check
  `)

  if (hasDeletedAt) {
    await knex.schema.alterTable('admins', (table) => {
      table.dropColumn('deleted_at')
    })
  }
}
