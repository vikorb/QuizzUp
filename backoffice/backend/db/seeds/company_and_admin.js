require('dotenv').config()
const bcrypt = require('bcryptjs')

const ADMIN_ROLE_SUPERADMIN = 'superadmin'
const ADMIN_STATUS_ACTIVE = 1
const COMPANY_STATUS_ACTIVE = 1

exports.seed = async function (knex) {
  const email = process.env.ADMIN_SEED_EMAIL || 'admin@quizzup.local'
  const username = process.env.ADMIN_SEED_USERNAME || 'admin'
  const password = process.env.ADMIN_SEED_PASSWORD || 'ChangeMe123!'
  const mdpHash = await bcrypt.hash(password, 12)

  const companyName = process.env.ADMIN_SEED_COMPANY_NAME || 'Quizzup'
  const companyEmail = process.env.ADMIN_SEED_COMPANY_EMAIL || 'contact@quizzup.local'

  let company = await knex('companies')
    .whereRaw('LOWER(name) = LOWER(?)', [companyName])
    .orWhereRaw('LOWER(email) = LOWER(?)', [companyEmail])
    .first('id')

  if (!company) {
    const insertedCompanies = await knex('companies')
      .insert({
        name: companyName,
        email: companyEmail,
        status: COMPANY_STATUS_ACTIVE,
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
        status: COMPANY_STATUS_ACTIVE,
        deleted_at: null,
        updated_at: knex.fn.now(),
      })
  }

  const companyId = company.id

  await knex('admins')
    .insert({
      company_id: companyId,
      role: ADMIN_ROLE_SUPERADMIN,
      firstname: 'Quizzup',
      lastname: 'Superadmin',
      username,
      email,
      mdp_hash: mdpHash,
      status: ADMIN_STATUS_ACTIVE,
      deleted_at: null,
    })
    .onConflict(knex.raw('((lower(email)))'))
    .merge({
      company_id: companyId,
      role: ADMIN_ROLE_SUPERADMIN,
      firstname: 'Quizzup',
      lastname: 'Superadmin',
      username,
      mdp_hash: mdpHash,
      status: ADMIN_STATUS_ACTIVE,
      deleted_at: null,
      updated_at: knex.fn.now(),
    })
}
