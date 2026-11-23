import '../routes/_helpers/registerDbMock'

import fastify, {
  type FastifyInstance,
  type FastifyPluginAsync,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  COMPANY_STATUS_DELETED,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
} from '@quizzup/shared'

import authPlugin, { checkSession } from '../../../../backend/src/plugins/auth'
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

  it('refuses any token that carries a typ claim, even with the sid of a live session', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })
    const app = await buildApp()
    const session = { sub: '1', company_id: 1, role: 'superadmin', sid: 'sid-1' }
    const get = (token: string) =>
      app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: '127.0.0.1',
      })

    // Témoin : le même jeton sans `typ` passe, donc seul `typ` explique le refus.
    expect((await get(signToken(app, session))).statusCode).toBe(200)

    for (const typ of ['mfa_challenge', 'autre', '']) {
      const response = await get(signToken(app, { ...session, typ }))

      expect(response.statusCode, `typ=${typ}`).toBe(401)
      expect(response.json(), `typ=${typ}`).toEqual({ error: 'unauthorized' })
    }

    await app.close()
  })

  it('refuses a challenge token, which has no session', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${signToken(app, { sub: '1', typ: 'mfa_challenge' })}` },
      remoteAddress: '127.0.0.1',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'unauthorized' })

    await app.close()
  })

  it('decorates the TOTP key from TOTP_ENCRYPTION_KEY, null when absent or malformed', async () => {
    const keyOf = async () => {
      const app = await buildApp()
      const key = (app as unknown as { totpKey: Buffer | null }).totpKey
      await app.close()

      return key
    }

    expect((await keyOf())?.length).toBe(32)

    vi.stubEnv('TOTP_ENCRYPTION_KEY', '')
    expect(await keyOf()).toBeNull()

    vi.stubEnv('TOTP_ENCRYPTION_KEY', Buffer.alloc(16).toString('base64'))
    expect(await keyOf()).toBeNull()

    vi.unstubAllEnvs()
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

  describe('room accounts (US-ROOM-02)', () => {
    function seedRoomAccount(): void {
      if (!dbState.rooms.some((room) => Number(room.id) === 7)) {
        dbState.rooms.push({ id: 7, company_id: 1, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE })
      }
      dbState.admins.push({
        id: 10,
        company_id: 1,
        room_id: 7,
        role: ADMIN_ROLE_ROOM,
        username: 'salle-neon',
        email: 'room-x@rooms.quizzup.invalid',
        mdp_hash: 'hash',
        status: ADMIN_STATUS_ACTIVE,
        created_at: MOCK_NOW,
        updated_at: null,
        deleted_at: null,
      })
    }

    it('keeps a room session alive after more than 1h of inactivity', async () => {
      seedRoomAccount()
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      seedSession({ id: 'sid-room', admin_id: 10, last_seen_at: twoDaysAgo })

      const app = await buildApp()
      const token = signToken(app, {
        sub: '10',
        company_id: 1,
        role: ADMIN_ROLE_ROOM,
        sid: 'sid-room',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect((response.json() as { user: { room_id: number } }).user.room_id).toBe(7)
      expect(findSession('sid-room')?.revoked_at).toBeNull()

      await app.close()
    })

    it('disconnects a room PC when its company is no longer active', async () => {
      seedRoomAccount()
      seedSession({ id: 'sid-room', admin_id: 10 })
      const company = dbState.companies.find((row) => Number(row.id) === 1)
      if (company) company.status = COMPANY_STATUS_DELETED

      const app = await buildApp()
      const token = signToken(app, {
        sub: '10',
        company_id: 1,
        role: ADMIN_ROLE_ROOM,
        sid: 'sid-room',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: 'account_inactive' })
      expect(findSession('sid-room')?.revoked_at).toBe(MOCK_NOW)

      await app.close()
    })

    it('disconnects a room PC whose room was deleted', async () => {
      seedRoomAccount()
      seedSession({ id: 'sid-room', admin_id: 10 })
      dbState.rooms[0]!.status = ROOM_STATUS_DELETED

      const app = await buildApp()
      const token = signToken(app, {
        sub: '10',
        company_id: 1,
        role: ADMIN_ROLE_ROOM,
        sid: 'sid-room',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(401)
      expect(findSession('sid-room')?.revoked_at).toBe(MOCK_NOW)

      await app.close()
    })

    it('does not let a staff account use a room token to escape inactivity', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      seedSession({ id: 'sid-1', admin_id: 1, last_seen_at: twoHoursAgo })

      const app = await buildApp()
      // Le JWT est signé par le serveur ; ce cas couvre un compte dont le rôle a changé.
      const token = signToken(app, { sub: '1', company_id: 1, role: ADMIN_ROLE_ROOM, sid: 'sid-1' })

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(401)
      expect(findSession('sid-1')?.revoked_at).toBe(MOCK_NOW)

      await app.close()
    })
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

describe('plugins/auth.ts (garde réseau de la console éditeur)', () => {
  // Plages de documentation (RFC 5737 et 3849) : aucune adresse réelle.
  const OPERATOR_NET = '192.0.2.0/24 2001:db8::/32'
  const OPERATOR = '192.0.2.10'
  const OUTSIDE = '198.51.100.9'

  beforeEach(() => {
    resetDb()
    vi.stubEnv('CONSOLE_ALLOWED_CIDRS', OPERATOR_NET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function callAs(
    admin: { sub: string; role: string; sid: string },
    remoteAddress: string,
    headers: Record<string, string> = {}
  ) {
    const app = await buildApp()
    const token = signToken(app, { ...admin, company_id: 1 })
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      remoteAddress,
      headers: { authorization: `Bearer ${token}`, ...headers },
    })
    await app.close()

    return response
  }

  const superadmin = { sub: '1', role: ADMIN_ROLE_SUPERADMIN, sid: 'sid-1' }
  const companyAdmin = { sub: '2', role: 'admin', sid: 'sid-2' }

  it('refuses a superadmin outside the console addresses, even with a valid token', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    seedSession({ id: 'sid-1', admin_id: 1, last_seen_at: tenMinutesAgo })

    const response = await callAs(superadmin, OUTSIDE)

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
    // Une requête refusée ne prolonge pas la session et ne la révoque pas.
    expect(findSession('sid-1')?.last_seen_at).toBe(tenMinutesAgo)
    expect(findSession('sid-1')?.revoked_at).toBeNull()
  })

  it('lets a superadmin in from an allowed address', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })

    expect((await callAs(superadmin, OPERATOR)).statusCode).toBe(200)
  })

  it('does not apply to the other roles, whatever their address', async () => {
    seedSession({ id: 'sid-2', admin_id: 2 })

    expect((await callAs(companyAdmin, OUTSIDE)).statusCode).toBe(200)
  })

  it('reads the role from the database, not from the token', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })

    // Jeton signé « user » pour un compte devenu superadmin : la garde s'applique quand même.
    const response = await callAs({ ...superadmin, role: 'user' }, OUTSIDE)

    expect(response.statusCode).toBe(403)
  })

  it('handles IPv6 ranges', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })

    // Refus d'abord : une requête acceptée prolonge la session (horloge de la base simulée).
    expect((await callAs(superadmin, '3fff::5')).statusCode).toBe(403)
    expect((await callAs(superadmin, '2001:db8::5')).statusCode).toBe(200)
  })

  it('matches an IPv4 address given in its IPv6-mapped form', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })

    expect((await callAs(superadmin, `::ffff:${OUTSIDE}`)).statusCode).toBe(403)
    expect((await callAs(superadmin, `::ffff:${OPERATOR}`)).statusCode).toBe(200)
  })

  it('ignores a forged X-Forwarded-For when no proxy is trusted', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })

    const response = await callAs(superadmin, OUTSIDE, { 'x-forwarded-for': OPERATOR })

    expect(response.statusCode).toBe(403)
  })

  it.each([undefined, '', '   '])(
    'closes the console to every superadmin when the variable is %j, localhost included',
    async (value) => {
      vi.stubEnv('CONSOLE_ALLOWED_CIDRS', value)
      seedSession({ id: 'sid-1', admin_id: 1 })
      seedSession({ id: 'sid-2', admin_id: 2 })

      expect((await callAs(superadmin, '127.0.0.1')).statusCode).toBe(403)
      // Seul le superadmin est touché : le reste de l'API reste ouvert aux centres.
      expect((await callAs(companyAdmin, '127.0.0.1')).statusCode).toBe(200)
    }
  )

  it('refuses to start on an invalid entry', async () => {
    vi.stubEnv('CONSOLE_ALLOWED_CIDRS', `${OPERATOR_NET} pas-une-adresse`)

    await expect(buildApp()).rejects.toThrow(/CONSOLE_ALLOWED_CIDRS invalide/)
  })
})

describe('plugins/auth.ts (checkSession)', () => {
  beforeEach(() => {
    resetDb()
  })

  it('accepts a live session and does not extend it', async () => {
    const lastSeenAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    seedSession({ id: 'sid-1', admin_id: 1, last_seen_at: lastSeenAt })

    const check = await checkSession('sid-1', 1, false)

    expect(check).toMatchObject({ ok: true, admin: { id: 1, role: ADMIN_ROLE_SUPERADMIN } })
    expect(findSession('sid-1')?.last_seen_at).toBe(lastSeenAt)
  })

  it('refuses an unknown session, a revoked session and a session of another account', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })
    seedSession({ id: 'sid-2', admin_id: 1, revoked_at: MOCK_NOW })

    expect(await checkSession('missing', 1, false)).toEqual({ ok: false, error: 'session_invalid' })
    expect(await checkSession('sid-2', 1, false)).toEqual({ ok: false, error: 'session_invalid' })
    expect(await checkSession('sid-1', 2, false)).toEqual({ ok: false, error: 'session_invalid' })
  })

  it('refuses and revokes a session inactive for more than 1h', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    seedSession({ id: 'sid-1', admin_id: 1, last_seen_at: twoHoursAgo })

    expect(await checkSession('sid-1', 1, false)).toEqual({
      ok: false,
      error: 'session_expired_inactive',
    })
    expect(findSession('sid-1')?.revoked_at).toBe(MOCK_NOW)
  })

  it('refuses and revokes the session of an account that is no longer active', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })
    dbState.admins[0]!.status = ADMIN_STATUS_DELETED

    expect(await checkSession('sid-1', 1, false)).toEqual({ ok: false, error: 'account_inactive' })
    expect(findSession('sid-1')?.revoked_at).toBe(MOCK_NOW)
  })

  it('refuses a room token whose account is not a room account any more', async () => {
    seedSession({ id: 'sid-1', admin_id: 1 })

    expect(await checkSession('sid-1', 1, true)).toEqual({ ok: false, error: 'account_inactive' })
  })
})
