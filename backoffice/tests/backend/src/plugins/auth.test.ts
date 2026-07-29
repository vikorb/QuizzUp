import { vi } from 'vitest'

vi.mock('../../../../backend/src/db', async () => {
  const { db } = await import('../routes/_helpers/mockDb')

  return { default: db }
})

import fastify, {
  type FastifyInstance,
  type FastifyPluginAsync,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_ROLE_SUPERADMIN, ADMIN_STATUS_DELETED } from '@quizzup/shared'

import authPlugin from '../../../../backend/src/plugins/auth'
import { dbState, MOCK_NOW, resetDb } from '../routes/_helpers/mockDb'

process.env.JWT_SECRET ??= 'test-jwt-secret'

// The `fastify` copy resolved in the test compilation does not carry the
// `@fastify/jwt` / auth-plugin module augmentations (same reason testApp.ts
// casts its decorations), so we access those decorations through narrow casts.
type AuthDecorations = {
  jwt: { sign: (payload: Record<string, unknown>, options?: Record<string, unknown>) => string }
  authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
}

type ProtectedBody = {
  user: { sub: string; role: string; company_id: number }
}

type SessionSeed = {
  id: string
  admin_id: number
  last_seen_at?: string
  revoked_at?: string | null
}

function seedSession(session: SessionSeed): void {
  dbState.admin_sessions.push({
    created_at: MOCK_NOW,
    last_seen_at: session.last_seen_at ?? new Date().toISOString(),
    revoked_at: session.revoked_at ?? null,
    ...session,
  })
}

function findSession(id: string) {
  return dbState.admin_sessions.find((session) => session.id === id)
}

async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({ logger: false })

  await app.register(authPlugin as never)

  // Registered after authPlugin so that `authenticate` is already decorated
  // when this nested plugin loads.
  const protectedPlugin: FastifyPluginAsync = async (instance) => {
    const decorated = instance as unknown as AuthDecorations

    instance.get(
      '/protected',
      { preHandler: [decorated.authenticate] },
      async (req: FastifyRequest) => ({ user: (req as unknown as { user: unknown }).user })
    )
  }

  await app.register(protectedPlugin as never)
  await app.ready()

  return app
}

function signToken(app: FastifyInstance, payload: Record<string, unknown>): string {
  return (app as unknown as AuthDecorations).jwt.sign(payload)
}

describe('plugins/auth.ts (authenticate)', () => {
  beforeEach(() => {
    resetDb()
  })

  it('rejects requests without a bearer token', async () => {
    const app = await buildApp()

    const response = await app.inject({ method: 'GET', url: '/protected' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'unauthorized' })

    await app.close()
  })

  it('rejects requests with a malformed token', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer not-a-real-token' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'unauthorized' })

    await app.close()
  })

  it('allows a valid token backed by an active session and refreshes last_seen_at', async () => {
    seedSession({ id: 'sid-1', admin_id: 1, last_seen_at: new Date().toISOString() })

    const app = await buildApp()
    const token = signToken(app, {
      sub: '1',
      company_id: 1,
      role: ADMIN_ROLE_SUPERADMIN,
      sid: 'sid-1',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect((response.json() as ProtectedBody).user.sub).toBe('1')
    // Sliding inactivity: the session activity timestamp is bumped.
    expect(findSession('sid-1')?.last_seen_at).toBe(MOCK_NOW)

    await app.close()
  })

  it('rejects when no matching session exists', async () => {
    const app = await buildApp()
    const token = signToken(app, {
      sub: '1',
      company_id: 1,
      role: ADMIN_ROLE_SUPERADMIN,
      sid: 'missing-sid',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'session_invalid' })

    await app.close()
  })

  it('rejects a token whose session has been revoked', async () => {
    seedSession({ id: 'sid-1', admin_id: 1, revoked_at: MOCK_NOW })

    const app = await buildApp()
    const token = signToken(app, {
      sub: '1',
      company_id: 1,
      role: ADMIN_ROLE_SUPERADMIN,
      sid: 'sid-1',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'session_invalid' })

    await app.close()
  })

  it('rejects and revokes a session that has been inactive for more than 1h', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    seedSession({ id: 'sid-1', admin_id: 1, last_seen_at: twoHoursAgo })

    const app = await buildApp()
    const token = signToken(app, {
      sub: '1',
      company_id: 1,
      role: ADMIN_ROLE_SUPERADMIN,
      sid: 'sid-1',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'session_expired_inactive' })
    expect(findSession('sid-1')?.revoked_at).toBe(MOCK_NOW)

    await app.close()
  })

  it('rejects and revokes the session when the admin status is inactive (S1)', async () => {
    // admin id 3 is seeded with status = inactive.
    seedSession({ id: 'sid-3', admin_id: 3 })

    const app = await buildApp()
    const token = signToken(app, { sub: '3', company_id: 2, role: 'user', sid: 'sid-3' })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'account_inactive' })
    expect(findSession('sid-3')?.revoked_at).toBe(MOCK_NOW)

    await app.close()
  })

  it('rejects when the admin has been soft-deleted since the token was issued (S1)', async () => {
    const admin = dbState.admins.find((row) => row.id === 1)
    if (admin) {
      admin.status = ADMIN_STATUS_DELETED
    }
    seedSession({ id: 'sid-1', admin_id: 1 })

    const app = await buildApp()
    const token = signToken(app, {
      sub: '1',
      company_id: 1,
      role: ADMIN_ROLE_SUPERADMIN,
      sid: 'sid-1',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'account_inactive' })

    await app.close()
  })

  it('rejects when the admin backing the session no longer exists', async () => {
    seedSession({ id: 'sid-ghost', admin_id: 999 })

    const app = await buildApp()
    const token = signToken(app, {
      sub: '999',
      company_id: 1,
      role: ADMIN_ROLE_SUPERADMIN,
      sid: 'sid-ghost',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'account_inactive' })

    await app.close()
  })

  it('refreshes role and company_id from the database, ignoring stale JWT claims (S1)', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })

    const app = await buildApp()
    // Stale/tampered claims: the token was issued when the admin had a lower
    // role and a different company. The DB is the source of truth.
    const token = signToken(app, { sub: '1', company_id: 999, role: 'user', sid: 'sid-1' })

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    })

    const body = response.json() as ProtectedBody

    expect(response.statusCode).toBe(200)
    expect(body.user.role).toBe(ADMIN_ROLE_SUPERADMIN)
    expect(body.user.company_id).toBe(1)

    await app.close()
  })
})
