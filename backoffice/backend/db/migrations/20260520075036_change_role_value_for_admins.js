/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_role_company_check;
  `)

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_role_check;
  `)

  await knex.raw(`
    ALTER TABLE admins
    ALTER COLUMN company_id DROP NOT NULL;
  `)

  await knex.raw(`
    UPDATE admins
    SET role = CASE
      WHEN LOWER(TRIM(role)) = 'admin' THEN 'superadmin'
      WHEN LOWER(TRIM(role)) IN ('client', 'clients') THEN 'admin'
      WHEN LOWER(TRIM(role)) = 'superadmin' THEN 'superadmin'
      WHEN LOWER(TRIM(role)) = 'user' THEN 'user'
      ELSE LOWER(TRIM(role))
    END,
    updated_at = NOW();
  `)

  await knex.raw(`
    UPDATE admins
    SET company_id = NULL
    WHERE role = 'superadmin';
  `)

  await knex.raw(`
    UPDATE admins
    SET company_id = (
      SELECT id FROM companies ORDER BY id ASC LIMIT 1
    )
    WHERE role IN ('admin', 'user')
    AND company_id IS NULL;
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_role_check
    CHECK (role IN ('superadmin', 'admin', 'user'));
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_role_company_check
    CHECK (
      (role = 'superadmin' AND company_id IS NULL)
      OR
      (role IN ('admin', 'user') AND company_id IS NOT NULL)
    );
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_role_company_check;
  `)

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_role_check;
  `)

  await knex.raw(`
    UPDATE admins
    SET company_id = (
      SELECT id FROM companies ORDER BY id ASC LIMIT 1
    )
    WHERE company_id IS NULL;
  `)

  await knex.raw(`
    UPDATE admins
    SET role = CASE
      WHEN role = 'superadmin' THEN 'admin'
      WHEN role IN ('admin', 'user') THEN 'clients'
      ELSE role
    END,
    updated_at = NOW();
  `)

  await knex.raw(`
    ALTER TABLE admins
    ALTER COLUMN company_id SET NOT NULL;
  `)
}
