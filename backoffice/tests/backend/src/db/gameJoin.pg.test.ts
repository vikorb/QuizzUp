import path from 'node:path'

import type dbModule from '@backend/db'
import { purgeStaleJoinRegistrations } from '@backend/jobs/purgeJoinRegistrations'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/db/gameJoin.pg.test.ts
 *
 * Le `mockDb` n'applique aucune contrainte : les index scindés des parties, les CHECK du lien et
 * des demandes d'inscription, les retours arrière des deux migrations du lot 2 et la purge RGPD
 * ne se prouvent que sur la vraie base.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `game_registrations`, `game_participants`, `games`, `rooms`, `admins`, `companies` sont vidées
 * avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule

const TRUNCATE_TABLES =
  'TRUNCATE game_registrations, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'

const at = (time: string) => `2027-03-10T${time}:00.000Z`
const NOW = new Date(at('12:00'))

describe.skipIf(!PG_INTEGRATION_URL)('accueil des joueurs : schéma et purge', () => {
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
  })

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
    await db('rooms').insert([
      { id: 1, company_id: 1, name: 'Salle 1' },
      { id: 2, company_id: 1, name: 'Salle 2' },
    ])
  })

  async function addGame(state: string, extra: Record<string, unknown> = {}, room = 1) {
    const [row] = await db('games')
      .insert({ company_id: 1, room_id: room, admin_id: 1, seed: 1, state, ...extra })
      .returning('id')

    return Number(row.id)
  }

  const addRegistration = (gameId: number, extra: Record<string, unknown> = {}) =>
    db('game_registrations').insert({ game_id: gameId, display_name: 'Léa', ...extra })

  describe('index des parties actives', () => {
    it('accepte une partie en attente et une partie en cours dans la même salle', async () => {
      await addGame('pending')

      await expect(addGame('running')).resolves.toBeTypeOf('number')
    })

    it('refuse deux parties en attente, ou deux parties en cours, dans la même salle', async () => {
      await addGame('pending')
      await addGame('running')

      await expect(addGame('pending')).rejects.toMatchObject({
        code: '23505',
        constraint: 'games_room_id_pending_unique',
      })
      await expect(addGame('running')).rejects.toMatchObject({
        code: '23505',
        constraint: 'games_room_id_running_unique',
      })
    })

    it('accepte une partie en attente par salle, et ignore les parties terminées ou supprimées', async () => {
      await addGame('pending')
      await addGame('pending', {}, 2)
      await addGame('finished')
      await addGame('finished')
      await addGame('pending', { status: 2, deleted_at: at('09:00') })
      await addGame('running', { status: 2, deleted_at: at('09:00') })

      expect(await db('games')).toHaveLength(6)
    })
  })

  describe('lien d’inscription', () => {
    it('range le jeton et son expiration ensemble, nuls par défaut', async () => {
      const gameId = await addGame('pending')

      expect(await db('games').where('id', gameId).first()).toMatchObject({
        join_token: null,
        join_expires_at: null,
      })

      await db('games')
        .where('id', gameId)
        .update({ join_token: 'a'.repeat(43), join_expires_at: at('15:00') })

      await expect(
        db('games').where('id', gameId).update({ join_token: null })
      ).rejects.toMatchObject({ code: '23514', constraint: 'games_join_check' })
      await expect(
        db('games').where('id', gameId).update({ join_expires_at: null })
      ).rejects.toMatchObject({ code: '23514', constraint: 'games_join_check' })
      await expect(
        db('games').where('id', gameId).update({ join_token: null, join_expires_at: null })
      ).resolves.toBe(1)
    })

    it('refuse un même jeton sur deux parties, et accepte plusieurs parties sans jeton', async () => {
      const first = await addGame('pending')
      const second = await addGame('pending', {}, 2)
      await addGame('finished')
      await addGame('finished')
      const link = { join_token: 'a'.repeat(43), join_expires_at: at('15:00') }

      await db('games').where('id', first).update(link)

      await expect(db('games').where('id', second).update(link)).rejects.toMatchObject({
        code: '23505',
        constraint: 'games_join_token_unique',
      })
    })
  })

  describe('demandes d’inscription', () => {
    it('accepte une demande minimale, avec la date de création par défaut', async () => {
      const gameId = await addGame('pending')

      await addRegistration(gameId)

      expect(await db('game_registrations').first()).toMatchObject({
        game_id: gameId,
        display_name: 'Léa',
        email: null,
        marketing_consent_at: null,
        second_display_name: null,
      })
      expect((await db('game_registrations').first()).created_at).toBeInstanceOf(Date)
    })

    it('refuse un e-mail sans consentement, des offres sans e-mail, et un 2e joueur incohérent', async () => {
      const gameId = await addGame('pending')
      const refused: Array<[string, Record<string, unknown>]> = [
        ['game_registrations_email_consent_check', { email: 'a@x.test' }],
        ['game_registrations_marketing_consent_email_check', { marketing_consent_at: at('10:00') }],
        [
          'game_registrations_second_email_consent_check',
          { second_display_name: 'Noé', second_email: 'n@x.test' },
        ],
        [
          'game_registrations_second_marketing_consent_email_check',
          { second_display_name: 'Noé', second_marketing_consent_at: at('10:00') },
        ],
        ['game_registrations_second_player_check', { second_consent_at: at('10:00') }],
        [
          'game_registrations_second_player_check',
          { second_email: 'n@x.test', second_consent_at: at('10:00') },
        ],
      ]

      for (const [constraint, extra] of refused) {
        await expect(addRegistration(gameId, extra)).rejects.toMatchObject({
          code: '23514',
          constraint,
        })
      }

      await expect(
        addRegistration(gameId, {
          email: 'a@x.test',
          consent_at: at('10:00'),
          marketing_consent_at: at('10:00'),
          second_display_name: 'Noé',
          second_email: 'n@x.test',
          second_consent_at: at('10:00'),
          second_marketing_consent_at: at('10:00'),
        })
      ).resolves.toBeDefined()
    })

    it('refuse une demande sans partie, et disparaît avec la partie supprimée', async () => {
      await expect(addRegistration(999)).rejects.toMatchObject({ code: '23503' })

      const gameId = await addGame('pending')
      await addRegistration(gameId)
      await db('games').where('id', gameId).delete()

      expect(await db('game_registrations')).toHaveLength(0)
    })
  })

  describe('purge des demandes', () => {
    it('supprime les demandes de plus de 24 h, garde les récentes d’une partie en attente', async () => {
      const gameId = await addGame('pending')
      await addRegistration(gameId, {
        display_name: 'Ancienne',
        created_at: '2027-03-09T11:59:00.000Z',
      })
      await addRegistration(gameId, {
        display_name: 'Pile',
        created_at: '2027-03-09T12:00:00.000Z',
      })
      await addRegistration(gameId, { display_name: 'Récente', created_at: at('11:30') })

      const purged = await purgeStaleJoinRegistrations(db, NOW)

      expect(purged).toBe(1)
      expect(
        (await db('game_registrations').orderBy('id').select('display_name')).map(
          (row) => row.display_name
        )
      ).toEqual(['Pile', 'Récente'])
    })

    it.each(['running', 'finished', 'aborted', 'scheduled'])(
      'supprime les demandes d’une partie %s, même récentes',
      async (state) => {
        const gameId = await addGame(
          state,
          state === 'scheduled' ? { scheduled_at: at('18:00'), scheduled_end_at: at('19:00') } : {}
        )
        await addRegistration(gameId, { created_at: at('11:55') })

        expect(await purgeStaleJoinRegistrations(db, NOW)).toBe(1)
        expect(await db('game_registrations')).toHaveLength(0)
      }
    )

    it('supprime les demandes d’une partie supprimée logiquement, et seulement celles-là', async () => {
      const deleted = await addGame('pending', { status: 2, deleted_at: at('09:00') })
      const waiting = await addGame('pending', {}, 2)
      await addRegistration(deleted, { created_at: at('11:55') })
      await addRegistration(waiting, { created_at: at('11:55') })

      expect(await purgeStaleJoinRegistrations(db, NOW)).toBe(1)
      expect(await db('game_registrations').select('game_id')).toEqual([{ game_id: waiting }])
    })

    it('ne supprime rien quand tout est récent et en attente, et sait tourner deux fois', async () => {
      const gameId = await addGame('pending')
      await addRegistration(gameId, { created_at: at('11:55') })

      expect(await purgeStaleJoinRegistrations(db, NOW)).toBe(0)
      expect(await purgeStaleJoinRegistrations(db, NOW)).toBe(0)
      expect(await db('game_registrations')).toHaveLength(1)
    })
  })

  describe('retour arrière des migrations', () => {
    const split = { directory, name: '20261124020000_split_active_game_index.js' }
    const join = { directory, name: '20261124020100_add_join_to_games.js' }

    // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
    afterEach(async () => {
      await db.migrate.latest({ directory })
    })

    async function hasIndex(name: string) {
      const { rows } = await db.raw('SELECT 1 FROM pg_indexes WHERE indexname = ?', [name])

      return rows.length === 1
    }

    it('refuse de rétablir l’index unique tant qu’une salle a une partie en attente et une en cours', async () => {
      await addGame('pending')
      await addGame('running')

      await expect(db.migrate.down(split)).rejects.toThrow(/Rollback impossible/)
      expect(await hasIndex('games_room_id_pending_unique')).toBe(true)
      expect(await hasIndex('games_room_id_active_unique')).toBe(false)
    })

    it('rétablit l’index d’origine sur une base sans coexistence, puis se rejoue', async () => {
      await addGame('pending')
      await addGame('running', {}, 2)

      await db.migrate.down(split)

      expect(await hasIndex('games_room_id_active_unique')).toBe(true)
      expect(await hasIndex('games_room_id_pending_unique')).toBe(false)
      expect(await hasIndex('games_room_id_running_unique')).toBe(false)
      await expect(addGame('running')).rejects.toMatchObject({
        constraint: 'games_room_id_active_unique',
      })

      await db('games').delete()
      await db.migrate.latest({ directory })

      expect(await hasIndex('games_room_id_pending_unique')).toBe(true)
      expect(await hasIndex('games_room_id_running_unique')).toBe(true)
      expect(await hasIndex('games_room_id_active_unique')).toBe(false)
    })

    it('refuse de supprimer la table tant qu’une demande attend, puis passe et se rejoue', async () => {
      const gameId = await addGame('pending')
      await addRegistration(gameId)

      await expect(db.migrate.down(join)).rejects.toThrow(/Rollback impossible/)
      expect(await db.schema.hasTable('game_registrations')).toBe(true)

      await db('game_registrations').delete()
      await db.migrate.down(join)

      expect(await db.schema.hasTable('game_registrations')).toBe(false)
      expect(await db.schema.hasColumn('games', 'join_token')).toBe(false)
      expect(await db.schema.hasColumn('games', 'join_expires_at')).toBe(false)
      expect(await hasIndex('games_join_token_unique')).toBe(false)

      await db.migrate.latest({ directory })

      expect(await db.schema.hasTable('game_registrations')).toBe(true)
      expect(await db.schema.hasColumn('games', 'join_token')).toBe(true)
      expect(await hasIndex('games_join_token_unique')).toBe(true)
    })
  })
})
