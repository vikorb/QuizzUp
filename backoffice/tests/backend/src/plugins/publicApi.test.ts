import '../routes/_helpers/registerDbMock'

import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import publicApiPlugin from '@backend/plugins/publicApi'
import { sendPublicError } from '@backend/routes/public/_shared'
import { dbState, resetDb } from '../routes/_helpers/mockDb'
import { bearer, PUBLIC_API_NOW, seedRevokedToken, seedToken } from '../routes/_helpers/publicApi'

const MINUTE_MS = 60_000

// Réponses entièrement terminées, hooks `onResponse` compris : le journal s'écrit après l'envoi.
let finished = 0
const settled = (count: number) => vi.waitFor(() => expect(finished).toBe(count))

async function createApp() {
  const app = fastify({ logger: false })

  finished = 0

  await app.register(
    (async (scope: typeof app) => {
      await scope.register(publicApiPlugin as never)
      scope.get('/ping', async () => ({ ok: true }))
      scope.get('/missing', async (_req, reply) =>
        sendPublicError(reply as never, 404, 'room_not_found')
      )
      scope.post('/echo', async () => ({ ok: true }))
      // Enregistré après le plugin : il s'exécute une fois son hook `onResponse` terminé.
      scope.addHook('onResponse', async () => {
        finished += 1
      })
    }) as never,
    { prefix: '/public/v1' }
  )
  await app.ready()

  return app
}

type App = Awaited<ReturnType<typeof createApp>>

let app: App | undefined

const call = (
  headers: Record<string, string> = {},
  url = '/public/v1/ping',
  remoteAddress = '203.0.113.7'
) => app!.inject({ method: 'GET', url, headers, remoteAddress })

async function start() {
  app = await createApp()
}

beforeEach(() => {
  resetDb()
  // Compagnie 1 et 2 actives, sauf mention contraire dans le test.
  dbState.companies[1]!.status = COMPANY_STATUS_ACTIVE
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PUBLIC_API_NOW)
})

afterEach(async () => {
  await app?.close()
  app = undefined
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('plugins/publicApi — authentification', () => {
  it('answers 401 api_key_missing without an Authorization header or with another scheme', async () => {
    await start()
    const { token } = seedToken()

    const cases: Array<Record<string, string>> = [
      {},
      { authorization: `Basic ${token}` },
      { authorization: 'Bearer eyJhbGciOi.x.y' },
    ]

    for (const headers of cases) {
      const response = await call(headers)

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'api_key_missing' })
    }
  })

  it('answers the same 401 api_key_invalid for a malformed, unknown, revoked or deleted-company key', async () => {
    await start()
    const unknown = seedToken()
    dbState.api_keys.length = 0 // jeton bien formé, mais la clé n'existe plus en base
    const revoked = seedRevokedToken()
    const ofDeletedCompany = seedToken(2)
    dbState.companies[1]!.status = COMPANY_STATUS_DELETED

    for (const token of ['qzk_nope', unknown.token, revoked.token, ofDeletedCompany.token]) {
      const response = await call(bearer(token))

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'api_key_invalid' })
    }
  })

  it('refuses a key as soon as it is revoked, with no delay', async () => {
    await start()
    const { token, row } = seedToken()

    expect((await call(bearer(token))).statusCode).toBe(200)

    Object.assign(row, { status: 2, deleted_at: '2027-03-10T08:00:00.000Z' })

    expect((await call(bearer(token))).statusCode).toBe(401)
  })

  it('answers 403 company_inactive for a valid key of an inactive company', async () => {
    await start()
    dbState.companies[1]!.status = COMPANY_STATUS_INACTIVE
    const { token } = seedToken(2)

    const response = await call(bearer(token))

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'company_inactive' })
  })

  it('lets a valid key through with the rate limit headers', async () => {
    await start()
    const { token } = seedToken()

    const response = await call(bearer(token))

    expect(response.statusCode).toBe(200)
    expect(response.headers['ratelimit-limit']).toBe('120')
    expect(response.headers['ratelimit-remaining']).toBe('119')
  })

  it('still answers 200 when last_used_at cannot be written', async () => {
    await start()
    const { token, row } = seedToken()

    Object.defineProperty(row, 'last_used_at', {
      enumerable: true,
      get: () => null,
      set() {
        throw new Error('write failed')
      },
    })

    expect((await call(bearer(token))).statusCode).toBe(200)
  })

  it('refreshes last_used_at at most once a minute', async () => {
    await start()
    const { token, row } = seedToken()

    await call(bearer(token))
    expect(row.last_used_at).toEqual(PUBLIC_API_NOW)

    vi.setSystemTime(PUBLIC_API_NOW.getTime() + 30_000)
    await call(bearer(token))
    expect(row.last_used_at).toEqual(PUBLIC_API_NOW)

    vi.setSystemTime(PUBLIC_API_NOW.getTime() + MINUTE_MS)
    await call(bearer(token))
    expect(row.last_used_at).toEqual(new Date(PUBLIC_API_NOW.getTime() + MINUTE_MS))
  })
})

describe('plugins/publicApi — limites de débit', () => {
  it('answers 429 too_many_requests past the per-key limit, then accepts again a minute later', async () => {
    vi.stubEnv('PUBLIC_API_RATE_LIMIT_PER_MINUTE', '3')
    await start()
    const { token } = seedToken()
    const other = seedToken()

    for (let i = 0; i < 3; i += 1) expect((await call(bearer(token))).statusCode).toBe(200)

    const refused = await call(bearer(token))

    expect(refused.statusCode).toBe(429)
    expect(refused.json()).toEqual({ error: 'too_many_requests' })
    expect(refused.headers['retry-after']).toBe('60')
    expect(refused.headers['ratelimit-limit']).toBe('3')
    expect(refused.headers['ratelimit-remaining']).toBe('0')
    // Une autre clé a son propre compteur.
    expect((await call(bearer(other.token))).statusCode).toBe(200)

    vi.setSystemTime(PUBLIC_API_NOW.getTime() + MINUTE_MS)
    expect((await call(bearer(token))).statusCode).toBe(200)
  })

  it('counts only authentication failures per address, then lifts the block a minute later', async () => {
    vi.stubEnv('PUBLIC_API_AUTH_FAILURES_PER_MINUTE', '3')
    await start()
    const { token } = seedToken()

    // Des appels réussis ne consomment pas la limite d'échecs.
    for (let i = 0; i < 5; i += 1) expect((await call(bearer(token))).statusCode).toBe(200)

    for (let i = 0; i < 3; i += 1) expect((await call({})).statusCode).toBe(401)

    const blocked = await call(bearer(token))

    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toEqual({ error: 'too_many_requests' })
    expect(blocked.headers['retry-after']).toBe('60')
    // Une autre adresse n'est pas touchée.
    expect((await call(bearer(token), '/public/v1/ping', '203.0.113.99')).statusCode).toBe(200)

    vi.setSystemTime(PUBLIC_API_NOW.getTime() + MINUTE_MS)
    expect((await call(bearer(token))).statusCode).toBe(200)
  })

  it('lets 30 simultaneous valid calls from one address through, whatever the failure limit', async () => {
    await start()
    const { token } = seedToken()

    const responses = await Promise.all(Array.from({ length: 30 }, () => call(bearer(token))))

    expect(responses.map((response) => response.statusCode)).toEqual(Array(30).fill(200))
  })

  it('caps simultaneous failures: N get 401, the others 429, none slips through', async () => {
    vi.stubEnv('PUBLIC_API_AUTH_FAILURES_PER_MINUTE', '3')
    await start()
    const { token } = seedToken()
    dbState.api_keys.length = 0 // jeton bien formé mais inconnu : l'échec se joue après la lecture en base

    const responses = await Promise.all(Array.from({ length: 10 }, () => call(bearer(token))))
    const codes = responses.map((response) => response.statusCode)

    expect(codes.filter((code) => code === 401)).toHaveLength(3)
    expect(codes.filter((code) => code === 429)).toHaveLength(7)
  })

  it.each(['', 'abc', '0', '-5', '1.5'])(
    'falls back to the default limit for %j',
    async (value) => {
      vi.stubEnv('PUBLIC_API_RATE_LIMIT_PER_MINUTE', value)
      await start()
      const { token } = seedToken()

      expect((await call(bearer(token))).headers['ratelimit-limit']).toBe('120')
    }
  )
})

describe('plugins/publicApi — journal des appels', () => {
  it('writes one line per authenticated call, without the body, the query string or the address', async () => {
    await start()
    const { token, row } = seedToken()

    await app!.inject({
      method: 'POST',
      url: '/public/v1/echo?email=query-secret@example.test',
      headers: { ...bearer(token), 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'body-secret@example.test', displayName: 'Camille' }),
      remoteAddress: '198.51.100.23',
    })
    await settled(1)

    expect(dbState.api_request_logs).toHaveLength(1)

    const [log] = dbState.api_request_logs

    expect(log).toMatchObject({
      company_id: 1,
      api_key_id: row.id,
      method: 'POST',
      route: '/public/v1/echo',
      status_code: 200,
      error_code: null,
    })
    expect(log!.duration_ms).toBeGreaterThanOrEqual(0)

    const text = JSON.stringify(log)

    for (const secret of ['body-secret', 'query-secret', 'Camille', '198.51.100.23', token]) {
      expect(text).not.toContain(secret)
    }
  })

  it('keeps the error code of a refused call, including 403 company_inactive', async () => {
    await start()
    const { token } = seedToken()
    dbState.companies[1]!.status = COMPANY_STATUS_INACTIVE
    const inactive = seedToken(2)

    await call(bearer(token), '/public/v1/missing')
    await call(bearer(inactive.token))
    await settled(2)

    expect(
      dbState.api_request_logs.map((log) => [log.status_code, log.error_code, log.company_id])
    ).toEqual([
      [404, 'room_not_found', 1],
      [403, 'company_inactive', 2],
    ])
  })

  it('logs nothing for an unauthenticated call or for a call refused by the per-key limit', async () => {
    vi.stubEnv('PUBLIC_API_RATE_LIMIT_PER_MINUTE', '1')
    await start()
    const { token } = seedToken()

    await call({})
    await call(bearer('qzk_nope'))
    await call(bearer(token))
    await call(bearer(token))
    await settled(4)

    expect(dbState.api_request_logs).toHaveLength(1)
    expect(dbState.api_request_logs[0]!.status_code).toBe(200)
  })

  it('still answers when the log cannot be written', async () => {
    await start()
    const { token } = seedToken()
    dbState.api_request_logs = null as never // l'insertion lève

    const response = await call(bearer(token))

    expect(response.statusCode).toBe(200)
    await settled(1)
  })
})
