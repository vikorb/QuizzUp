import './_helpers/registerRouteMocks'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_STATUS_ACTIVE,
  COMPANY_STATUS_INACTIVE,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import bcrypt from 'bcryptjs'

import authRoutes from '../../../../backend/src/routes/auth'

import { dbState, MOCK_NOW } from './_helpers/mockDb'

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

  it('refuses to log in an admin whose status is not active and creates no session', async () => {
    // Admin "bob" is seeded with an inactive status.
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        identifier: 'bob',
        password: 'bob-password',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(parseJson(response)).toEqual({ error: 'invalid_credentials' })
    expect(dbState.admin_sessions).toHaveLength(0)

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
      { expiresIn: '7d' }
    )

    await app.close()
  })

  it('gives a room account a long-lived token (US-ROOM-02)', async () => {
    dbState.rooms.push({ id: 1, company_id: 1, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE })
    dbState.admins.push({
      id: 10,
      company_id: 1,
      room_id: 1,
      role: ADMIN_ROLE_ROOM,
      firstname: null,
      lastname: null,
      username: 'salle-neon',
      email: 'room-x@rooms.quizzup.invalid',
      mdp_hash: bcrypt.hashSync('motdepasse-salle', 4),
      status: ADMIN_STATUS_ACTIVE,
      created_at: MOCK_NOW,
      updated_at: null,
      deleted_at: null,
    })
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { identifier: 'salle-neon', password: 'motdepasse-salle' },
    })

    expect(response.statusCode).toBe(200)
    expect(jwtSignMock).toHaveBeenCalledWith(expect.objectContaining({ role: ADMIN_ROLE_ROOM }), {
      expiresIn: '365d',
    })

    await app.close()
  })

  it('refuses a room account whose company is inactive (US-ROOM-02)', async () => {
    dbState.admins.push({
      id: 10,
      company_id: 1,
      room_id: 1,
      role: ADMIN_ROLE_ROOM,
      username: 'salle-neon',
      email: 'room-x@rooms.quizzup.invalid',
      mdp_hash: bcrypt.hashSync('motdepasse-salle', 4),
      status: ADMIN_STATUS_ACTIVE,
    })
    const company = dbState.companies.find((row) => Number(row.id) === 1)
    if (company) company.status = COMPANY_STATUS_INACTIVE
    const app = await createRouteApp(authRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { identifier: 'salle-neon', password: 'motdepasse-salle' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'invalid_credentials' })
    expect(dbState.admin_sessions).toHaveLength(0)

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

describe('routes/auth.ts — limite de débit sur /login', () => {
  // Le seuil est de 20 tentatives par adresse (LOGIN_RATE_LIMIT_MAX) sur 15 minutes.
  const LIMIT = 20

  afterEach(() => {
    vi.useRealTimers()
  })

  type App = Awaited<ReturnType<typeof createRouteApp>>

  function login(app: App, payload: Record<string, string>, remoteAddress = '203.0.113.1') {
    return app.inject({ method: 'POST', url: '/login', payload, remoteAddress })
  }

  const wrongPassword = { identifier: 'root', password: 'bad-password' }

  it('answers 429 too_many_requests with Retry-After once the threshold is reached', async () => {
    const app = await createRouteApp(authRoutes)

    for (let i = 0; i < LIMIT; i += 1) {
      expect((await login(app, wrongPassword)).statusCode).toBe(401)
    }

    const blocked = await login(app, wrongPassword)

    expect(blocked.statusCode).toBe(429)
    expect(parseJson(blocked)).toEqual({ error: 'too_many_requests' })
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)

    await app.close()
  })

  it('blocks even the right password once the threshold is reached, without a session', async () => {
    const app = await createRouteApp(authRoutes)

    for (let i = 0; i < LIMIT; i += 1) await login(app, wrongPassword)

    const response = await login(app, { identifier: 'root', password: 'root-password' })

    expect(response.statusCode).toBe(429)
    expect(dbState.admin_sessions).toHaveLength(0)

    await app.close()
  })

  it('answers the same 429 whether the account exists or not', async () => {
    const app = await createRouteApp(authRoutes)

    for (let i = 0; i < LIMIT; i += 1) await login(app, wrongPassword)

    const known = await login(app, { identifier: 'root', password: 'x' })
    const unknown = await login(app, { identifier: 'nobody', password: 'x' })

    expect(known.statusCode).toBe(429)
    expect(unknown.statusCode).toBe(429)
    expect(known.body).toBe(unknown.body)

    await app.close()
  })

  it('lets the same address in again once the window has elapsed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'))
    const app = await createRouteApp(authRoutes)

    for (let i = 0; i < LIMIT; i += 1) await login(app, wrongPassword)

    vi.setSystemTime(new Date('2026-11-23T10:05:00Z'))
    const blocked = await login(app, wrongPassword)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.headers['retry-after']).toBe('600')

    vi.setSystemTime(new Date('2026-11-23T10:15:00Z'))
    expect((await login(app, wrongPassword)).statusCode).toBe(401)

    await app.close()
  })

  it('counts each address on its own', async () => {
    const app = await createRouteApp(authRoutes)

    for (let i = 0; i < LIMIT; i += 1) await login(app, wrongPassword, '203.0.113.1')

    expect((await login(app, wrongPassword, '203.0.113.1')).statusCode).toBe(429)
    expect((await login(app, wrongPassword, '203.0.113.2')).statusCode).toBe(401)

    await app.close()
  })

  it('does not count successful logins, but keeps counting the failures around them', async () => {
    const app = await createRouteApp(authRoutes)

    // Bien plus de connexions réussies que le seuil : aucune n'est bloquée.
    for (let i = 0; i < LIMIT + 5; i += 1) {
      expect((await login(app, { identifier: 'root', password: 'root-password' })).statusCode).toBe(
        200
      )
    }

    // Les réussites n'ont pas remis le compteur à zéro : 20 échecs suffisent encore.
    for (let i = 0; i < LIMIT; i += 1) await login(app, wrongPassword)
    expect((await login(app, { identifier: 'root', password: 'root-password' })).statusCode).toBe(
      429
    )

    await app.close()
  })

  it('also counts malformed payloads, which cost nothing to send', async () => {
    const app = await createRouteApp(authRoutes)

    for (let i = 0; i < LIMIT; i += 1) {
      expect((await login(app, { identifier: '', password: '' })).statusCode).toBe(400)
    }

    expect((await login(app, wrongPassword)).statusCode).toBe(429)

    await app.close()
  })
})
