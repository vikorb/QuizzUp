import path from 'node:path'

import type dbModule from '@backend/db'
import type { purgeExpiredApiRecords as purgeExpiredApiRecordsType } from '@backend/jobs/purgeApiRecords'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts --no-file-parallelism \
 *     tests/backend/src/jobs/purgeApiRecords.pg.test.ts
 *
 * ATTENTION : base DÉDIÉE (le nom doit finir par `_test`) ; les tables `api_*`, `games`, `rooms`,
 * `admins` et `companies` y sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

const NOW = new Date('2026-11-24T12:00:00.000Z')
// Limites : journal = NOW - 90 jours (2026-08-26T12:00:00Z), idempotence = NOW - 24 h.
const JUST_BEFORE_LOG_CUTOFF = '2026-08-26T11:59:59.999Z'
const AT_LOG_CUTOFF = '2026-08-26T12:00:00.000Z'
const JUST_BEFORE_IDEMPOTENCY_CUTOFF = '2026-11-23T11:59:59.999Z'
const AT_IDEMPOTENCY_CUTOFF = '2026-11-23T12:00:00.000Z'

type Db = typeof dbModule

describe.skipIf(!PG_INTEGRATION_URL)("purge de l'API de réservation sur PostgreSQL", () => {
  let db: Db
  let purge: typeof purgeExpiredApiRecordsType

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default
    purge = (await import('@backend/jobs/purgeApiRecords')).purgeExpiredApiRecords

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
    await db('companies').insert({ id: 1, name: 'Centre A', email: 'a@x.test' })
    await db('admins').insert({
      id: 1,
      company_id: 1,
      role: 'admin',
      username: 'admin',
      email: 'admin@x.test',
      mdp_hash: 'x',
    })
    await db('rooms').insert({ id: 1, company_id: 1, name: 'Salle 1' })
    await db('api_keys').insert({
      id: 1,
      company_id: 1,
      name: 'Clé',
      key_prefix: 'qzk_00000001',
      key_hash: 'a'.repeat(64),
    })
  }, 30_000)

  const addLog = (createdAt: string) =>
    db('api_request_logs').insert({
      company_id: 1,
      api_key_id: 1,
      method: 'GET',
      route: '/public/v1/rooms',
      status_code: 200,
      duration_ms: 3,
      created_at: createdAt,
    })

  const addIdempotencyKey = async (key: string, createdAt: string) => {
    const [game] = await db('games')
      .insert({
        company_id: 1,
        room_id: 1,
        api_key_id: 1,
        seed: 1,
        state: 'finished',
        created_at: createdAt,
      })
      .returning('id')

    await db('api_idempotency_keys').insert({
      company_id: 1,
      api_key_id: 1,
      idempotency_key: key,
      request_hash: 'b'.repeat(64),
      game_id: game.id,
      created_at: createdAt,
    })
  }

  it('deletes the calls older than 90 days and keeps the others', async () => {
    await addLog(JUST_BEFORE_LOG_CUTOFF)
    await addLog(AT_LOG_CUTOFF)
    await addLog('2026-11-24T11:00:00.000Z')

    const deleted = await purge(db, NOW)

    expect(deleted).toBe(1)
    const rows = await db('api_request_logs').orderBy('id').select('created_at')

    expect(rows.map((row) => row.created_at.toISOString())).toEqual([
      AT_LOG_CUTOFF,
      '2026-11-24T11:00:00.000Z',
    ])
  })

  it('deletes the idempotency keys older than 24 hours and keeps the others', async () => {
    await addIdempotencyKey('vieille', JUST_BEFORE_IDEMPOTENCY_CUTOFF)
    await addIdempotencyKey('limite', AT_IDEMPOTENCY_CUTOFF)
    await addIdempotencyKey('recente', '2026-11-24T11:00:00.000Z')

    const deleted = await purge(db, NOW)

    expect(deleted).toBe(1)
    const rows = await db('api_idempotency_keys').orderBy('id').select('idempotency_key')

    expect(rows.map((row) => row.idempotency_key)).toEqual(['limite', 'recente'])
  })

  it('leaves the keys and the bookings alone, and is idempotent', async () => {
    await addIdempotencyKey('vieille', JUST_BEFORE_IDEMPOTENCY_CUTOFF)

    await purge(db, NOW)

    expect(await db('api_keys').count().first()).toMatchObject({ count: 1 })
    expect(await db('games').count().first()).toMatchObject({ count: 1 })
    expect(await purge(db, NOW)).toBe(0)
  })
})
