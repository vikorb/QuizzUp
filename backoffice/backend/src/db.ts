import 'dotenv/config'
import knex, { type Knex } from 'knex'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('Missing env var: DATABASE_URL')
}

const db: Knex = knex({
  client: 'pg',
  connection: DATABASE_URL,
  pool: { min: 0, max: 10 },
})

export default db
