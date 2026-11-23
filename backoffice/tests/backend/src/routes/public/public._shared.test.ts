import fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyPublicDefaults,
  PUBLIC_API_PREFIX,
  PUBLIC_RATE_LIMIT_MAX,
  sendPublicError,
} from '../../../../../backend/src/routes/public/_shared'

// Le préfixe n'a aucune route livrée : les conventions se prouvent avec des routes de test,
// enregistrées dans un plugin qui reçoit les mêmes défauts que `routes/public/index.ts`.
async function createPublicApp(logs?: string[]) {
  const app = fastify({
    logger: logs ? { level: 'warn', stream: { write: (line: string) => logs.push(line) } } : false,
  })

  await app.register(
    async (scope) => {
      // Le projet de tests ne charge pas les augmentations de types (jwt, authenticate) du backend.
      applyPublicDefaults(scope as never)

      scope.get('/ping', async () => ({ ok: true }))
      scope.post('/echo', async (req) => ({ received: req.body }))
      scope.post('/tiny', { bodyLimit: 16 }, async () => ({ ok: true }))
      scope.get('/boom', async () => {
        throw new Error('secret internal detail')
      })
      scope.get('/conflict', async () => {
        throw Object.assign(new Error('internal detail'), { statusCode: 409 })
      })
      scope.get('/invalid', async (_req, reply) =>
        sendPublicError(reply as never, 400, 'invalid_body', {
          fieldErrors: { name: ['required'] },
        })
      )
    },
    { prefix: PUBLIC_API_PREFIX }
  )
  await app.ready()

  return app
}

const ping = (app: Awaited<ReturnType<typeof createPublicApp>>, remoteAddress = '203.0.113.1') =>
  app.inject({ method: 'GET', url: `${PUBLIC_API_PREFIX}/ping`, remoteAddress })

describe('routes/public/_shared — conventions de /public/v1', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('needs no authentication and never lets a response be cached', async () => {
    const app = await createPublicApp()

    const response = await ping(app)

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')

    await app.close()
  })

  it('answers 404 not_found in the public format under the prefix', async () => {
    const app = await createPublicApp()

    const response = await app.inject({ method: 'GET', url: `${PUBLIC_API_PREFIX}/unknown` })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })

    await app.close()
  })

  it('answers 400 invalid_json for a broken or empty JSON body', async () => {
    const app = await createPublicApp()
    const post = (payload: string) =>
      app.inject({
        method: 'POST',
        url: `${PUBLIC_API_PREFIX}/echo`,
        headers: { 'content-type': 'application/json' },
        payload,
      })

    for (const payload of ['{not json', '']) {
      const response = await post(payload)

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'invalid_json' })
    }

    await app.close()
  })

  it('answers 415 unsupported_media_type for a body that is not JSON', async () => {
    const app = await createPublicApp()

    const response = await app.inject({
      method: 'POST',
      url: `${PUBLIC_API_PREFIX}/echo`,
      headers: { 'content-type': 'application/xml' },
      payload: '<a/>',
    })

    expect(response.statusCode).toBe(415)
    expect(response.json()).toEqual({ error: 'unsupported_media_type' })

    await app.close()
  })

  it('answers 413 payload_too_large above the route body limit', async () => {
    const app = await createPublicApp()

    const response = await app.inject({
      method: 'POST',
      url: `${PUBLIC_API_PREFIX}/tiny`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ padding: 'x'.repeat(100) }),
    })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({ error: 'payload_too_large' })

    await app.close()
  })

  it('keeps the status of another Fastify 4xx error as bad_request, logged as a warning', async () => {
    const logs: string[] = []
    const app = await createPublicApp(logs)

    const response = await app.inject({ method: 'GET', url: `${PUBLIC_API_PREFIX}/conflict` })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'bad_request' })
    expect(response.body).not.toContain('internal detail')
    expect(logs).toHaveLength(1)
    expect(JSON.parse(logs[0])).toMatchObject({ level: 40, msg: 'public API bad request' })

    await app.close()
  })

  it('answers 400 bad_request, not invalid_json, when Content-Length does not match the body', async () => {
    const app = await createPublicApp()

    const response = await app.inject({
      method: 'POST',
      url: `${PUBLIC_API_PREFIX}/echo`,
      headers: { 'content-type': 'application/json', 'content-length': '5' },
      payload: '{"a":1}',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'bad_request' })

    await app.close()
  })

  it('answers 500 server_error without leaking the message or the stack', async () => {
    const app = await createPublicApp()

    const response = await app.inject({ method: 'GET', url: `${PUBLIC_API_PREFIX}/boom` })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'server_error' })
    expect(response.body).not.toContain('secret internal detail')

    await app.close()
  })

  it('sends details only when the route provides them', async () => {
    const app = await createPublicApp()

    const response = await app.inject({ method: 'GET', url: `${PUBLIC_API_PREFIX}/invalid` })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'invalid_body',
      details: { fieldErrors: { name: ['required'] } },
    })

    await app.close()
  })
})

describe('routes/public/_shared — limite de débit par défaut', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers 429 too_many_requests with Retry-After after the default threshold', async () => {
    const app = await createPublicApp()

    for (let i = 0; i < PUBLIC_RATE_LIMIT_MAX; i += 1) {
      expect((await ping(app)).statusCode).toBe(200)
    }

    const blocked = await ping(app)

    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toEqual({ error: 'too_many_requests' })
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    expect(blocked.headers['cache-control']).toBe('no-store')

    await app.close()
  })

  it('also limits unknown paths, so probing the prefix is not free', async () => {
    const app = await createPublicApp()

    for (let i = 0; i < PUBLIC_RATE_LIMIT_MAX; i += 1) {
      await app.inject({
        method: 'GET',
        url: `${PUBLIC_API_PREFIX}/nope-${i}`,
        remoteAddress: '203.0.113.1',
      })
    }

    expect((await ping(app)).statusCode).toBe(429)

    await app.close()
  })

  it('counts each address on its own and starts over after the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'))
    const app = await createPublicApp()

    for (let i = 0; i < PUBLIC_RATE_LIMIT_MAX; i += 1) await ping(app, '203.0.113.1')

    expect((await ping(app, '203.0.113.1')).statusCode).toBe(429)
    expect((await ping(app, '203.0.113.2')).statusCode).toBe(200)

    vi.setSystemTime(new Date('2026-11-23T10:01:00Z'))
    expect((await ping(app, '203.0.113.1')).statusCode).toBe(200)

    await app.close()
  })
})
