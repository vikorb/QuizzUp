require('dotenv').config()
const bcrypt = require('bcryptjs')

const ADMIN_ROLE_SUPERADMIN = 'superadmin'
const ADMIN_STATUS_ACTIVE = 1

exports.seed = async function (knex) {
  const email = process.env.ADMIN_SEED_EMAIL || 'admin@quizzup.local'
  const username = process.env.ADMIN_SEED_USERNAME || 'admin'
  const password = process.env.ADMIN_SEED_PASSWORD || 'ChangeMe123!'
  const mdp_hash = await bcrypt.hash(password, 12)

  await knex('admins')
    .insert({
      company_id: null,
      role: ADMIN_ROLE_SUPERADMIN,
      firstname: 'Quizzup',
      lastname: 'Superadmin',
      username,
      email,
      mdp_hash,
      status: ADMIN_STATUS_ACTIVE,
    })
    .onConflict(knex.raw('((lower(email)))'))
    .merge({
      company_id: null,
      role: ADMIN_ROLE_SUPERADMIN,
      firstname: 'Quizzup',
      lastname: 'Superadmin',
      username,
      mdp_hash,
      status: ADMIN_STATUS_ACTIVE,
      updated_at: knex.fn.now(),
    })
}
