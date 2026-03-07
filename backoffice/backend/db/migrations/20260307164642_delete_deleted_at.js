exports.up = async function (knex) {
  await knex.transaction(async (trx) => {
    await trx.raw(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT con.conname AS name
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = con.connamespace
          WHERE rel.relname = 'companies'
            AND nsp.nspname = current_schema()
            AND pg_get_constraintdef(con.oid) ILIKE '%deleted_at%'
        LOOP
          EXECUTE format('ALTER TABLE companies DROP CONSTRAINT IF EXISTS %I', r.name);
        END LOOP;
      END
      $$;
    `)

    await trx.raw(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT con.conname AS name
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = con.connamespace
          WHERE rel.relname = 'admins'
            AND nsp.nspname = current_schema()
            AND pg_get_constraintdef(con.oid) ILIKE '%deleted_at%'
        LOOP
          EXECUTE format('ALTER TABLE admins DROP CONSTRAINT IF EXISTS %I', r.name);
        END LOOP;
      END
      $$;
    `)

    await trx.schema.alterTable('companies', (table) => {
      table.dropColumn('deleted_at')
    })

    await trx.schema.alterTable('admins', (table) => {
      table.dropColumn('deleted_at')
    })
  })
}

exports.down = async function (knex) {
  await knex.transaction(async (trx) => {
    await trx.schema.alterTable('companies', (table) => {
      table.timestamp('deleted_at').nullable()
    })

    await trx.schema.alterTable('admins', (table) => {
      table.timestamp('deleted_at').nullable()
    })

    await trx.raw(`
      ALTER TABLE companies
      ADD CONSTRAINT companies_status_deleted_at_check
      CHECK (
        (status = 2 AND deleted_at IS NOT NULL)
        OR (status <> 2 AND deleted_at IS NULL)
      );
    `)

    await trx.raw(`
      ALTER TABLE admins
      ADD CONSTRAINT admins_status_deleted_at_check
      CHECK (
        (status = 3 AND deleted_at IS NOT NULL)
        OR (status <> 3 AND deleted_at IS NULL)
      );
    `)
  })
}
