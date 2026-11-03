import '../../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'
import companyAdminsRoutes from '@backend/routes/companies/admins'
import companyRoomAccountRoutes from '@backend/routes/companies/rooms/account'
import companyRoomIdRoutes from '@backend/routes/companies/rooms/id'
import companyRoomIdStatusRoutes from '@backend/routes/companies/rooms/idStatus'
import { dbState, MOCK_NOW } from '../../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  superadminUser,
} from '../../_helpers/testApp'

resetRouteMocksBeforeEach()

type AccountBody = { account: Record<string, unknown> | null }

function seedRoom(overrides: Record<string, unknown> = {}) {
  dbState.rooms.push({
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: {},
    status: ROOM_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

function seedRoomAccount(overrides: Record<string, unknown> = {}) {
  dbState.admins.push({
    id: 10,
    company_id: 1,
    room_id: 1,
    role: ADMIN_ROLE_ROOM,
    firstname: null,
    lastname: null,
    username: 'salle-neon',
    email: 'room-x@rooms.quizzup.invalid',
    mdp_hash: 'hash',
    status: ADMIN_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
  dbState.admin_sessions.push({
    id: 'sid-room',
    admin_id: 10,
    created_at: MOCK_NOW,
    last_seen_at: MOCK_NOW,
    revoked_at: null,
  })
}

async function buildApp() {
  return createRouteApp(async (instance: never) => {
    const fastify = instance as { register: (plugin: unknown) => Promise<void> }
    await fastify.register(companyRoomAccountRoutes)
    await fastify.register(companyRoomIdRoutes)
    await fastify.register(companyRoomIdStatusRoutes)
    await fastify.register(companyAdminsRoutes)
  })
}

const URL = '/companies/1/rooms/1/account'

describe('routes/companies/rooms/account (US-ROOM-02)', () => {
  it('returns null when the room has no account, then the account once created', async () => {
    seedRoom()
    const app = await buildApp()

    const before = await app.inject({
      method: 'GET',
      url: URL,
      headers: authHeaders(companyAdminUser),
    })
    const created = await app.inject({
      method: 'POST',
      url: URL,
      headers: authHeaders(companyAdminUser),
      payload: { username: 'salle-neon', password: 'motdepasse-salle' },
    })
    const after = await app.inject({
      method: 'GET',
      url: URL,
      headers: authHeaders(companyAdminUser),
    })

    expect(parseJson<AccountBody>(before).account).toBeNull()
    expect(created.statusCode).toBe(201)
    expect(parseJson<AccountBody>(created).account).toMatchObject({
      companyId: 1,
      roomId: 1,
      username: 'salle-neon',
      status: ADMIN_STATUS_ACTIVE,
    })
    expect(parseJson<AccountBody>(created).account).not.toHaveProperty('mdp_hash')
    expect(parseJson<AccountBody>(after).account).toMatchObject({ username: 'salle-neon' })

    const stored = dbState.admins.find((admin) => admin.username === 'salle-neon')
    expect(stored).toMatchObject({ role: ADMIN_ROLE_ROOM, room_id: 1 })
    expect(String(stored?.email)).toMatch(/@rooms\.quizzup\.invalid$/)
    expect(stored?.mdp_hash).not.toBe('motdepasse-salle')

    await app.close()
  })

  it('allows only one active account per room and a free username', async () => {
    seedRoom()
    seedRoom({ id: 2, name: 'Salle Laser' })
    seedRoomAccount()
    const app = await buildApp()

    const second = await app.inject({
      method: 'POST',
      url: URL,
      headers: authHeaders(companyAdminUser),
      payload: { username: 'autre-nom', password: 'motdepasse-salle' },
    })
    const takenUsername = await app.inject({
      method: 'POST',
      url: '/companies/1/rooms/2/account',
      headers: authHeaders(companyAdminUser),
      payload: { username: 'ALICE', password: 'motdepasse-salle' },
    })

    expect(second.statusCode).toBe(409)
    expect(parseJson(second)).toEqual({ error: 'room_account_already_exists' })
    expect(takenUsername.statusCode).toBe(409)
    expect(parseJson(takenUsername)).toEqual({ error: 'username_already_exists' })

    await app.close()
  })

  it('validates the body, the company and the room', async () => {
    seedRoom()
    seedRoom({ id: 2, name: 'Rétro', status: ROOM_STATUS_DELETED })
    const app = await buildApp()

    const shortPassword = await app.inject({
      method: 'POST',
      url: URL,
      headers: authHeaders(companyAdminUser),
      payload: { username: 'salle', password: 'court' },
    })
    const badUsername = await app.inject({
      method: 'POST',
      url: URL,
      headers: authHeaders(companyAdminUser),
      payload: { username: 'salle néon', password: 'motdepasse-salle' },
    })
    const otherCompany = await app.inject({
      method: 'POST',
      url: URL,
      headers: authHeaders(companyUser),
      payload: { username: 'salle', password: 'motdepasse-salle' },
    })
    const deletedRoom = await app.inject({
      method: 'POST',
      url: '/companies/1/rooms/2/account',
      headers: authHeaders(superadminUser),
      payload: { username: 'salle', password: 'motdepasse-salle' },
    })
    const unknownRoom = await app.inject({
      method: 'GET',
      url: '/companies/1/rooms/9/account',
      headers: authHeaders(superadminUser),
    })

    expect(shortPassword.statusCode).toBe(400)
    expect(badUsername.statusCode).toBe(400)
    expect(otherCompany.statusCode).toBe(403)
    expect(deletedRoom.statusCode).toBe(404)
    expect(unknownRoom.statusCode).toBe(404)

    await app.close()
  })

  it('deletes the account and revokes its sessions', async () => {
    seedRoom()
    seedRoomAccount()
    const app = await buildApp()

    const deleted = await app.inject({
      method: 'DELETE',
      url: URL,
      headers: authHeaders(companyAdminUser),
    })
    const again = await app.inject({
      method: 'DELETE',
      url: URL,
      headers: authHeaders(companyAdminUser),
    })

    expect(deleted.statusCode).toBe(200)
    expect(dbState.admins.find((admin) => admin.id === 10)).toMatchObject({
      status: ADMIN_STATUS_DELETED,
      deleted_at: MOCK_NOW,
    })
    expect(dbState.admin_sessions[0]?.revoked_at).toBe(MOCK_NOW)
    expect(again.statusCode).toBe(404)
    expect(parseJson(again)).toEqual({ error: 'room_account_not_found' })

    await app.close()
  })

  it.each([
    ['DELETE', '/companies/1/rooms/1', undefined],
    ['PATCH', '/companies/1/rooms/1/status', { status: ROOM_STATUS_DELETED }],
  ])('deletes the room account with the room (%s %s)', async (method, url, payload) => {
    seedRoom()
    seedRoomAccount()
    const app = await buildApp()

    const response = await app.inject({
      method: method as 'DELETE' | 'PATCH',
      url,
      headers: authHeaders(companyAdminUser),
      ...(payload ? { payload } : {}),
    })

    expect(response.statusCode).toBe(200)
    expect(dbState.admins.find((admin) => admin.id === 10)?.status).toBe(ADMIN_STATUS_DELETED)
    expect(dbState.admin_sessions[0]?.revoked_at).toBe(MOCK_NOW)

    await app.close()
  })

  it('keeps room accounts out of the staff accounts list', async () => {
    seedRoom()
    seedRoomAccount()
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/companies/1/admins',
      headers: authHeaders(companyAdminUser),
    })

    const accounts = parseJson<{ accounts: Array<{ id: number }> }>(response).accounts
    expect(accounts.map((account) => account.id)).not.toContain(10)

    await app.close()
  })
})
