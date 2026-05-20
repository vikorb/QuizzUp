/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const companyName = 'Quizzup'
  const companyEmail = 'contact@quizzup.local'

  await knex.raw(`
    ALTER TABLE admins
    DROP CONSTRAINT IF EXISTS admins_role_company_check;
  `)

  let company = await knex('companies')
    .whereRaw('LOWER(email) = LOWER(?)', [companyEmail])
    .orWhereRaw('LOWER(name) = LOWER(?)', [companyName])
    .first('id')

  if (!company) {
    const insertedCompanies = await knex('companies')
      .insert({
        name: companyName,
        email: companyEmail,
        status: 1,
        deleted_at: null,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .returning('id')

    company = insertedCompanies[0]
  } else {
    await knex('companies')
      .where('id', company.id)
      .update({
        status: 1,
        deleted_at: null,
        updated_at: knex.fn.now(),
      })
  }

  const companyId = typeof company === 'object' ? company.id : company

  await knex('admins')
    .whereNull('company_id')
    .update({
      company_id: companyId,
      updated_at: knex.fn.now(),
    })

  await knex.raw(`
    ALTER TABLE admins
    ALTER COLUMN company_id SET NOT NULL;
  `)

  await knex.raw(`
    ALTER TABLE admins
    ADD CONSTRAINT admins_role_company_check
    CHECK (company_id IS NOT NULL);
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
    ALTER COLUMN company_id DROP NOT NULL;
  `)

  await knex.raw(`
    UPDATE admins
    SET company_id = NULL,
        updated_at = NOW()
    WHERE role = 'superadmin';
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
