import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import routes from '../../../../backend/src/routes'

import {
  authHeaders,
  createRouteApp,
  parseJson,
  superadminUser,
} from './_helpers/testApp'

import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'

resetRouteMocksBeforeEach()

describe('routes/index.ts', () => {
  it('registers public and authenticated routes together', async () => {
    const app = await createRouteApp(routes)

    const health = await app.inject({ method: 'GET', url: '/health' })
    const companies = await app.inject({
      method: 'GET',
      url: '/companies',
      headers: authHeaders(superadminUser),
    })

    expect(health.statusCode).toBe(200)
    expect(parseJson(health)).toEqual({ status: 'ok' })
    expect(companies.statusCode).toBe(200)
    expect(parseJson<{ companies: unknown[] }>(companies).companies).toHaveLength(2)

    await app.close()
  })
})
