require('dotenv').config()
const bcrypt = require('bcryptjs')

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
    { name: 'Acme Corp', email: `billing@acme.${seedDomain}`, clients: 3 },
    { name: 'BlueNova', email: `billing@bluenova.${seedDomain}`, clients: 7 },
    { name: 'Café Lumière', email: `billing@cafelumiere.${seedDomain}`, clients: 2 },
    { name: 'DeltaWorks', email: `billing@deltaworks.${seedDomain}`, clients: 9 },
    { name: 'Echo Labs', email: `billing@echolabs.${seedDomain}`, clients: 4 },
    { name: 'Futura Group', email: `billing@futuragroup.${seedDomain}`, clients: 6 },
    { name: 'GreenField', email: `billing@greenfield.${seedDomain}`, clients: 1 },
    { name: 'Hyperion', email: `billing@hyperion.${seedDomain}`, clients: 10 },
  ]

  await knex.transaction(async (trx) => {
    for (const company of companiesSpec) {
      await trx('companies')
        .insert({ name: company.name, email: company.email })
        .onConflict(trx.raw('((lower(name)))'))
        .merge({ name: company.name, email: company.email })
    }

    for (let companyIndex = 0; companyIndex < companiesSpec.length; companyIndex++) {
      const company = companiesSpec[companyIndex]
      const slug = slugify(company.name)
      const company_id = await getcompany_id(trx, company.name)

      for (let index = 1; index <= company.clients; index++) {
        const username = `client_${companyIndex + 1}_${index}_${slug}`
        const email = `client_${companyIndex + 1}_${index}_${slug}@${seedDomain}`

        await trx('admins')
          .insert({
            company_id: company_id,
            role: 'client',
            firstname: 'Client',
            lastname: `${company.name} ${index}`,
            username,
            email,
            mdp_hash,
            status: 1,
          })
          .onConflict(trx.raw('((lower(email)))'))
          .ignore()
      }
    }
  })
}
