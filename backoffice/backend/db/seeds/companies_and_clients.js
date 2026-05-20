require('dotenv').config()
const bcrypt = require('bcryptjs')

const ADMIN_ROLE_ADMIN = 'admin'
const ADMIN_ROLE_USER = 'user'

const ADMIN_STATUS_ACTIVE = 1

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function getcompany_id(knex, name) {
  const row = await knex('companies')
    .select('id')
    .whereRaw('lower(name) = lower(?)', [name])
    .first()

  if (!row) throw new Error(`Company not found after upsert: ${name}`)
  return row.id
}

exports.seed = async function (knex) {
  const seedDomain = process.env.SEED_DOMAIN || 'seed.quizzup.local'
  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe123!'
  const mdp_hash = await bcrypt.hash(defaultPassword, 12)

  const companiesSpec = [
    { name: 'Acme Corp', email: `billing@acme.${seedDomain}`, users: 3 },
    { name: 'BlueNova', email: `billing@bluenova.${seedDomain}`, users: 7 },
    { name: 'Café Lumière', email: `billing@cafelumiere.${seedDomain}`, users: 2 },
    { name: 'DeltaWorks', email: `billing@deltaworks.${seedDomain}`, users: 9 },
    { name: 'Echo Labs', email: `billing@echolabs.${seedDomain}`, users: 4 },
    { name: 'Futura Group', email: `billing@futuragroup.${seedDomain}`, users: 6 },
    { name: 'GreenField', email: `billing@greenfield.${seedDomain}`, users: 1 },
    { name: 'Hyperion', email: `billing@hyperion.${seedDomain}`, users: 10 },
  ]

  await knex.transaction(async (trx) => {
    for (const company of companiesSpec) {
      await trx('companies')
        .insert({
          name: company.name,
          email: company.email,
        })
        .onConflict(trx.raw('((lower(name)))'))
        .merge({
          name: company.name,
          email: company.email,
        })
    }

    for (let companyIndex = 0; companyIndex < companiesSpec.length; companyIndex++) {
      const company = companiesSpec[companyIndex]
      const slug = slugify(company.name)
      const company_id = await getcompany_id(trx, company.name)

      const adminUsername = `admin_${companyIndex + 1}_${slug}`
      const adminEmail = `admin_${companyIndex + 1}_${slug}@${seedDomain}`

      await trx('admins')
        .insert({
          company_id,
          role: ADMIN_ROLE_ADMIN,
          firstname: 'Admin',
          lastname: company.name,
          username: adminUsername,
          email: adminEmail,
          mdp_hash,
          status: ADMIN_STATUS_ACTIVE,
        })
        .onConflict(trx.raw('((lower(email)))'))
        .merge({
          company_id,
          role: ADMIN_ROLE_ADMIN,
          firstname: 'Admin',
          lastname: company.name,
          username: adminUsername,
          mdp_hash,
          status: ADMIN_STATUS_ACTIVE,
          updated_at: trx.fn.now(),
        })

      for (let index = 1; index <= company.users; index++) {
        const username = `user_${companyIndex + 1}_${index}_${slug}`
        const email = `user_${companyIndex + 1}_${index}_${slug}@${seedDomain}`

        await trx('admins')
          .insert({
            company_id,
            role: ADMIN_ROLE_USER,
            firstname: 'User',
            lastname: `${company.name} ${index}`,
            username,
            email,
            mdp_hash,
            status: ADMIN_STATUS_ACTIVE,
          })
          .onConflict(trx.raw('((lower(email)))'))
          .merge({
            company_id,
            role: ADMIN_ROLE_USER,
            firstname: 'User',
            lastname: `${company.name} ${index}`,
            username,
            mdp_hash,
            status: ADMIN_STATUS_ACTIVE,
            updated_at: trx.fn.now(),
          })
      }
    }
  })
}
