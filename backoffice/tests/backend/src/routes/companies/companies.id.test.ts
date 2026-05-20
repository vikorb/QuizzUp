import '../_helpers/registerRouteMocks'
import { resetRouteMocksBeforeEach } from "../_helpers/resetRouteMocks"
import { authHeaders, companyAdminUser, createRouteApp, parseJson, superadminUser } from "../_helpers/testApp"
import { securityState } from "../_helpers/mockSecurity"
import { dbState, MOCK_NOW } from "../_helpers/mockDb"
import { COMPANY_STATUS_DELETED, COMPANY_STATUS_INACTIVE } from "@quizzup/shared"
import companiesIdRoutes from "@backend/routes/companies/id"

resetRouteMocksBeforeEach()

describe('routes/companies/id.ts', () => {
  it('rejects invalid company ids', async () => {
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/abc',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'invalid_params' })

    await app.close()
  })

  it('forbids access outside of the current company context', async () => {
    securityState.context.canAccessCompany = false
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/2',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('returns 404 for unknown companies', async () => {
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/999',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'not_found' })

    await app.close()
  })

  it('returns one company with its active accounts count', async () => {
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/1',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toMatchObject({
      company: {
        id: 1,
        name: 'QuizzUp',
        accountsCount: 2,
      },
    })

    await app.close()
  })

  it('rejects empty update payloads', async () => {
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1',
      headers: authHeaders(superadminUser),
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })

    await app.close()
  })

  it('prevents non-superadmins from changing a company status', async () => {
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1',
      headers: authHeaders(companyAdminUser),
      payload: {
        status: COMPANY_STATUS_INACTIVE,
      },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('rejects duplicate company email during update', async () => {
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1',
      headers: authHeaders(superadminUser),
      payload: {
        email: 'CLIENT2@QUIZZUP.TEST',
      },
    })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'email_already_exists' })

    await app.close()
  })

  it('allows superadmins to soft-delete a company through status update', async () => {
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1',
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
    expect(dbState.companies[0]).toMatchObject({
      status: COMPANY_STATUS_DELETED,
      deleted_at: MOCK_NOW,
    })

    await app.close()
  })
})
