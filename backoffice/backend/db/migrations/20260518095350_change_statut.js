exports.up = async function (knex) {
  await knex.raw(`
    ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS status smallint NOT NULL DEFAULT 1;
  `)

  await knex.raw(`
    ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
  `)

  await knex.raw(`
    ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NULL;
  `)

  await knex.raw(`
    ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
  `)

  await knex.raw(`
    ALTER TABLE companies
    DROP CONSTRAINT IF EXISTS companies_status_deleted_at_check;
  `)

  await knex.raw(`
    ALTER TABLE companies
    DROP CONSTRAINT IF EXISTS companies_status_check;
  `)

  await knex.raw(`
    UPDATE companies
    SET status = 1
    WHERE status IS NULL;
  `)

  await knex.raw(`
    UPDATE companies
    SET deleted_at = now()
    WHERE status = 2 AND deleted_at IS NULL;
  `)

  await knex.raw(`
    UPDATE companies
    SET deleted_at = NULL
    WHERE status <> 2;
  `)

  await knex.raw(`
    ALTER TABLE companies
    ADD CONSTRAINT companies_status_check
    CHECK (status in (0, 1, 2));
  `)

  await knex.raw(`
    ALTER TABLE companies
    ADD CONSTRAINT companies_status_deleted_at_check
    CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    );
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS companies_status_index
    ON companies (status);
  `)
}

exports.down = async function (knex) {
  await knex.raw(`
    ALTER TABLE companies
    DROP CONSTRAINT IF EXISTS companies_status_deleted_at_check;
  `)

  await knex.raw(`
    ALTER TABLE companies
    DROP CONSTRAINT IF EXISTS companies_status_check;
  `)

  await knex.raw(`
    UPDATE companies
    SET status = 1
    WHERE status = 0;
  `)

  await knex.raw(`
    UPDATE companies
    SET deleted_at = now()
    WHERE status = 2 AND deleted_at IS NULL;
  `)

  await knex.raw(`
    UPDATE companies
    SET deleted_at = NULL
    WHERE status <> 2;
  `)

  await knex.raw(`
    ALTER TABLE companies
    ADD CONSTRAINT companies_status_check
    CHECK (status in (1, 2));
  `)

  await knex.raw(`
    ALTER TABLE companies
    ADD CONSTRAINT companies_status_deleted_at_check
    CHECK (
      (status = 2 AND deleted_at IS NOT NULL)
      OR
      (status <> 2 AND deleted_at IS NULL)
    );
  `)
}
