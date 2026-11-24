import path from 'node:path'

import type dbModule from '@backend/db'
import { API_KEY_MAX_ACTIVE, API_KEY_STATUS_ACTIVE } from '@quizzup/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../../../setup/assertTestDatabase'
import { authHeaders, companyAdminUser, createRouteApp } from '../../_helpers/testApp'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts --no-file-parallelism \
 *     tests/backend/src/routes/companies/apiKeys/companies.apiKeys.pg.test.ts
 *
 * Le verrou posé sur la compagnie à la création d'une clé ne se prouve que sur la vraie base :
 * le `mockDb` n'a pas de concurrence. ATTENTION : base DÉDIÉE (le nom doit finir par `_test`) ; les
 * tables `api_*`, `games`, `rooms`, `admins` et `companies` y sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule

describe.skipIf(!PG_INTEGRATION_URL)("création de clés d'API sur PostgreSQL", () => {
  let db: Db
  let app: Awaited<ReturnType<typeof createRouteApp>>
  let logsApp: Awaited<ReturnType<typeof createRouteApp>>

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })

    const routes = (await import('@backend/routes/companies/apiKeys')).default

    app = await createRouteApp(routes)
    logsApp = await createRouteApp((await import('@backend/routes/companies/apiLogs')).default)
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await logsApp?.close()
    await db?.destroy()
  }, 30_000)

  beforeEach(async () => {
    await db.raw(
      'TRUNCATE api_request_logs, api_idempotency_keys, api_keys, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
    )
    await db('companies').insert({ id: 1, name: 'Centre A', email: 'a@x.test' })
    await db('admins').insert({
      id: companyAdminUser.id,
      company_id: 1,
      role: 'admin',
      username: 'alice',
      email: 'alice@x.test',
      mdp_hash: 'x',
    })
  }, 30_000)

  const create = (name: string) =>
    app.inject({
      method: 'POST',
      url: '/companies/1/api-keys',
      headers: authHeaders(companyAdminUser),
      payload: { name },
    })

  it('never exceeds the active key limit when creations run at the same time', async () => {
    const responses = await Promise.all(
      Array.from({ length: API_KEY_MAX_ACTIVE + 4 }, (_, index) => create(`Clé ${index}`))
    )

    const statuses = responses.map((response) => response.statusCode)

    expect(statuses.filter((status) => status === 201)).toHaveLength(API_KEY_MAX_ACTIVE)
    expect(statuses.filter((status) => status === 409)).toHaveLength(4)
    expect(responses.filter((r) => r.statusCode === 409).map((r) => r.json())).toEqual(
      Array(4).fill({ error: 'api_key_limit_reached' })
    )

    const [{ count }] = await db('api_keys')
      .where('company_id', 1)
      .where('status', API_KEY_STATUS_ACTIVE)
      .count()

    expect(Number(count)).toBe(API_KEY_MAX_ACTIVE)
  }, 30_000)

  it('stores only the hash of the secret it returns', async () => {
    const response = await create('Site web')
    const { secret, apiKey } = response.json() as { secret: string; apiKey: { id: number } }

    const stored = await db('api_keys').where('id', apiKey.id).first()

    expect(response.statusCode).toBe(201)
    expect(JSON.stringify(stored)).not.toContain(secret)
    expect(stored.key_prefix).toBe(secret.slice(0, 12))
    expect(stored.key_hash).toHaveLength(64)
  })

  it('names the unique index violated by a duplicate prefix or hash (the creation retries on both)', async () => {
    const base = { company_id: 1, name: 'A', key_prefix: 'qzk_00000001', key_hash: 'a'.repeat(64) }

    await db('api_keys').insert(base)

    await expect(
      db('api_keys').insert({ ...base, key_hash: 'b'.repeat(64) })
    ).rejects.toMatchObject({ code: '23505', constraint: 'api_keys_key_prefix_unique' })
    await expect(
      db('api_keys').insert({ ...base, key_prefix: 'qzk_00000002' })
    ).rejects.toMatchObject({ code: '23505', constraint: 'api_keys_key_hash_unique' })
  })

  describe('journal des appels', () => {
    const readLogs = async (query: string) =>
      (
        await logsApp.inject({
          method: 'GET',
          url: `/companies/1/api-logs?${query}`,
          headers: authHeaders(companyAdminUser),
        })
      ).json() as { logs: Array<{ id: number }>; nextBefore: number | null }

    it('orders and paginates by date, not by id, and returns an empty page for an unknown cursor', async () => {
      await db('companies').insert({ id: 2, name: 'Centre B', email: 'b@x.test' })
      await db('api_keys').insert([
        { id: 1, company_id: 1, name: 'A', key_prefix: 'qzk_00000001', key_hash: 'a'.repeat(64) },
        { id: 2, company_id: 2, name: 'B', key_prefix: 'qzk_00000002', key_hash: 'b'.repeat(64) },
      ])

      const log = (id: number, createdAt: string, companyId = 1) => ({
        id,
        company_id: companyId,
        api_key_id: companyId,
        method: 'GET',
        route: '/public/v1/rooms',
        status_code: 200,
        duration_ms: 5,
        created_at: createdAt,
      })

      // L'id le plus grand (3) est le plus ancien ; 4 et 2 ont la même date, 4 gagne par l'id.
      await db('api_request_logs').insert([
        log(1, '2026-11-20T10:00:00.000Z'),
        log(2, '2026-11-21T10:00:00.000Z'),
        log(3, '2026-11-19T10:00:00.000Z'),
        log(4, '2026-11-21T10:00:00.000Z'),
        log(5, '2026-11-22T10:00:00.000Z', 2),
      ])

      const first = await readLogs('limit=2')
      const second = await readLogs(`limit=2&before=${first.nextBefore}`)

      expect(first.logs.map((l) => l.id)).toEqual([4, 2])
      expect(first.nextBefore).toBe(2)
      expect(second.logs.map((l) => l.id)).toEqual([1, 3])
      expect(second.nextBefore).toBeNull()

      // Un curseur qui n'est pas une ligne de la compagnie (inexistant, ou d'une autre) : page vide.
      expect(await readLogs('before=999')).toEqual({ logs: [], nextBefore: null })
      expect(await readLogs('before=5')).toEqual({ logs: [], nextBefore: null })
    }, 30_000)
  })
})
