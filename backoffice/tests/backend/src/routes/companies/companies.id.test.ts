import '../_helpers/registerRouteMocks'

import companiesIdRoutes from '@backend/routes/companies/id'
import { COMPANY_STATUS_DELETED, COMPANY_STATUS_INACTIVE } from '@quizzup/shared'

import { dbState, MOCK_NOW } from '../_helpers/mockDb'
import { securityState } from '../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
} from '../_helpers/testApp'

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

  it('exposes the logo as a public url, never as a storage key', async () => {
    Object.assign(dbState.companies[0] ?? {}, {
      logo_key: 'logos/11111111-1111-4111-8111-111111111111.webp',
    })
    const app = await createRouteApp(companiesIdRoutes)

    const read = await app.inject({
      method: 'GET',
      url: '/companies/1',
      headers: authHeaders(superadminUser),
    })
    const patched = await app.inject({
      method: 'PATCH',
      url: '/companies/1',
      headers: authHeaders(superadminUser),
      payload: { name: 'QuizzUp bis' },
    })
    const withoutLogo = await app.inject({
      method: 'GET',
      url: '/companies/2',
      headers: authHeaders(superadminUser),
    })

    for (const response of [read, patched]) {
      expect(parseJson<{ company: Record<string, unknown> }>(response).company).toMatchObject({
        logoUrl: '/public/v1/logos/11111111-1111-4111-8111-111111111111.webp',
      })
      expect(response.body).not.toContain('logoKey')
      expect(response.body).not.toContain('logo_key')
    }

    expect(parseJson<{ company: Record<string, unknown> }>(withoutLogo).company.logoUrl).toBeNull()

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

  it('sets, changes and clears the voucher settings of a company', async () => {
    const app = await createRouteApp(companiesIdRoutes)
    const patch = (payload: Record<string, unknown>, user = companyAdminUser) =>
      app.inject({ method: 'PATCH', url: '/companies/1', headers: authHeaders(user), payload })

    const enabled = await patch({ voucherLabel: ' Une partie offerte ', voucherValidityDays: 45 })

    expect(enabled.statusCode).toBe(200)
    expect(parseJson(enabled)).toMatchObject({
      company: { voucherLabel: 'Une partie offerte', voucherValidityDays: 45 },
    })
    expect(dbState.companies[0]).toMatchObject({
      voucher_label: 'Une partie offerte',
      voucher_validity_days: 45,
    })

    // Un seul réglage à la fois : l'autre ne bouge pas.
    await patch({ voucherValidityDays: 10 })
    expect(dbState.companies[0]).toMatchObject({
      voucher_label: 'Une partie offerte',
      voucher_validity_days: 10,
    })

    const disabled = await patch({ voucherLabel: '' })

    expect(parseJson(disabled)).toMatchObject({ company: { voucherLabel: null } })
    expect(dbState.companies[0]).toMatchObject({ voucher_label: null, voucher_validity_days: 10 })

    await app.close()
  })

  it('rejects a voucher validity out of bounds and an over-long label', async () => {
    const app = await createRouteApp(companiesIdRoutes)

    for (const payload of [
      { voucherValidityDays: 0 },
      { voucherValidityDays: 731 },
      { voucherLabel: 'x'.repeat(121) },
    ]) {
      const response = await app.inject({
        method: 'PATCH',
        url: '/companies/1',
        headers: authHeaders(companyAdminUser),
        payload,
      })

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    }

    expect(dbState.companies[0]).not.toHaveProperty('voucher_label', 'x'.repeat(121))

    await app.close()
  })

  it('does not let an admin of another company change the voucher settings', async () => {
    securityState.context.canAccessCompany = false
    const app = await createRouteApp(companiesIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/2',
      headers: authHeaders(companyAdminUser),
      payload: { voucherLabel: 'Pirate' },
    })

    expect(response.statusCode).toBe(403)
    expect(dbState.companies[1]).not.toMatchObject({ voucher_label: 'Pirate' })

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
