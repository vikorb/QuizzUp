import { createRequire } from 'node:module'
import path from 'node:path'

import type dbModule from '@backend/db'
import { QUESTION_AUDIO_EFFECTS } from '@quizzup/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Migration `add_audio_effect_to_questions` sur PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE dont
 * le nom finit par `_test`) : `up` est joué par `migrate.latest`, la contrainte est vérifiée dans
 * des transactions annulées, `down` puis `up` dans une transaction annulée, puis le `down` réel
 * (refus tant qu'une question a un effet).
 */
const require = createRequire(import.meta.url)
const migration = require(
  path.resolve(
    process.cwd(),
    'backend/db/migrations/20261124120000_add_audio_effect_to_questions.js'
  )
) as {
  up: (knex: Db) => Promise<void>
  down: (knex: Db) => Promise<void>
}

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule

describe.skipIf(!PG_INTEGRATION_URL)('add_audio_effect_to_questions sur PostgreSQL', () => {
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
    await db('companies').insert({ id: 922, name: 'Effets', email: 'effets@x.test' })
    await db('admins').insert({
      id: 9922,
      company_id: 922,
      role: 'admin',
      username: 'effets',
      email: 'e@x.test',
      mdp_hash: 'x',
    })
  })

  const ROLLBACK = new Error('rollback voulu')

  async function audioEffectColumns(trx: Db) {
    const { rows } = await trx.raw(
      `select column_name, data_type, character_maximum_length, is_nullable, column_default
         from information_schema.columns
        where table_name = 'questions' and column_name = 'audio_effect'`
    )

    return rows as {
      column_name: string
      data_type: string
      character_maximum_length: number | null
      is_nullable: string
      column_default: string | null
    }[]
  }

  function insertQuestion(trx: Db, overrides: Record<string, unknown> = {}) {
    return trx('questions').insert({
      admin_id: 9922,
      scope: 'company',
      company_id: 922,
      question: 'Extrait ?',
      type_media: 'audio',
      ...overrides,
    })
  }

  it('adds a not null varchar column that defaults to none', async () => {
    await expect(
      db.transaction(async (trx) => {
        expect(await audioEffectColumns(trx)).toEqual([
          {
            column_name: 'audio_effect',
            data_type: 'character varying',
            character_maximum_length: 20,
            is_nullable: 'NO',
            column_default: "'none'::character varying",
          },
        ])

        const [created] = await insertQuestion(trx).returning('id')

        expect(
          (await trx('questions').where({ id: created.id }).first('audio_effect')).audio_effect
        ).toBe('none')

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  })

  it.each([...QUESTION_AUDIO_EFFECTS])('accepts the effect %s', async (audio_effect) => {
    await expect(
      db.transaction(async (trx) => {
        await insertQuestion(trx, { audio_effect })
        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  })

  it('refuses an effect that is not in the list, and a null effect', async () => {
    for (const audio_effect of ['echo', null]) {
      await expect(
        db.transaction(async (trx) => {
          await insertQuestion(trx, { audio_effect })
          throw ROLLBACK
        })
      ).rejects.toThrow(audio_effect === null ? /audio_effect/ : 'questions_audio_effect_check')
    }
  })

  it('down removes the column and its constraint, and up brings them back', async () => {
    await expect(
      db.transaction(async (trx) => {
        await migration.down(trx)
        expect(await audioEffectColumns(trx)).toEqual([])

        await migration.up(trx)
        expect(await audioEffectColumns(trx)).toHaveLength(1)

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)

    // Le retour arrière annulé ne touche pas à la base réelle.
    expect(await audioEffectColumns(db)).toHaveLength(1)
  })

  describe('retour arrière réel de la migration (down)', () => {
    const rollback = {
      directory: path.resolve(process.cwd(), 'backend/db/migrations'),
      name: '20261124120000_add_audio_effect_to_questions.js',
    }

    // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
    afterEach(async () => {
      await db.migrate.latest({ directory: rollback.directory })
    })

    it('refuse tant qu’une question a un effet audio, puis passe une fois retiré', async () => {
      await insertQuestion(db, { id: 932, audio_effect: 'reverse' })

      await expect(db.migrate.down(rollback)).rejects.toThrow(
        /Rollback impossible : 1 question\(s\) ont un effet audio/
      )
      // Refus : le schéma n'a pas bougé, l'effet est toujours là.
      expect(await audioEffectColumns(db)).toHaveLength(1)
      expect((await db('questions').where({ id: 932 }).first('audio_effect')).audio_effect).toBe(
        'reverse'
      )

      await db('questions').where({ id: 932 }).update({ audio_effect: 'none' })
      await db.migrate.down(rollback)

      expect(await audioEffectColumns(db)).toEqual([])

      await db.migrate.latest({ directory: rollback.directory })

      expect(await audioEffectColumns(db)).toHaveLength(1)
    })
  })
})
