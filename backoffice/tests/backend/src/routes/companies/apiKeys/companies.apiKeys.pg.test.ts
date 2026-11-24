import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { API_KEY_MAX_ACTIVE, API_KEY_STATUS_ACTIVE } from '@quizzup/shared'
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

type Db = typeof import('@backend/db').default

describe.skipIf(!PG_INTEGRATION_URL)("création de clés d'API sur PostgreSQL", () => {
  let db: Db
  let app: Awaited<ReturnType<typeof createRouteApp>>

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })

    const routes = (await import('@backend/routes/companies/apiKeys')).default

    app = await createRouteApp(routes)
  }, 120_000)

  afterAll(async () => {
    await app?.close()
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
})
