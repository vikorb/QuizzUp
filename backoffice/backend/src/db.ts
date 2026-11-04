import 'dotenv/config'
import knex, { type Knex } from 'knex'
import { types } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('Missing env var: DATABASE_URL')
}

// `pg` renvoie les bigint (int8, OID 20 : tous nos ids et company_id) sous forme de chaîne.
// On les lit en nombre pour que les `===` entre une ligne SQL et le JWT/la session (nombres)
// ne soient pas faux. Tous les ids tiennent largement dans 2^53.
types.setTypeParser(20, Number)

const db: Knex = knex({
  client: 'pg',
  connection: DATABASE_URL,
  pool: { min: 0, max: 10 },
})

export default db
