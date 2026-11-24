import { createRequire } from 'node:module'
import path from 'node:path'

import type dbModule from '@backend/db'
import { GAME_FORMATS } from '@quizzup/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Migration `add_format_to_games` sur PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE dont le nom
 * finit par `_test`) : `up` est joué par `migrate.latest`, la contrainte est vérifiée dans des
 * transactions annulées, `down` puis `up` aussi, puis le `down` réel via Knex.
 */
const require = createRequire(import.meta.url)
const MIGRATION_FILE = '20261124170000_add_format_to_games.js'
const migration = require(path.resolve(process.cwd(), 'backend/db/migrations', MIGRATION_FILE)) as {
  up: (knex: Db) => Promise<void>
  down: (knex: Db) => Promise<void>
}

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule

const TRUNCATE_TABLES = 'TRUNCATE games, rooms, admins, companies RESTART IDENTITY CASCADE'

describe.skipIf(!PG_INTEGRATION_URL)('add_format_to_games sur PostgreSQL', () => {
  let db: Db
  const directory = path.resolve(process.cwd(), 'backend/db/migrations')

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default
    await assertTestDatabase(db)
    await db.migrate.latest({ directory })
  }, 120_000)

  // Base partagée avec les autres `*.pg.test.ts` : on ne laisse aucune ligne derrière nous.
  afterAll(async () => {
    await db?.raw(TRUNCATE_TABLES)
    await db?.destroy()
  }, 30_000)

  beforeEach(async () => {
    await db.raw(TRUNCATE_TABLES)
    await db('companies').insert({ id: 1, name: 'Centre', email: 'c@x.test' })
    await db('admins').insert({
      id: 1,
      company_id: 1,
      role: 'admin',
      username: 'admin',
      email: 'admin@x.test',
      mdp_hash: 'x',
    })
    await db('rooms').insert({ id: 1, company_id: 1, name: 'Salle 1' })
  }, 30_000)

  const ROLLBACK = new Error('rollback voulu')

  async function formatColumns(conn: Db) {
    const { rows } = await conn.raw(
      `select column_name, data_type, character_maximum_length, is_nullable, column_default
         from information_schema.columns
        where table_name = 'games' and column_name = 'format'`
    )

    return rows as {
      column_name: string
      data_type: string
      character_maximum_length: number | null
      is_nullable: string
      column_default: string | null
    }[]
  }

  function insertGame(conn: Db, extra: Record<string, unknown> = {}) {
    return conn('games').insert({
      company_id: 1,
      room_id: 1,
      admin_id: 1,
      seed: 1,
      state: 'running',
      ...extra,
    })
  }

  it('adds a nullable varchar(30) column without default', async () => {
    expect(await formatColumns(db)).toEqual([
      {
        column_name: 'format',
        data_type: 'character varying',
        character_maximum_length: 30,
        is_nullable: 'YES',
        column_default: null,
      },
    ])
  })

  it('leaves a game created without format at null', async () => {
    await insertGame(db)

    expect((await db('games').first('format')).format).toBeNull()
  })

  it.each([...GAME_FORMATS])('accepts the format %s', async (format) => {
    await insertGame(db, { format })

    expect((await db('games').first('format')).format).toBe(format)
  })

  it('refuses a format that is not in the list', async () => {
    await expect(
      db.transaction(async (trx) => {
        await insertGame(trx, { format: 'epic' })
        throw ROLLBACK
      })
    ).rejects.toThrow('games_format_check')
  })

  it('keeps an existing game at null when the migration is played on a populated base', async () => {
    await expect(
      db.transaction(async (trx) => {
        await migration.down(trx)
        await insertGame(trx)
        await migration.up(trx)

        expect((await trx('games').first('format')).format).toBeNull()

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  })

  it('down removes the column and its constraint, and up brings them back', async () => {
    await expect(
      db.transaction(async (trx) => {
        await migration.down(trx)
        expect(await formatColumns(trx)).toEqual([])
        const { rows } = await trx.raw(
          "select 1 from pg_constraint where conname = 'games_format_check'"
        )
        expect(rows).toHaveLength(0)

        await migration.up(trx)
        expect(await formatColumns(trx)).toHaveLength(1)

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)

    // Le retour arrière annulé ne touche pas à la base réelle.
    expect(await formatColumns(db)).toHaveLength(1)
  })

  it('rolls back for real through Knex, keeps the games and comes back with latest', async () => {
    await insertGame(db, { format: 'short', rounds_count: 6, questions_per_round: 7 })

    try {
      await db.migrate.down({ directory, name: MIGRATION_FILE })

      expect(await formatColumns(db)).toEqual([])
      expect(await db('games').first('rounds_count', 'questions_per_round')).toMatchObject({
        rounds_count: 6,
        questions_per_round: 7,
      })
    } finally {
      // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
      await db.migrate.latest({ directory })
    }

    expect(await formatColumns(db)).toHaveLength(1)
    expect((await db('games').first('format')).format).toBeNull()
  }, 30_000)
})
