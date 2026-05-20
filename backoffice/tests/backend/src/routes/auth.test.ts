import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import { ADMIN_ROLE_SUPERADMIN } from '@quizzup/shared'

import authRoutes from '../../../../backend/src/routes/auth'

import {
  dbState,
  MOCK_NOW,
} from './_helpers/mockDb'

import {
  authHeaders,
  createRouteApp,
  expectPublicAdmin,
  jwtSignMock,
  parseJson,
  superadminUser,
} from './_helpers/testApp'

import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'

resetRouteMocksBeforeEach()

describe('routes/auth.ts', () => {
  it('rejects malformed login payloads', async () => {
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { identifier: '', password: '' },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toHaveProperty('fieldErrors')

    await app.close()
  })

  it('returns a generic 401 for unknown identifiers to avoid account enumeration', async () => {
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        identifier: "root@quizzup.test' OR 1=1 --",
        password: 'whatever',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(parseJson(response)).toEqual({ error: 'invalid_credentials' })

    await app.close()
  })

  it('returns the same generic 401 for a wrong password', async () => {
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        identifier: 'root@quizzup.test',
        password: 'bad-password',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(parseJson(response)).toEqual({ error: 'invalid_credentials' })

    await app.close()
  })

  it('logs in active admins, creates a DB session and never exposes the password hash', async () => {
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        identifier: 'ROOT@QUIZZUP.TEST',
        password: 'root-password',
      },
    })

    const body = parseJson<{
      token: string
      admin: Record<string, unknown>
    }>(response)

    expect(response.statusCode).toBe(200)
    expect(body.token).toBe('test.jwt.token')
    expect(body.admin).toMatchObject({
      id: 1,
      company_id: 1,
      role: ADMIN_ROLE_SUPERADMIN,
      username: 'root',
      email: 'root@quizzup.test',
    })
    expectPublicAdmin(body.admin)
    expect(dbState.admin_sessions).toHaveLength(1)
    expect(dbState.admin_sessions[0]).toMatchObject({ admin_id: 1 })
    expect(jwtSignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: '1',
        company_id: 1,
        role: ADMIN_ROLE_SUPERADMIN,
        sid: expect.any(String),
      }),
      { expiresIn: '7d' },
    )

    await app.close()
  })

  it('logs in by username case-insensitively', async () => {
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        identifier: 'RoOt',
        password: 'root-password',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ admin: { id: number } }>(response).admin.id).toBe(1)

    await app.close()
  })

  it('requires authentication on logout', async () => {
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({ method: 'POST', url: '/logout' })

    expect(response.statusCode).toBe(401)
    expect(parseJson(response)).toEqual({ error: 'unauthorized' })

    await app.close()
  })

  it('revokes the current session on logout', async () => {
    dbState.admin_sessions.push({
      id: 'sid-root',
      admin_id: 1,
      created_at: MOCK_NOW,
      last_seen_at: MOCK_NOW,
      revoked_at: null,
    })

    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toEqual({ ok: true })
    expect(dbState.admin_sessions[0].revoked_at).toBe(MOCK_NOW)

    await app.close()
  })
})
