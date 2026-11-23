import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../../backend/src/app'

const BACKOFFICE_ORIGIN = 'https://bo.quizzup.test'
const VITRINE_ORIGIN = 'https://vitrine.quizzup.test'

async function startApp() {
  const app = buildApp()
  await app.ready()

  return app
}

describe('app.ts — TRUST_PROXY', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses to start when TRUST_PROXY would trust everyone', () => {
    for (const value of ['true', '*', '0.0.0.0/0', '::/0']) {
      vi.stubEnv('TRUST_PROXY', value)

      expect(() => buildApp()).toThrow(/TRUST_PROXY invalide/)
    }
  })

  it('starts with a list of proxy ranges, or without the variable', async () => {
    vi.stubEnv('TRUST_PROXY', '172.18.0.0/16,10.0.0.5')
    await (await startApp()).close()

    vi.stubEnv('TRUST_PROXY', '')
    await (await startApp()).close()
  })
})

describe('app.ts — /public/v1 et CORS', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('serves the public format under the prefix and keeps the rest of the API as before', async () => {
    const app = await startApp()

    const missing = await app.inject({ method: 'GET', url: '/public/v1/anything' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'not_found' })
    expect(missing.headers['cache-control']).toBe('no-store')

    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.statusCode).toBe(200)
    expect(health.headers['cache-control']).toBeUndefined()

    await app.close()
  })

  it('opens /public/v1 to the VITRINE_ORIGINS only, without credentials', async () => {
    vi.stubEnv('CORS_ORIGIN', BACKOFFICE_ORIGIN)
    vi.stubEnv('VITRINE_ORIGINS', ` ${VITRINE_ORIGIN} `)
    const app = await startApp()

    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/public/v1/anything',
        headers: { origin, 'access-control-request-method': 'POST' },
      })

    const vitrine = await preflight(VITRINE_ORIGIN)
    expect(vitrine.statusCode).toBe(204)
    expect(vitrine.headers['access-control-allow-origin']).toBe(VITRINE_ORIGIN)
    expect(vitrine.headers['access-control-allow-credentials']).toBeUndefined()
    expect(vitrine.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS')

    // L'origine du backoffice n'a aucun droit sur l'API publique.
    const backoffice = await preflight(BACKOFFICE_ORIGIN)
    expect(backoffice.headers['access-control-allow-origin']).toBeUndefined()

    // Une réponse réelle (ici un 404) porte l'en-tête, et laisse lire Retry-After.
    const real = await app.inject({
      method: 'GET',
      url: '/public/v1/anything',
      headers: { origin: VITRINE_ORIGIN },
    })
    expect(real.headers['access-control-allow-origin']).toBe(VITRINE_ORIGIN)
    expect(real.headers['access-control-expose-headers']).toBe('Retry-After')

    await app.close()
  })

  it('judges the CORS regime on the decoded path, like the router does', async () => {
    vi.stubEnv('CORS_ORIGIN', BACKOFFICE_ORIGIN)
    vi.stubEnv('VITRINE_ORIGINS', VITRINE_ORIGIN)
    const app = await startApp()

    for (const url of ['/public/v%31/x', '/%70ublic/v1/x']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { origin: BACKOFFICE_ORIGIN },
      })

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
      expect(response.headers['access-control-allow-credentials']).toBeUndefined()
    }

    const vitrine = await app.inject({
      method: 'GET',
      url: '/public/v%31/x',
      headers: { origin: VITRINE_ORIGIN },
    })
    expect(vitrine.statusCode).toBe(404)
    expect(vitrine.json()).toEqual({ error: 'not_found' })
    expect(vitrine.headers['access-control-allow-origin']).toBe(VITRINE_ORIGIN)

    await app.close()
  })

  it('answers every 404 under /public/v1 in the public format with no-store, OPTIONS included', async () => {
    vi.stubEnv('VITRINE_ORIGINS', '')
    const app = await startApp()

    for (const [method, url] of [
      ['OPTIONS', '/public/v1/x'],
      ['OPTIONS', '/public/v1'],
      ['GET', '/public/v1/x'],
      ['OPTIONS', '/public/v%31/x'],
    ] as const) {
      const response = await app.inject({ method, url })

      expect(response.statusCode, `${method} ${url}`).toBe(404)
      expect(response.json(), `${method} ${url}`).toEqual({ error: 'not_found' })
      expect(response.headers['cache-control'], `${method} ${url}`).toBe('no-store')
    }

    await app.close()
  })

  it('keeps the default Fastify 404 outside /public/v1', async () => {
    const app = await startApp()

    const response = await app.inject({ method: 'GET', url: '/nope' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      message: 'Route GET:/nope not found',
      error: 'Not Found',
      statusCode: 404,
    })
    expect(response.headers['cache-control']).toBeUndefined()

    await app.close()
  })

  it('opens /public/v1 to nobody when VITRINE_ORIGINS is empty', async () => {
    vi.stubEnv('CORS_ORIGIN', BACKOFFICE_ORIGIN)
    vi.stubEnv('VITRINE_ORIGINS', '')
    const app = await startApp()

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/public/v1/anything',
      headers: { origin: VITRINE_ORIGIN, 'access-control-request-method': 'POST' },
    })

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.headers['access-control-allow-methods']).toBeUndefined()

    await app.close()
  })

  it('keeps CORS_ORIGIN and credentials unchanged outside the public prefix', async () => {
    vi.stubEnv('CORS_ORIGIN', BACKOFFICE_ORIGIN)
    vi.stubEnv('VITRINE_ORIGINS', VITRINE_ORIGIN)
    const app = await startApp()

    const backoffice = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: BACKOFFICE_ORIGIN },
    })
    expect(backoffice.headers['access-control-allow-origin']).toBe(BACKOFFICE_ORIGIN)
    expect(backoffice.headers['access-control-allow-credentials']).toBe('true')

    // Le site de la vitrine n'est pas autorisé sur le reste de l'API.
    const vitrine = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: VITRINE_ORIGIN },
    })
    expect(vitrine.headers['access-control-allow-origin']).toBeUndefined()

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/login',
      headers: {
        origin: BACKOFFICE_ORIGIN,
        'access-control-request-method': 'POST',
      },
    })
    expect(preflight.statusCode).toBe(204)
    expect(preflight.headers['access-control-allow-methods']).toBe(
      'GET, POST, PATCH, PUT, DELETE, OPTIONS'
    )
    expect(preflight.headers['access-control-allow-headers']).toBe('Content-Type, Authorization')

    await app.close()
  })
})
