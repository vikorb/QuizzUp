import { createRequire } from 'node:module'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Migration `add_kids_flags` et filtre du mode enfants sur PostgreSQL (`PG_INTEGRATION_URL`, base
 * DÉDIÉE dont le nom finit par `_test`) : `up` est joué par `migrate.latest`, `down` puis `up` dans
 * une transaction annulée, le `down` réel (refus tant que l'option est utilisée), puis le contenu
 * envoyé à la salle lu par la vraie requête SQL.
 */
const require = createRequire(import.meta.url)
const migration = require(
  path.resolve(process.cwd(), 'backend/db/migrations/20261124160000_add_kids_flags.js')
) as {
  up: (knex: Db) => Promise<void>
  down: (knex: Db) => Promise<void>
}

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default

const KIDS_COLUMNS = ['kids_friendly', 'kids_mode']
const MIGRATIONS = path.resolve(process.cwd(), 'backend/db/migrations')

describe.skipIf(!PG_INTEGRATION_URL)('add_kids_flags sur PostgreSQL', () => {
  let db: Db
  let loadRoomContent: typeof import('@backend/routes/room/_content').loadRoomContent

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default
    await assertTestDatabase(db)
    await db.migrate.latest({ directory: MIGRATIONS })
    ;({ loadRoomContent } = await import('@backend/routes/room/_content'))
  }, 120_000)

  afterAll(async () => {
    // Base partagée : on ne laisse aucune donnée derrière soi.
    await db?.raw('TRUNCATE games, rooms, admins, companies RESTART IDENTITY CASCADE')
    await db?.destroy()
  })

  // Base partagée avec les autres fichiers `*.pg.test.ts` : on ne dépend pas de ce qu'ils laissent.
  beforeEach(async () => {
    await db.raw('TRUNCATE games, rooms, admins, companies RESTART IDENTITY CASCADE')
    await db('companies').insert([
      { id: 1, name: 'Centre', email: 'c@x.test' },
      { id: 2, name: 'Autre', email: 'a@x.test' },
    ])
    await db('admins').insert({
      id: 1,
      company_id: 1,
      role: 'admin',
      username: 'admin',
      email: 'admin@x.test',
      mdp_hash: 'x',
    })
    await db('rooms').insert({ id: 1, company_id: 1, name: 'Salle 1' })
  })

  const ROLLBACK = new Error('rollback voulu')

  async function kidsColumns(trx: Db) {
    const { rows } = await trx.raw(
      `select table_name, column_name, data_type, is_nullable, column_default
         from information_schema.columns
        where column_name = any(?) and table_name in ('themes', 'games')
        order by column_name`,
      [KIDS_COLUMNS]
    )

    return rows as {
      table_name: string
      column_name: string
      data_type: string
      is_nullable: string
      column_default: string | null
    }[]
  }

  function insertTheme(trx: Db, overrides: Record<string, unknown> = {}) {
    return trx('themes').insert({
      admin_id: 1,
      scope: 'company',
      company_id: 1,
      name: 'Thème',
      mode: 'classic',
      ...overrides,
    })
  }

  function insertGame(trx: Db, overrides: Record<string, unknown> = {}) {
    return trx('games').insert({
      company_id: 1,
      room_id: 1,
      admin_id: 1,
      seed: 1,
      state: 'pending',
      ...overrides,
    })
  }

  /** Thème actif avec une question active (sans média) et une réponse. */
  async function seedQuestion(id: number, themeIds: number[]) {
    await db('questions').insert({
      id,
      admin_id: 1,
      scope: 'company',
      company_id: 1,
      question: `Question ${id}`,
      type_media: 'none',
      status: 1,
    })
    await db('answers').insert({
      question_id: id,
      admin_id: 1,
      response: 'Oui',
      is_correct: true,
      status: 1,
    })
    await db('question_themes').insert(themeIds.map((theme_id) => ({ question_id: id, theme_id })))
  }

  it('adds two not null boolean columns, false for an existing theme and game', async () => {
    await expect(
      db.transaction(async (trx) => {
        expect(await kidsColumns(trx)).toEqual([
          {
            table_name: 'themes',
            column_name: 'kids_friendly',
            data_type: 'boolean',
            is_nullable: 'NO',
            column_default: 'false',
          },
          {
            table_name: 'games',
            column_name: 'kids_mode',
            data_type: 'boolean',
            is_nullable: 'NO',
            column_default: 'false',
          },
        ])

        const [theme] = await insertTheme(trx).returning('id')
        const [game] = await insertGame(trx).returning('id')

        expect(await trx('themes').where({ id: theme.id }).first('kids_friendly')).toEqual({
          kids_friendly: false,
        })
        expect(await trx('games').where({ id: game.id }).first('kids_mode')).toEqual({
          kids_mode: false,
        })

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  })

  it('refuses a null flag', async () => {
    await expect(
      db.transaction(async (trx) => {
        await insertTheme(trx, { kids_friendly: null })
      })
    ).rejects.toThrow(/kids_friendly/)
    await expect(
      db.transaction(async (trx) => {
        await insertGame(trx, { kids_mode: null })
      })
    ).rejects.toThrow(/kids_mode/)
  })

  it('down removes the columns, and up brings them back', async () => {
    await expect(
      db.transaction(async (trx) => {
        await migration.down(trx)
        expect(await kidsColumns(trx)).toEqual([])

        await migration.up(trx)
        expect((await kidsColumns(trx)).map((column) => column.column_name).sort()).toEqual(
          KIDS_COLUMNS
        )

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)

    // Le retour arrière annulé ne touche pas à la base réelle.
    expect(await kidsColumns(db)).toHaveLength(2)
  })

  describe('retour arrière réel de la migration (down)', () => {
    const rollback = { directory: MIGRATIONS, name: '20261124160000_add_kids_flags.js' }

    // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
    afterEach(async () => {
      await db.migrate.latest({ directory: MIGRATIONS })
    })

    it('refuse tant qu’un thème ou une partie utilise l’option, puis passe une fois retirée', async () => {
      await insertTheme(db, { id: 932, kids_friendly: true })

      await expect(db.migrate.down(rollback)).rejects.toThrow(
        /Rollback impossible : des thèmes ou des parties utilisent l'option enfants/
      )
      expect(await kidsColumns(db)).toHaveLength(2)

      await db('themes').where({ id: 932 }).update({ kids_friendly: false })
      await insertGame(db, { kids_mode: true })

      await expect(db.migrate.down(rollback)).rejects.toThrow(/Rollback impossible/)
      expect(await kidsColumns(db)).toHaveLength(2)

      await db('games').update({ kids_mode: false })
      await db.migrate.down(rollback)

      expect(await kidsColumns(db)).toEqual([])

      await db.migrate.latest({ directory: MIGRATIONS })

      expect(await kidsColumns(db)).toHaveLength(2)
    })
  })

  describe('contenu envoyé à la salle (loadRoomContent)', () => {
    const log = { warn: () => undefined }

    /** 1 enfants, 2 adulte, 3 enfants de la compagnie 2, 4 enfants inactif. */
    async function seedContent() {
      await insertTheme(db, { id: 1, name: 'Enfants', kids_friendly: true })
      await insertTheme(db, { id: 2, name: 'Adulte' })
      await insertTheme(db, { id: 3, company_id: 2, name: 'Voisin', kids_friendly: true })
      await insertTheme(db, { id: 4, name: 'Inactif', kids_friendly: true, status: 0 })
      await seedQuestion(11, [1])
      await seedQuestion(12, [1, 2])
      await seedQuestion(21, [2])
      await seedQuestion(31, [3])
      await seedQuestion(41, [4])
    }

    const summary = (themes: Awaited<ReturnType<typeof loadRoomContent>>) =>
      themes.map((theme) => [theme.id, theme.questions.map((question) => question.id).sort()])

    it('sends only the kids friendly themes of the company in kids mode', async () => {
      await seedContent()

      expect(summary(await loadRoomContent(1, log, undefined, true))).toEqual([[1, [11, 12]]])
    })

    it('sends every readable theme otherwise', async () => {
      await seedContent()

      expect(summary(await loadRoomContent(1, log))).toEqual([
        [1, [11, 12]],
        [2, [12, 21]],
      ])
    })

    it('keeps the filter with a list of questions', async () => {
      await seedContent()

      expect(summary(await loadRoomContent(1, log, [12, 21], true))).toEqual([[1, [12]]])
    })
  })
})
