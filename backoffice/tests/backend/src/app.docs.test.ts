import './routes/_helpers/registerDbMock'

import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../../backend/src/app'

// Garde-fou des mises à jour de @fastify/swagger-ui / @fastify/static : la documentation
// interactive doit rester servie (page, spécification JSON, fichiers statiques).
describe('app.ts (buildApp, documentation /docs)', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'test-jwt-secret')
    vi.stubEnv('OPENAPI_PATH', path.resolve(process.cwd(), 'docs/api/openapi.yaml'))

    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  it('serves the Swagger UI page on GET /docs/', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
  })

  it('serves the OpenAPI specification on GET /docs/json', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toHaveProperty('paths')
  })

  it('serves the static swagger-ui assets', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/static/swagger-ui.css' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/css')
  })
})
