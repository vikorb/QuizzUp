import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { authHeaders, companyAdminUser, createRouteApp, parseJson, superadminUser } from '../_helpers/testApp'
import companiesRoutes from '@backend/routes/companies'
import { securityState } from '../_helpers/mockSecurity'
import { dbState } from '../_helpers/mockDb'

resetRouteMocksBeforeEach()

describe('routes/companies.ts', () => {
  it('requires authentication to list companies', async () => {
    const app = await createRouteApp(companiesRoutes)

    const response = await app.inject({ method: 'GET', url: '/companies' })

    expect(response.statusCode).toBe(401)

    await app.close()
  })

  it('limits company listing to the current company for non-superadmins', async () => {
    const app = await createRouteApp(companiesRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies',
      headers: authHeaders(companyAdminUser),
    })

    const body = parseJson<{ companies: Array<{ id: number }> }>(response)

    expect(response.statusCode).toBe(200)
    expect(body.companies.map((company) => company.id)).toEqual([1])

    await app.close()
  })

  it('allows superadmins to list every company', async () => {
    const app = await createRouteApp(companiesRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies',
      headers: authHeaders(superadminUser),
    })

    const body = parseJson<{ companies: Array<{ id: number; accountsCount: number }> }>(response)

    expect(response.statusCode).toBe(200)
    expect(body.companies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, accountsCount: 2 }),
        expect.objectContaining({ id: 2, accountsCount: 1 }),
      ]),
    )

    await app.close()
  })

  it('rejects company creation without API permission', async () => {
    securityState.hasPermission = false
    const app = await createRouteApp(companiesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: authHeaders(superadminUser),
      payload: {
        name: 'New Company',
        email: 'new@company.test',
      },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('validates company creation payloads', async () => {
    const app = await createRouteApp(companiesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: authHeaders(superadminUser),
      payload: {
        name: 'A',
        email: 'not-an-email',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })

    await app.close()
  })

  it('rejects duplicate company emails case-insensitively', async () => {
    const app = await createRouteApp(companiesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: authHeaders(superadminUser),
      payload: {
        name: 'Another Company',
        email: 'CONTACT@QUIZZUP.TEST',
      },
    })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'email_already_exists' })

    await app.close()
  })

  it('rejects duplicate company names case-insensitively', async () => {
    const app = await createRouteApp(companiesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: authHeaders(superadminUser),
      payload: {
        name: 'QUIZZUP',
        email: 'other@company.test',
      },
    })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'name_already_exists' })

    await app.close()
  })

  it('creates companies with an active status and normalized email', async () => {
    const app = await createRouteApp(companiesRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: authHeaders(superadminUser),
      payload: {
        name: ' New Client ',
        email: '  NEW@CLIENT.TEST  ',
      },
    })

    const body = parseJson<{ company: Record<string, unknown> }>(response)

    expect(response.statusCode).toBe(201)
    expect(body.company).toMatchObject({
      id: 3,
      name: 'New Client',
      email: 'new@client.test',
      status: COMPANY_STATUS_ACTIVE,
      accountsCount: 0,
    })
    expect(dbState.companies).toContainEqual(expect.objectContaining({ email: 'new@client.test' }))

    await app.close()
  })
})
