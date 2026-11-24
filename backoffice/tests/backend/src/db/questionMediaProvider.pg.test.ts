import { createRequire } from 'node:module'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Migration `add_media_provider_to_questions` sur PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE
 * dont le nom finit par `_test`) : `up` est joué par `migrate.latest`, contraintes vérifiées dans
 * des transactions annulées, `down` puis `up` dans une transaction annulée, puis le `down` réel
 * (refus tant qu'une question utilise un extrait de fournisseur).
 */
const require = createRequire(import.meta.url)
const migration = require(
  path.resolve(
    process.cwd(),
    'backend/db/migrations/20261124110000_add_media_provider_to_questions.js'
  )
) as {
  up: (knex: Db) => Promise<void>
  down: (knex: Db) => Promise<void>
}

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default

const PROVIDER_COLUMNS = ['media_provider', 'media_provider_ref']

describe.skipIf(!PG_INTEGRATION_URL)('add_media_provider_to_questions sur PostgreSQL', () => {
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
    await db('companies').insert({ id: 921, name: 'Extraits', email: 'extraits@x.test' })
    await db('admins').insert({
      id: 9921,
      company_id: 921,
      role: 'admin',
      username: 'extraits',
      email: 'e@x.test',
      mdp_hash: 'x',
    })
  })

  const ROLLBACK = new Error('rollback voulu')

  async function providerColumns(trx: Db) {
    const { rows } = await trx.raw(
      `select column_name, data_type, character_maximum_length, is_nullable
         from information_schema.columns
        where table_name = 'questions' and column_name = any(?)
        order by column_name`,
      [PROVIDER_COLUMNS]
    )

    return rows as {
      column_name: string
      data_type: string
      character_maximum_length: number | null
      is_nullable: string
    }[]
  }

  function insertQuestion(trx: Db, overrides: Record<string, unknown> = {}) {
    return trx('questions').insert({
      admin_id: 9921,
      scope: 'company',
      company_id: 921,
      question: 'Extrait ?',
      type_media: 'audio',
      ...overrides,
    })
  }

  /** La contrainte refuse l'écriture ; la transaction est annulée dans tous les cas. */
  async function expectRefused(overrides: Record<string, unknown>, constraint: string) {
    await expect(
      db.transaction(async (trx) => {
        await insertQuestion(trx, overrides)
        throw ROLLBACK
      })
    ).rejects.toThrow(constraint)
  }

  /** L'écriture passe ; la transaction est annulée pour ne rien laisser derrière. */
  async function expectAccepted(overrides: Record<string, unknown>) {
    await expect(
      db.transaction(async (trx) => {
        await insertQuestion(trx, overrides)
        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  }

  it('adds two nullable varchar columns, empty for an existing question', async () => {
    await expect(
      db.transaction(async (trx) => {
        expect(await providerColumns(trx)).toEqual([
          {
            column_name: 'media_provider',
            data_type: 'character varying',
            character_maximum_length: 20,
            is_nullable: 'YES',
          },
          {
            column_name: 'media_provider_ref',
            data_type: 'character varying',
            character_maximum_length: 64,
            is_nullable: 'YES',
          },
        ])

        const [created] = await insertQuestion(trx).returning('id')

        expect(
          await trx('questions')
            .where({ id: created.id })
            .first('media_provider', 'media_provider_ref')
        ).toEqual({ media_provider: null, media_provider_ref: null })

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  })

  it('accepts a known provider with its ref, or neither', async () => {
    await expectAccepted({ media_provider: 'deezer', media_provider_ref: '3135556' })
    await expectAccepted({ media_provider: null, media_provider_ref: null })
  })

  it('refuses a provider that is not in the list', async () => {
    await expectRefused(
      { media_provider: 'spotify', media_provider_ref: '1' },
      'questions_media_provider_check'
    )
  })

  it('refuses a provider without a ref, and a ref without a provider', async () => {
    await expectRefused(
      { media_provider: 'deezer', media_provider_ref: null },
      'questions_media_provider_pair_check'
    )
    await expectRefused(
      { media_provider: null, media_provider_ref: '1' },
      'questions_media_provider_pair_check'
    )
  })

  it('refuses a provider title on a question that also has an imported file', async () => {
    await expectRefused(
      {
        media_provider: 'deezer',
        media_provider_ref: '1',
        media_key: 'questions/1/11111111-1111-4111-8111-111111111111.mp3',
        media_mime_type: 'audio/mpeg',
        media_size_bytes: 10,
      },
      'questions_media_provider_exclusive_check'
    )
  })

  it('still accepts an imported file without a provider title', async () => {
    await expectAccepted({
      media_key: 'questions/1/22222222-2222-4222-8222-222222222222.mp3',
      media_mime_type: 'audio/mpeg',
      media_size_bytes: 10,
    })
  })

  it('down removes the columns and their constraints, and up brings them back', async () => {
    await expect(
      db.transaction(async (trx) => {
        await migration.down(trx)
        expect(await providerColumns(trx)).toEqual([])

        await migration.up(trx)
        expect((await providerColumns(trx)).map((column) => column.column_name)).toEqual(
          PROVIDER_COLUMNS
        )

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)

    // Le retour arrière annulé ne touche pas à la base réelle.
    expect(await providerColumns(db)).toHaveLength(2)
  })

  describe('retour arrière réel de la migration (down)', () => {
    const rollback = {
      directory: path.resolve(process.cwd(), 'backend/db/migrations'),
      name: '20261124110000_add_media_provider_to_questions.js',
    }

    // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
    afterEach(async () => {
      await db.migrate.latest({ directory: rollback.directory })
    })

    it('refuse tant qu’une question utilise un extrait de fournisseur, puis passe une fois retiré', async () => {
      await insertQuestion(db, { id: 931, media_provider: 'deezer', media_provider_ref: '42' })

      await expect(db.migrate.down(rollback)).rejects.toThrow(
        /Rollback impossible : des questions utilisent un extrait de fournisseur/
      )
      // Refus : le schéma n'a pas bougé, la référence est toujours là.
      expect(await providerColumns(db)).toHaveLength(2)
      expect(
        (await db('questions').where({ id: 931 }).first('media_provider_ref')).media_provider_ref
      ).toBe('42')

      await db('questions').where({ id: 931 }).update({
        media_provider: null,
        media_provider_ref: null,
      })
      await db.migrate.down(rollback)

      expect(await providerColumns(db)).toEqual([])

      await db.migrate.latest({ directory: rollback.directory })

      expect(await providerColumns(db)).toHaveLength(2)
    })
  })
})
