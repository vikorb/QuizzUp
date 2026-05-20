import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { securityState } from '../_helpers/mockSecurity'
import { authHeaders, companyAdminUser, createRouteApp, parseJson, superadminUser } from '../_helpers/testApp'
import companiesIdStatusRoutes from '@backend/routes/companies/idStatus'
import { dbState, MOCK_NOW } from '../_helpers/mockDb'

resetRouteMocksBeforeEach()

describe('routes/companies/idStatus.ts', () => {
  it('requires the company status security context', async () => {
    securityState.context.canUpdateCompanyStatus = false
    const app = await createRouteApp(companiesIdStatusRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/status',
      headers: authHeaders(companyAdminUser),
      payload: {
        status: COMPANY_STATUS_INACTIVE,
      },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('rejects invalid company statuses', async () => {
    const app = await createRouteApp(companiesIdStatusRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: 999,
      },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })

    await app.close()
  })

  it('returns 404 when the target company does not exist', async () => {
    const app = await createRouteApp(companiesIdStatusRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/999/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: COMPANY_STATUS_ACTIVE,
      },
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'not_found' })

    await app.close()
  })

  it('updates the company status and maintains deleted_at consistently', async () => {
    const app = await createRouteApp(companiesIdStatusRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/status',
      headers: authHeaders(superadminUser),
      payload: {
        status: COMPANY_STATUS_DELETED,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toMatchObject({
      company: {
        id: 1,
        status: COMPANY_STATUS_DELETED,
        deletedAt: MOCK_NOW,
      },
    })
    expect(dbState.companies[0].deleted_at).toBe(MOCK_NOW)

    await app.close()
  })
})
