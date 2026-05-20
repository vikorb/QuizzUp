import '../../_helpers/registerRouteMocks'
import { describe, expect, it } from 'vitest'

import {
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
} from '@quizzup/shared'
import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import { authHeaders, createRouteApp, parseJson, superadminUser } from '../../_helpers/testApp'
import companyAdminIdStatusRoutes from '@backend/routes/companies/admins/idStatus'
import { securityState } from '../../_helpers/mockSecurity'
import { dbState, MOCK_NOW } from '../../_helpers/mockDb'

resetRouteMocksBeforeEach()

describe('routes/companies/admins/idStatus.ts', () => {
  it('rejects invalid account status payloads', async () => {
    const app = await createRouteApp(companyAdminIdStatusRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: 999,
      },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })

    await app.close()
  })

  it('returns 404 when the company does not exist', async () => {
    const app = await createRouteApp(companyAdminIdStatusRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/999/admins/2/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: ADMIN_STATUS_INACTIVE,
      },
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'not_found' })

    await app.close()
  })

  it('returns 404 when the account does not exist in the company', async () => {
    const app = await createRouteApp(companyAdminIdStatusRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/999/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: ADMIN_STATUS_INACTIVE,
      },
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'not_found' })

    await app.close()
  })

  it('forbids status updates rejected by the contextual policy', async () => {
    securityState.context.canUpdateCompanyAccountStatus = false
    const app = await createRouteApp(companyAdminIdStatusRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: ADMIN_STATUS_INACTIVE,
      },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('updates account status and keeps deleted_at consistent', async () => {
    const app = await createRouteApp(companyAdminIdStatusRoutes)

    const deleted = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: ADMIN_STATUS_DELETED,
      },
    })

    const reactivated = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: ADMIN_STATUS_ACTIVE,
      },
    })

    expect(deleted.statusCode).toBe(200)
    expect(parseJson(deleted)).toMatchObject({
      account: {
        id: 2,
        status: ADMIN_STATUS_DELETED,
        deletedAt: MOCK_NOW,
      },
    })
    expect(reactivated.statusCode).toBe(200)
    expect(parseJson(reactivated)).toMatchObject({
      account: {
        id: 2,
        status: ADMIN_STATUS_ACTIVE,
        deletedAt: null,
      },
    })
    expect(dbState.admins.find((admin) => admin.id === 2)).toMatchObject({
      status: ADMIN_STATUS_ACTIVE,
      deleted_at: null,
    })

    await app.close()
  })
})
