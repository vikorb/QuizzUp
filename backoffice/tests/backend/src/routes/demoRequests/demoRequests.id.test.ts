import '../_helpers/registerDbMock'

import { describe, expect, it } from 'vitest'

import demoRequestsRoutes from '@backend/routes/demoRequests'
import { dbState, MOCK_NOW, resetDb } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'
import { demoRequestRow } from './_fixtures'

resetRouteMocksBeforeEach()

type App = Awaited<ReturnType<typeof createRouteApp>>

const patch = (app: App, url: string, body: unknown, user: TestUser = superadminUser) =>
  app.inject({ method: 'PATCH', url, headers: authHeaders(user), payload: body as object })

const remove = (app: App, url: string, user: TestUser = superadminUser) =>
  app.inject({ method: 'DELETE', url, headers: authHeaders(user) })

// Vraies permissions (requireApiPermission n'est pas simulé) : seul le superadmin est admis.
describe('routes/demoRequests/id.ts — PATCH /demo-requests/:id', () => {
  it('marks a request processed by the calling account, then reopens it', async () => {
    resetDb({ demo_requests: [demoRequestRow({ id: 1 }), demoRequestRow({ id: 2 })] })
    const app = await createRouteApp(demoRequestsRoutes)

    const processed = await patch(app, '/demo-requests/1', { processed: true })

    expect(processed.statusCode).toBe(200)
    expect(processed.json().demoRequest).toMatchObject({
      id: 1,
      name: 'Camille Martin',
      processedAt: MOCK_NOW,
      processedBy: superadminUser.adminId,
    })
    expect(dbState.demo_requests[0]).toMatchObject({
      processed_at: MOCK_NOW,
      processed_by: superadminUser.adminId,
    })
    expect(dbState.demo_requests[1]).toMatchObject({ processed_at: null, processed_by: null })

    const reopened = await patch(app, '/demo-requests/1', { processed: false })

    expect(reopened.statusCode).toBe(200)
    expect(reopened.json().demoRequest).toMatchObject({ processedAt: null, processedBy: null })
    expect(dbState.demo_requests[0]).toMatchObject({ processed_at: null, processed_by: null })

    await app.close()
  })

  it('answers 404 not_found for an unknown id', async () => {
    resetDb({ demo_requests: [demoRequestRow()] })
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await patch(app, '/demo-requests/999', { processed: true })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
    expect(dbState.demo_requests[0]).toMatchObject({ processed_at: null })

    await app.close()
  })

  it('answers 400 invalid_params for a bad id', async () => {
    const app = await createRouteApp(demoRequestsRoutes)

    for (const id of ['abc', '0', '-1']) {
      const response = await patch(app, `/demo-requests/${id}`, { processed: true })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'invalid_params' })
    }

    await app.close()
  })

  it.each([[{}], [{ processed: 'yes' }], [{ processed: 1 }], [{ other: true }]])(
    'answers 400 invalid_body for %j',
    async (body) => {
      resetDb({ demo_requests: [demoRequestRow()] })
      const app = await createRouteApp(demoRequestsRoutes)

      const response = await patch(app, '/demo-requests/1', body)

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('invalid_body')
      expect(dbState.demo_requests[0]).toMatchObject({ processed_at: null })

      await app.close()
    }
  )

  it.each([
    ['admin', companyAdminUser],
    ['user', companyUser],
  ])('answers 403 to the %s role and changes nothing', async (_role, user) => {
    resetDb({ demo_requests: [demoRequestRow()] })
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await patch(app, '/demo-requests/1', { processed: true }, user)

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
    expect(dbState.demo_requests[0]).toMatchObject({ processed_at: null })

    await app.close()
  })

  it('answers 401 without a session', async () => {
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/demo-requests/1',
      payload: { processed: true },
    })

    expect(response.statusCode).toBe(401)

    await app.close()
  })
})

describe('routes/demoRequests/id.ts — DELETE /demo-requests/:id', () => {
  it('deletes the row for good and keeps the others', async () => {
    resetDb({ demo_requests: [demoRequestRow({ id: 1 }), demoRequestRow({ id: 2 })] })
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await remove(app, '/demo-requests/1')

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(dbState.demo_requests.map((row) => row.id)).toEqual([2])

    await app.close()
  })

  it('answers 404 not_found for an unknown id', async () => {
    resetDb({ demo_requests: [demoRequestRow()] })
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await remove(app, '/demo-requests/999')

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
    expect(dbState.demo_requests).toHaveLength(1)

    await app.close()
  })

  it('answers 400 invalid_params for a bad id', async () => {
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await remove(app, '/demo-requests/abc')

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'invalid_params' })

    await app.close()
  })

  it.each([
    ['admin', companyAdminUser],
    ['user', companyUser],
  ])('answers 403 to the %s role and keeps the row', async (_role, user) => {
    resetDb({ demo_requests: [demoRequestRow()] })
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await remove(app, '/demo-requests/1', user)

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
    expect(dbState.demo_requests).toHaveLength(1)

    await app.close()
  })

  it('answers 401 without a session', async () => {
    const app = await createRouteApp(demoRequestsRoutes)

    const response = await app.inject({ method: 'DELETE', url: '/demo-requests/1' })

    expect(response.statusCode).toBe(401)

    await app.close()
  })
})
