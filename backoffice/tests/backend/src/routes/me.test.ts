import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ADMIN,
  ADMIN_STATUS_ACTIVE,
} from '@quizzup/shared'

import meRoutes from '../../../../backend/src/routes/me'

import { dbState } from './_helpers/mockDb'

import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  expectPublicAdmin,
  parseJson,
} from './_helpers/testApp'

import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'

resetRouteMocksBeforeEach()

describe('routes/me.ts', () => {
  it('requires authentication', async () => {
    const app = await createRouteApp(meRoutes)

    const response = await app.inject({ method: 'GET', url: '/me' })

    expect(response.statusCode).toBe(401)
    expect(parseJson(response)).toEqual({ error: 'unauthorized' })

    await app.close()
  })

  it('returns the authenticated admin profile without sensitive fields', async () => {
    const app = await createRouteApp(meRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: authHeaders(companyAdminUser),
    })

    const body = parseJson<{ admin: Record<string, unknown> }>(response)

    expect(response.statusCode).toBe(200)
    expect(body.admin).toMatchObject({
      id: 2,
      companyId: 1,
      role: ADMIN_ROLE_ADMIN,
      username: 'alice',
      email: 'alice@quizzup.test',
      status: ADMIN_STATUS_ACTIVE,
    })
    expectPublicAdmin(body.admin)

    await app.close()
  })

  it('returns 404 when the authenticated admin no longer exists', async () => {
    dbState.admins = dbState.admins.filter((admin) => admin.id !== 2)

    const app = await createRouteApp(meRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'not_found' })

    await app.close()
  })
})
