import '../_helpers/registerDbMock'

import { describe, expect, it } from 'vitest'

import demoRequestsRoutes from '@backend/routes/demoRequests'
import { resetDb } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  superadminUser,
} from '../_helpers/testApp'
import { demoRequestRow } from './_fixtures'

resetRouteMocksBeforeEach()

// Vraies permissions (requireApiPermission n'est pas simulé) : seul le superadmin est admis.
describe('routes/demoRequests/index.ts — GET /demo-requests', () => {
  it('lists the requests newest first with the pending count', async () => {
    resetDb({
      demo_requests: [
        demoRequestRow({ id: 1, created_at: '2026-11-01T10:00:00.000Z' }),
        demoRequestRow({
          id: 2,
          created_at: '2026-11-03T10:00:00.000Z',
          processed_at: '2026-11-04T08:00:00.000Z',
          processed_by: 1,
        }),
        demoRequestRow({ id: 3, created_at: '2026-11-02T10:00:00.000Z' }),
      ],
    })
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/demo-requests',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().demoRequests.map((row: { id: number }) => row.id)).toEqual([2, 3, 1])
    expect(response.json().pendingCount).toBe(2)
    expect(response.json().demoRequests[2]).toEqual({
      id: 1,
      name: 'Camille Martin',
      centerName: 'Escape Test',
      email: 'camille@example.com',
      phone: '+33 1 23 45 67 89',
      roomsCount: 3,
      message: 'Bonjour',
      locale: 'fr',
      consentAt: '2026-11-01T10:00:00.000Z',
      processedAt: null,
      processedBy: null,
      createdAt: '2026-11-01T10:00:00.000Z',
    })

    await app.close()
  })

  it('answers an empty list with a zero pending count', async () => {
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/demo-requests',
      headers: authHeaders(superadminUser),
    })

    expect(response.json()).toEqual({ demoRequests: [], pendingCount: 0 })

    await app.close()
  })

  it('counts nothing as pending when every request is processed', async () => {
    resetDb({ demo_requests: [demoRequestRow({ processed_at: '2026-11-02T10:00:00.000Z' })] })
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/demo-requests',
      headers: authHeaders(superadminUser),
    })

    expect(response.json().demoRequests).toHaveLength(1)
    expect(response.json().pendingCount).toBe(0)

    await app.close()
  })

  it.each([
    ['admin', companyAdminUser],
    ['user', companyUser],
  ])('answers 403 to the %s role', async (_role, user) => {
    resetDb({ demo_requests: [demoRequestRow()] })
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/demo-requests',
      headers: authHeaders(user),
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('answers 401 without a session', async () => {
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await app.inject({ method: 'GET', url: '/demo-requests' })

    expect(response.statusCode).toBe(401)

    await app.close()
  })
})
