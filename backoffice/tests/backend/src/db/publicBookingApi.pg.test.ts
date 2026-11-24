import path from 'node:path'

import type dbModule from '@backend/db'
import { generateApiKey } from '@backend/security/apiKeys'
import { API_KEY_STATUS_ACTIVE, API_KEY_STATUS_REVOKED } from '@quizzup/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/db/publicBookingApi.pg.test.ts
 *
 * Le `mockDb` des autres tests n'applique aucune contrainte : unicité, `CHECK` et clés étrangères
 * de l'API de réservation ne se prouvent que sur la vraie base.
 *
 * ATTENTION : base DÉDIÉE (le nom doit finir par `_test`). Les migrations y sont appliquées et les
 * tables `api_*`, `games`, `rooms`, `admins`, `companies` sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule

describe.skipIf(!PG_INTEGRATION_URL)('API de réservation sur PostgreSQL', () => {
  let db: Db

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  }, 30_000)

  beforeEach(async () => {
    await db.raw(
      'TRUNCATE api_request_logs, api_idempotency_keys, api_keys, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
    )

    await db('companies').insert([
      { id: 1, name: 'Centre A', email: 'a@x.test' },
      { id: 2, name: 'Centre B', email: 'b@x.test' },
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
  }, 30_000)

  async function addKey(companyId = 1, overrides: Record<string, unknown> = {}) {
    const key = generateApiKey()
    const [row] = await db('api_keys')
      .insert({
        company_id: companyId,
        name: 'Site web',
        key_prefix: key.prefix,
        key_hash: key.hash,
        created_by_admin_id: 1,
        ...overrides,
      })
      .returning('id')

    return { ...key, id: Number(row.id) }
  }

  // `finished` : l'index des parties actives n'autorise qu'une partie `pending` par salle.
  function addGame(values: Record<string, unknown>) {
    return db('games')
      .insert({ company_id: 1, room_id: 1, seed: 1, state: 'finished', ...values })
      .returning('id')
  }

  async function errorOf(promise: PromiseLike<unknown>) {
    try {
      await promise
    } catch (error) {
      return error as { code?: string; constraint?: string }
    }

    return null
  }

  describe('api_keys', () => {
    it('creates an active key with defaults, then finds it by hash', async () => {
      const key = await addKey()

      const row = await db('api_keys').where({ key_hash: key.hash }).first()

      expect(row).toMatchObject({
        id: key.id,
        company_id: 1,
        status: API_KEY_STATUS_ACTIVE,
        last_used_at: null,
        deleted_at: null,
      })
      expect(row.key_hash).toHaveLength(64)
      expect(row.created_at).toBeInstanceOf(Date)
    })

    it('refuses a second key with the same prefix or the same hash (23505)', async () => {
      const key = await addKey()

      expect(
        await errorOf(addKey(1, { key_hash: 'c'.repeat(64), key_prefix: key.prefix }))
      ).toMatchObject({
        code: '23505',
        constraint: 'api_keys_key_prefix_unique',
      })
      expect(
        await errorOf(addKey(1, { key_prefix: 'qzk_00000000', key_hash: key.hash }))
      ).toMatchObject({
        code: '23505',
        constraint: 'api_keys_key_hash_unique',
      })
    })

    it('refuses an unknown status and a revocation without deleted_at (23514)', async () => {
      expect(await errorOf(addKey(1, { status: 3 }))).toMatchObject({
        code: '23514',
        constraint: 'api_keys_status_check',
      })
      expect(await errorOf(addKey(1, { status: API_KEY_STATUS_REVOKED }))).toMatchObject({
        code: '23514',
        constraint: 'api_keys_deleted_at_check',
      })
      expect(await errorOf(addKey(1, { deleted_at: new Date() }))).toMatchObject({
        code: '23514',
        constraint: 'api_keys_deleted_at_check',
      })
    })

    it('accepts a revoked key (status 2 and deleted_at)', async () => {
      await expect(
        addKey(1, { status: API_KEY_STATUS_REVOKED, deleted_at: new Date() })
      ).resolves.toBeDefined()
    })

    it('refuses a key for an unknown company (23503)', async () => {
      expect(await errorOf(addKey(99))).toMatchObject({ code: '23503' })
    })
  })

  describe('api_idempotency_keys', () => {
    it('is unique per company and idempotency key, not across companies', async () => {
      const keyA = await addKey(1)
      const keyB = await addKey(2)
      const [{ id: gameA }] = await addGame({ admin_id: 1 })
      const [{ id: gameB }] = await db('games')
        .insert({ company_id: 2, room_id: 1, admin_id: 1, seed: 1, state: 'finished' })
        .returning('id')

      const base = { idempotency_key: 'resa-42', request_hash: 'a'.repeat(64) }
      const rowA = { ...base, company_id: 1, api_key_id: keyA.id, game_id: gameA }
      await db('api_idempotency_keys').insert(rowA)

      expect(await errorOf(db('api_idempotency_keys').insert(rowA))).toMatchObject({
        code: '23505',
        constraint: 'api_idempotency_keys_company_id_key_unique',
      })

      await expect(
        db('api_idempotency_keys').insert({
          ...base,
          company_id: 2,
          api_key_id: keyB.id,
          game_id: gameB,
        })
      ).resolves.toBeDefined()
    })

    it('goes away with its game', async () => {
      const key = await addKey()
      const [{ id: gameId }] = await addGame({ admin_id: null, api_key_id: key.id })
      await db('api_idempotency_keys').insert({
        company_id: 1,
        api_key_id: key.id,
        idempotency_key: 'k',
        request_hash: 'b'.repeat(64),
        game_id: gameId,
      })

      await db('games').where({ id: gameId }).delete()

      expect(await db('api_idempotency_keys')).toHaveLength(0)
    })
  })

  describe('api_request_logs', () => {
    it('keeps the log line when its game is deleted (game_id set to null)', async () => {
      const key = await addKey()
      const [{ id: gameId }] = await addGame({ admin_id: null, api_key_id: key.id })
      await db('api_request_logs').insert({
        company_id: 1,
        api_key_id: key.id,
        method: 'POST',
        route: '/public/v1/bookings',
        status_code: 201,
        game_id: gameId,
        duration_ms: 12,
      })

      await db('games').where({ id: gameId }).delete()

      const [line] = await db('api_request_logs')
      expect(line).toMatchObject({ game_id: null, idempotent_replay: false, error_code: null })
    })
  })

  describe('games.admin_id et games.api_key_id', () => {
    it('accepts a game made by an admin, and a booking made by an API key (admin_id null)', async () => {
      const key = await addKey()

      await expect(addGame({ admin_id: 1 })).resolves.toHaveLength(1)
      await expect(addGame({ admin_id: null, api_key_id: key.id })).resolves.toHaveLength(1)
    })

    it('refuses a game without any creator (games_creator_check)', async () => {
      expect(await errorOf(addGame({ admin_id: null }))).toMatchObject({
        code: '23514',
        constraint: 'games_creator_check',
      })
    })

    it('refuses a game that points to an unknown API key (23503)', async () => {
      expect(await errorOf(addGame({ admin_id: 1, api_key_id: 99 }))).toMatchObject({
        code: '23503',
      })
    })
  })

  describe('retour arrière de la migration (down)', () => {
    const migration = {
      directory: path.resolve(process.cwd(), 'backend/db/migrations'),
      name: '20261124070000_create_public_booking_api.js',
    }

    // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
    afterEach(async () => {
      await db.migrate.latest({ directory: migration.directory })
    }, 30_000)

    it('refuses while a booking was made by the API, then passes and replays on a clean base', async () => {
      const key = await addKey()
      await addGame({ admin_id: null, api_key_id: key.id })

      await expect(db.migrate.down(migration)).rejects.toThrow(/Rollback impossible/)
      // Refus : le schéma n'a pas bougé.
      expect(await db.schema.hasTable('api_keys')).toBe(true)
      expect(await db('games').whereNull('admin_id')).toHaveLength(1)

      await db('games').delete()
      await db('api_keys').delete()
      await db.migrate.down(migration)

      expect(await db.schema.hasTable('api_keys')).toBe(false)
      expect(await db.schema.hasTable('api_idempotency_keys')).toBe(false)
      expect(await db.schema.hasTable('api_request_logs')).toBe(false)
      expect(await db.schema.hasColumn('games', 'api_key_id')).toBe(false)
      // admin_id est redevenu obligatoire.
      expect(await errorOf(addGame({ admin_id: null }))).toMatchObject({ code: '23502' })

      await db.migrate.latest({ directory: migration.directory })

      await expect(addGame({ admin_id: 1 })).resolves.toHaveLength(1)
    })

    it('refuses while a game still carries an API key, even with an admin', async () => {
      const key = await addKey()
      await addGame({ admin_id: 1, api_key_id: key.id })

      await expect(db.migrate.down(migration)).rejects.toThrow(/Rollback impossible/)
    })

    it('refuses while api_keys holds a key, even with no game, and drops nothing', async () => {
      await addKey()
      await addKey(1, { status: API_KEY_STATUS_REVOKED, deleted_at: new Date() })

      await expect(db.migrate.down(migration)).rejects.toThrow(/api_keys contient des clés/)
      expect(await db.schema.hasTable('api_keys')).toBe(true)
      expect(await db.schema.hasTable('api_request_logs')).toBe(true)
      expect(await db.schema.hasColumn('games', 'api_key_id')).toBe(true)

      await db('api_keys').delete()
      await db.migrate.down(migration)

      expect(await db.schema.hasTable('api_keys')).toBe(false)
    })
  })
})
