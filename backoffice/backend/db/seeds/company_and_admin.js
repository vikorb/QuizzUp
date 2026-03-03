require('dotenv').config()
const bcrypt = require('bcryptjs')

exports.seed = async function (knex) {
  const companyName = 'Quizzup'
  const companyEmail = process.env.QUIZZUP_COMPANY_EMAIL || 'billing@quizzup.local'

  const insertedCompanies = await knex('companies')
    .insert({ name: companyName, email: companyEmail })
    .onConflict(knex.raw('((lower(name)))'))
    .merge({ email: companyEmail, name: companyName })
    .returning(['id'])

  const companyId =
    insertedCompanies?.[0]?.id ??
    (await knex('companies').select('id').whereRaw('lower(name) = lower(?)', [companyName]).first())
      .id

  const email = process.env.ADMIN_SEED_EMAIL || 'admin@quizzup.local'
  const username = process.env.ADMIN_SEED_USERNAME || 'admin'
  const password = process.env.ADMIN_SEED_PASSWORD || 'ChangeMe123!'
  const mdp_hash = await bcrypt.hash(password, 12)

  await knex('admins')
    .insert({
      company_id: companyId,
      role: 'admin',
      firstname: 'Quizzup',
      lastname: 'Admin',
      username,
      email,
      mdp_hash,
      status: 1,
    })
    .onConflict(knex.raw('((lower(email)))'))
    .ignore()
}
