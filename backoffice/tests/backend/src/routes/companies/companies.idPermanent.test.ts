import '../_helpers/registerRouteMocks'
import { describe, expect, it } from 'vitest'

import { COMPANY_STATUS_DELETED } from '@quizzup/shared'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { securityState } from '../_helpers/mockSecurity'
import { authHeaders, createRouteApp, parseJson, superadminUser } from '../_helpers/testApp'
import companiesIdPermanentRoutes from '@backend/routes/companies/idPermanent'
import { dbState, MOCK_NOW } from '../_helpers/mockDb'

resetRouteMocksBeforeEach()

describe('routes/companies/idPermanent.ts', () => {
  it('rejects logical deletion without API permission', async () => {
    securityState.hasPermission = false
    const app = await createRouteApp(companiesIdPermanentRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/companies/1/permanent',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('rejects invalid company ids', async () => {
    const app = await createRouteApp(companiesIdPermanentRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/companies/abc/permanent',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'invalid_params' })

    await app.close()
  })

  it('returns 404 for unknown companies', async () => {
    const app = await createRouteApp(companiesIdPermanentRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/companies/999/permanent',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'not_found' })

    await app.close()
  })

  it('is idempotent when the company is already deleted', async () => {
    dbState.companies[0].status = COMPANY_STATUS_DELETED
    dbState.companies[0].deleted_at = MOCK_NOW

    const app = await createRouteApp(companiesIdPermanentRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/companies/1/permanent',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toEqual({
      success: true,
      deleted: {
        companyId: 1,
        adminsCount: 0,
        companiesCount: 0,
      },
    })

    await app.close()
  })

  it('soft-deletes an active company instead of physically removing it', async () => {
    const app = await createRouteApp(companiesIdPermanentRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/companies/1/permanent',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toEqual({
      success: true,
      deleted: {
        companyId: 1,
        adminsCount: 0,
        companiesCount: 1,
      },
    })
    expect(dbState.companies[0]).toMatchObject({
      status: COMPANY_STATUS_DELETED,
      deleted_at: MOCK_NOW,
    })

    await app.close()
  })

  it('revokes the active sessions of the company admins on deletion (S2)', async () => {
    // Admins 1 and 2 belong to company 1, admin 3 belongs to company 2.
    dbState.admin_sessions.push(
      {
        id: 'sid-company1-a',
        admin_id: 1,
        created_at: MOCK_NOW,
        last_seen_at: MOCK_NOW,
        revoked_at: null,
      },
      {
        id: 'sid-company1-b',
        admin_id: 2,
        created_at: MOCK_NOW,
        last_seen_at: MOCK_NOW,
        revoked_at: null,
      },
      {
        id: 'sid-company2',
        admin_id: 3,
        created_at: MOCK_NOW,
        last_seen_at: MOCK_NOW,
        revoked_at: null,
      }
    )

    const app = await createRouteApp(companiesIdPermanentRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/companies/1/permanent',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(200)
    expect(
      dbState.admin_sessions.find((session) => session.id === 'sid-company1-a')?.revoked_at
    ).toBe(MOCK_NOW)
    expect(
      dbState.admin_sessions.find((session) => session.id === 'sid-company1-b')?.revoked_at
    ).toBe(MOCK_NOW)
    // Sessions from other companies remain valid.
    expect(
      dbState.admin_sessions.find((session) => session.id === 'sid-company2')?.revoked_at
    ).toBeNull()

    await app.close()
  })
})
