import { createRequire } from 'node:module'
import path from 'node:path'

import type dbModule from '@backend/db'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Migration `add_logo_to_companies` sur PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE dont le nom
 * finit par `_test`) : `up` est joué par `migrate.latest`, `down` puis `up` dans une transaction
 * annulée, puis le `down` réel (refus tant qu'un logo existe). Les tables `admins` et `companies`
 * sont vidées avant chaque test.
 */
const require = createRequire(import.meta.url)
const migration = require(
  path.resolve(process.cwd(), 'backend/db/migrations/20261124030000_add_logo_to_companies.js')
) as {
  up: (knex: Db) => Promise<void>
  down: (knex: Db) => Promise<void>
}

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule

const LOGO_COLUMNS = ['logo_key', 'logo_mime_type', 'logo_updated_at']

describe.skipIf(!PG_INTEGRATION_URL)('add_logo_to_companies sur PostgreSQL', () => {
  let db: Db

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default
    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  // Base partagée avec les autres fichiers `*.pg.test.ts` : on ne dépend pas de ce qu'ils laissent.
  beforeEach(async () => {
    await db.raw('TRUNCATE admins, companies RESTART IDENTITY CASCADE')
  })

  const ROLLBACK = new Error('rollback voulu')

  async function logoColumns(trx: Db) {
    const { rows } = await trx.raw(
      `select column_name, data_type, character_maximum_length, is_nullable
         from information_schema.columns
        where table_name = 'companies' and column_name = any(?)
        order by column_name`,
      [LOGO_COLUMNS]
    )

    return rows as {
      column_name: string
      data_type: string
      character_maximum_length: number | null
      is_nullable: string
    }[]
  }

  it('adds three nullable columns of the right types, empty for an existing company', async () => {
    await expect(
      db.transaction(async (trx) => {
        expect(await logoColumns(trx)).toEqual([
          {
            column_name: 'logo_key',
            data_type: 'text',
            character_maximum_length: null,
            is_nullable: 'YES',
          },
          {
            column_name: 'logo_mime_type',
            data_type: 'character varying',
            character_maximum_length: 50,
            is_nullable: 'YES',
          },
          {
            column_name: 'logo_updated_at',
            data_type: 'timestamp with time zone',
            character_maximum_length: null,
            is_nullable: 'YES',
          },
        ])

        await trx('companies').insert({ id: 911, name: 'Sans logo', email: 'sans-logo@x.test' })

        expect(
          await trx('companies')
            .where({ id: 911 })
            .first('logo_key', 'logo_mime_type', 'logo_updated_at')
        ).toEqual({ logo_key: null, logo_mime_type: null, logo_updated_at: null })

        await trx('companies').where({ id: 911 }).update({
          logo_key: 'logos/11111111-1111-4111-8111-111111111111.png',
          logo_mime_type: 'image/png',
          logo_updated_at: trx.fn.now(),
        })

        expect(
          (await trx('companies').where({ id: 911 }).first('logo_mime_type')).logo_mime_type
        ).toBe('image/png')

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  })

  it('down removes the three columns, and up brings them back', async () => {
    await expect(
      db.transaction(async (trx) => {
        await migration.down(trx)
        expect(await logoColumns(trx)).toEqual([])

        await migration.up(trx)
        expect((await logoColumns(trx)).map((column) => column.column_name)).toEqual(LOGO_COLUMNS)

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)

    // Le retour arrière annulé ne touche pas à la base réelle.
    expect(await logoColumns(db)).toHaveLength(3)
  })

  describe('retour arrière réel de la migration (down)', () => {
    const migrationToRevert = {
      directory: path.resolve(process.cwd(), 'backend/db/migrations'),
      name: '20261124030000_add_logo_to_companies.js',
    }

    // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
    afterEach(async () => {
      await db.migrate.latest({ directory: migrationToRevert.directory })
    })

    it('refuse tant qu’une compagnie a un logo, puis passe une fois le logo retiré', async () => {
      await db('companies').insert({ id: 912, name: 'Avec logo', email: 'avec-logo@x.test' })
      await db('companies').where({ id: 912 }).update({
        logo_key: 'logos/22222222-2222-4222-8222-222222222222.png',
        logo_mime_type: 'image/png',
        logo_updated_at: db.fn.now(),
      })

      await expect(db.migrate.down(migrationToRevert)).rejects.toThrow(
        /Rollback impossible : des compagnies ont un logo \(companies\.logo_key\)\./
      )
      // Refus : le schéma n'a pas bougé, le logo est toujours là.
      expect(await logoColumns(db)).toHaveLength(3)
      expect((await db('companies').where({ id: 912 }).first('logo_key')).logo_key).toBe(
        'logos/22222222-2222-4222-8222-222222222222.png'
      )

      await db('companies').where({ id: 912 }).update({
        logo_key: null,
        logo_mime_type: null,
        logo_updated_at: null,
      })
      await db.migrate.down(migrationToRevert)

      expect(await logoColumns(db)).toEqual([])

      await db.migrate.latest({ directory: migrationToRevert.directory })

      expect(await logoColumns(db)).toHaveLength(3)
    })
  })
})
