import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import healthRoute from '../../../../backend/src/routes/health'

import {
  createRouteApp,
  parseJson,
} from './_helpers/testApp'

import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'

resetRouteMocksBeforeEach()

describe('routes/health.ts', () => {
  it('returns a simple public healthcheck without authentication', async () => {
    const app = await createRouteApp(healthRoute)

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toEqual({ status: 'ok' })

    await app.close()
  })
})
