import '../../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'

import {
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_STATUS_DELETED,
} from '@quizzup/shared'
import companyAdminIdRoutes from '@backend/routes/companies/admins/id'

import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import { securityState } from '../../_helpers/mockSecurity'
import { dbState, MOCK_NOW } from '../../_helpers/mockDb'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  expectPublicAdmin,
  parseJson,
  superadminUser,
} from '../../_helpers/testApp'

resetRouteMocksBeforeEach()

describe('routes/companies/admins/id.ts', () => {
  it('forbids reading accounts outside of the allowed context', async () => {
    securityState.context.canReadCompanyAccount = false
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/1/admins/2',
      headers: authHeaders(companyUser),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('returns 404 when the requested account does not exist', async () => {
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/1/admins/999',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'not_found' })

    await app.close()
  })

  it('reads one account without sensitive fields', async () => {
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/1/admins/2',
      headers: authHeaders(companyAdminUser),
    })

    const body = parseJson<{ account: Record<string, unknown> }>(response)

    expect(response.statusCode).toBe(200)
    expect(body.account).toMatchObject({
      id: 2,
      companyId: 1,
      username: 'alice',
      email: 'alice@quizzup.test',
    })
    expectPublicAdmin(body.account)

    await app.close()
  })

  it('rejects empty account updates', async () => {
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2',
      headers: authHeaders(superadminUser),
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })

    await app.close()
  })

  it('prevents admins from promoting an account to superadmin', async () => {
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2',
      headers: authHeaders(companyAdminUser),
      payload: {
        role: ADMIN_ROLE_SUPERADMIN,
      },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden_role' })

    await app.close()
  })

  it('forbids account updates rejected by the contextual policy', async () => {
    securityState.context.canUpdateCompanyAccount = false
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2',
      headers: authHeaders(superadminUser),
      payload: {
        firstname: 'Blocked',
      },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('rejects duplicate account identifiers during update', async () => {
    const app = await createRouteApp(companyAdminIdRoutes)

    const duplicateEmail = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2',
      headers: authHeaders(superadminUser),
      payload: {
        email: 'ROOT@QUIZZUP.TEST',
      },
    })

    const duplicateUsername = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2',
      headers: authHeaders(superadminUser),
      payload: {
        username: 'ROOT',
      },
    })

    expect(duplicateEmail.statusCode).toBe(409)
    expect(parseJson(duplicateEmail)).toEqual({ error: 'email_already_exists' })
    expect(duplicateUsername.statusCode).toBe(409)
    expect(parseJson(duplicateUsername)).toEqual({ error: 'username_already_exists' })

    await app.close()
  })

  it('updates profile fields, hashes passwords and never returns hashes', async () => {
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/1/admins/2',
      headers: authHeaders(superadminUser),
      payload: {
        firstname: '  Alicia  ',
        lastname: '   ',
        password: 'new-password-123',
      },
    })

    const body = parseJson<{ account: Record<string, unknown> }>(response)
    const updatedAdmin = dbState.admins.find((admin) => admin.id === 2)

    expect(response.statusCode).toBe(200)
    expect(body.account).toMatchObject({
      id: 2,
      firstname: 'Alicia',
      lastname: null,
    })
    expectPublicAdmin(body.account)
    expect(updatedAdmin).toMatchObject({
      firstname: 'Alicia',
      lastname: null,
    })
    expect(updatedAdmin?.mdp_hash).toEqual(expect.stringMatching(/^\$2[aby]\$\d{2}\$/))
    expect(updatedAdmin?.mdp_hash).not.toBe('new-password-123')
    await expect(bcrypt.compare('new-password-123', String(updatedAdmin?.mdp_hash))).resolves.toBe(true)

    await app.close()
  })

  it('forbids account deletion rejected by the contextual policy', async () => {
    securityState.context.canDeleteCompanyAccount = false
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/companies/1/admins/2',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('soft-deletes an account instead of physically removing it', async () => {
    const app = await createRouteApp(companyAdminIdRoutes)

    const response = await app.inject({
      method: 'DELETE',
      url: '/companies/1/admins/2',
      headers: authHeaders(superadminUser),
    })

    const body = parseJson<{ account: Record<string, unknown> }>(response)

    expect(response.statusCode).toBe(200)
    expect(body.account).toMatchObject({
      id: 2,
      status: ADMIN_STATUS_DELETED,
      deletedAt: MOCK_NOW,
    })
    expect(dbState.admins.find((admin) => admin.id === 2)).toMatchObject({
      status: ADMIN_STATUS_DELETED,
      deleted_at: MOCK_NOW,
    })

    await app.close()
  })
})
