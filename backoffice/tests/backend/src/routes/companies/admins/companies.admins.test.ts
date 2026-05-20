import '../../_helpers/registerRouteMocks'
import { describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'

import {
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  ADMIN_STATUS_ACTIVE,
} from '@quizzup/shared'
import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import { securityState } from '../../_helpers/mockSecurity'
import { authHeaders, companyAdminUser, createRouteApp, expectPublicAdmin, parseJson, superadminUser } from '../../_helpers/testApp'
import companyAdminsRoutes from '@backend/routes/companies/admins'
import { dbState } from '../../_helpers/mockDb'

resetRouteMocksBeforeEach()

describe('routes/companies/admins/index.ts', () => {
  it('forbids account listing outside of the allowed company context', async () => {
    securityState.context.canListCompanyAccounts = false
    const app = await createRouteApp(companyAdminsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/2/admins',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('returns 404 when listing accounts for an unknown company', async () => {
    const app = await createRouteApp(companyAdminsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/999/admins',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'not_found' })

    await app.close()
  })

  it('lists accounts for an authorized company', async () => {
    const app = await createRouteApp(companyAdminsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/companies/1/admins',
      headers: authHeaders(companyAdminUser),
    })

    const body = parseJson<{ accounts: Array<Record<string, unknown>> }>(response)

    expect(response.statusCode).toBe(200)
    expect(body.accounts).toHaveLength(2)
    body.accounts.forEach(expectPublicAdmin)

    await app.close()
  })

  it('validates account creation payloads', async () => {
    const app = await createRouteApp(companyAdminsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/companies/1/admins',
      headers: authHeaders(superadminUser),
      payload: {
        username: 'new-user',
        email: 'new@user.test',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })

    await app.close()
  })

  it('prevents admins from creating superadmin accounts', async () => {
    const app = await createRouteApp(companyAdminsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/companies/1/admins',
      headers: authHeaders(companyAdminUser),
      payload: {
        username: 'evil-root',
        email: 'evil-root@quizzup.test',
        password: 'password123',
        role: ADMIN_ROLE_SUPERADMIN,
      },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden_role' })

    await app.close()
  })

  it('rejects duplicate account emails and usernames case-insensitively', async () => {
    const app = await createRouteApp(companyAdminsRoutes)

    const duplicateEmail = await app.inject({
      method: 'POST',
      url: '/companies/1/admins',
      headers: authHeaders(superadminUser),
      payload: {
        username: 'new-alice',
        email: 'ALICE@QUIZZUP.TEST',
        password: 'password123',
        role: ADMIN_ROLE_USER,
      },
    })

    const duplicateUsername = await app.inject({
      method: 'POST',
      url: '/companies/1/admins',
      headers: authHeaders(superadminUser),
      payload: {
        username: 'ALICE',
        email: 'new-alice@quizzup.test',
        password: 'password123',
        role: ADMIN_ROLE_USER,
      },
    })

    expect(duplicateEmail.statusCode).toBe(409)
    expect(parseJson(duplicateEmail)).toEqual({ error: 'email_already_exists' })
    expect(duplicateUsername.statusCode).toBe(409)
    expect(parseJson(duplicateUsername)).toEqual({ error: 'username_already_exists' })

    await app.close()
  })

  it('creates an active user account by default and stores only the password hash', async () => {
    const app = await createRouteApp(companyAdminsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/companies/1/admins',
      headers: authHeaders(superadminUser),
      payload: {
        firstname: '  Charlie ',
        lastname: '   ',
        username: 'charlie',
        email: 'CHARLIE@QUIZZUP.TEST',
        password: 'password123',
      },
    })

    const body = parseJson<{ account: Record<string, unknown> }>(response)
    const insertedAdmin = dbState.admins.find((admin) => admin.username === 'charlie')

    expect(response.statusCode).toBe(201)
    expect(body.account).toMatchObject({
      username: 'charlie',
      email: 'charlie@quizzup.test',
      role: ADMIN_ROLE_USER,
      status: ADMIN_STATUS_ACTIVE,
      firstname: 'Charlie',
      lastname: null,
    })
    expectPublicAdmin(body.account)
    expect(insertedAdmin?.mdp_hash).toEqual(expect.stringMatching(/^\$2[aby]\$\d{2}\$/))
    expect(insertedAdmin?.mdp_hash).not.toBe('password123')
    await expect(bcrypt.compare('password123', String(insertedAdmin?.mdp_hash))).resolves.toBe(true)

    await app.close()
  })
})
