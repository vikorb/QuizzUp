import '../../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import { ROOM_STATUS_ACTIVE } from '@quizzup/shared'
import companyRoomsRoutes from '@backend/routes/companies/rooms'
import companyRoomIdRoutes from '@backend/routes/companies/rooms/id'
import {
  isSmokeConfigChangeForbidden,
  isSmokeEnabled,
} from '@backend/routes/companies/rooms/_smoke'
import { db, dbState, MOCK_NOW, resetDb } from '../../_helpers/mockDb'
import { securityState } from '../../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../../_helpers/testApp'

resetRouteMocksBeforeEach()

const smoke = (value: unknown) => ({ lighting: { smoke: value } })
const OFF = { enabled: false, maxDurationMs: 3000, restMs: 60_000, channel: 7 }
const ON = { ...OFF, enabled: true }

describe('isSmokeEnabled', () => {
  it.each([
    [smoke({ enabled: true }), true],
    [smoke({ enabled: false }), false],
    [smoke({}), false],
    // Même lecture stricte que l'écran de salle : seule la valeur `true` active.
    [smoke({ enabled: 'true' }), false],
    [smoke({ enabled: 1 }), false],
    [smoke('on'), false],
    [{ lighting: 'x' }, false],
    [{ lighting: [] }, false],
    [{ smoke: { enabled: true } }, false],
    [{}, false],
    [null, false],
    [undefined, false],
    ['x', false],
  ])('reads %j as %s', (config, expected) => {
    expect(isSmokeEnabled(config)).toBe(expected)
  })
})

describe('isSmokeConfigChangeForbidden', () => {
  it.each([
    ['enabling from false', smoke(OFF), smoke(ON)],
    ['enabling when the section is absent', {}, smoke({ enabled: true })],
    ['enabling when the stored config is null', null, smoke({ enabled: true })],
    ['enabling when lighting is not an object', { lighting: 'x' }, smoke({ enabled: true })],
    ['enabling with enabled missing from the store', smoke({ maxDurationMs: 3000 }), smoke(ON)],
    ['changing a setting while off', smoke(OFF), smoke({ ...OFF, maxDurationMs: 9000 })],
    ['changing a setting while on', smoke(ON), smoke({ ...ON, restMs: 1000 })],
    ['changing a nested setting', smoke({ ...ON, a: { b: 1 } }), smoke({ ...ON, a: { b: 2 } })],
    ['adding a setting', smoke(OFF), smoke({ ...OFF, extra: 1 })],
    ['removing a setting', smoke(OFF), smoke({ enabled: false, maxDurationMs: 3000 })],
    ['cutting and changing a setting at once', smoke(ON), smoke({ ...OFF, channel: 8 })],
    ['cutting and adding a setting', smoke(ON), smoke({ ...OFF, extra: 1 })],
    ['dropping the smoke section', smoke(OFF), { lighting: {} }],
    ['replacing the section by a non object', smoke(ON), smoke('off')],
    ['a non boolean enabled', smoke(OFF), smoke({ ...OFF, enabled: 'true' })],
    ['a non strict false when cutting', smoke(ON), smoke({ ...ON, enabled: 0 })],
    ['creating a disabled section', {}, smoke({ enabled: false })],
  ])('forbids %s', (_label, stored, incoming) => {
    expect(isSmokeConfigChangeForbidden(stored, incoming)).toBe(true)
  })

  it.each([
    ['cutting the smoke, same settings', smoke(ON), smoke(OFF)],
    ['the same smoke section, enabled', smoke(ON), smoke(ON)],
    ['the same smoke section, disabled', smoke(OFF), smoke(OFF)],
    [
      'the same section with keys in another order',
      smoke(ON),
      smoke({ channel: 7, enabled: true, restMs: 60_000, maxDurationMs: 3000 }),
    ],
    ['no smoke section on both sides', { buzzers: {} }, { dmx: { universe: 1 } }],
    ['an unset stored config', undefined, {}],
    ['an unrelated change next to the same smoke', { ...smoke(ON), a: 1 }, { ...smoke(ON), a: 2 }],
    [
      'a cut next to other lighting changes',
      { lighting: { smoke: ON, fixtures: [1] } },
      { lighting: { smoke: OFF, fixtures: [1, 2] } },
    ],
  ])('allows %s', (_label, stored, incoming) => {
    expect(isSmokeConfigChangeForbidden(stored, incoming)).toBe(false)
  })
})

function room(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: smoke(OFF),
    config_revision: 3,
    status: ROOM_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

async function roomsApp() {
  return createRouteApp(async (instance: never) => {
    const fastify = instance as { register: (plugin: unknown) => Promise<void> }
    await fastify.register(companyRoomsRoutes)
    await fastify.register(companyRoomIdRoutes)
  })
}

const SMOKE_FORBIDDEN = { error: 'smoke_config_forbidden' }
const staff: Array<[string, TestUser]> = [
  ['admin', companyAdminUser],
  ['superadmin', superadminUser],
]

describe('PATCH /companies/:companyId/rooms/:roomId — smoke guard', () => {
  const patch = (app: Awaited<ReturnType<typeof roomsApp>>, user: TestUser, payload: unknown) =>
    app.inject({
      method: 'PATCH',
      url: '/companies/1/rooms/1',
      headers: authHeaders(user),
      payload: payload as Record<string, unknown>,
    })

  it.each(staff)('refuses to enable the smoke, as %s, and writes nothing', async (_role, user) => {
    resetDb({ rooms: [room()] })
    const app = await roomsApp()

    const response = await patch(app, user, { config: smoke(ON) })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual(SMOKE_FORBIDDEN)
    expect(dbState.rooms[0]).toMatchObject({ config: smoke(OFF), config_revision: 3 })

    await app.close()
  })

  it.each(staff)('refuses a smoke setting change, as %s', async (_role, user) => {
    resetDb({ rooms: [room({ config: smoke(ON) })] })
    const app = await roomsApp()

    const response = await patch(app, user, { config: smoke({ ...ON, maxDurationMs: 9000 }) })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual(SMOKE_FORBIDDEN)
    expect(dbState.rooms[0]).toMatchObject({ config: smoke(ON), config_revision: 3 })

    await app.close()
  })

  it('refuses to enable the smoke on a room without any stored config', async () => {
    resetDb({ rooms: [room({ config: {} })] })
    const app = await roomsApp()

    const response = await patch(app, superadminUser, { name: 'Autre', config: smoke(ON) })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual(SMOKE_FORBIDDEN)
    // Rien n'est écrit, pas même le nom envoyé avec.
    expect(dbState.rooms[0]).toMatchObject({ name: 'Salle Néon', config: {}, config_revision: 3 })

    await app.close()
  })

  it('refuses a user of the company: the permission check comes first', async () => {
    resetDb({ rooms: [room()] })
    const app = await roomsApp()
    const user = { ...companyAdminUser, role: 'user' } as TestUser

    // Le `user` n'a pas `room:update` (matrice testée dans security/permissions.test.ts).
    securityState.hasPermission = false
    const response = await patch(app, user, { config: smoke(ON) })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })
    expect(dbState.rooms[0]).toMatchObject({ config: smoke(OFF), config_revision: 3 })

    await app.close()
  })

  it('still refuses another company with the usual forbidden', async () => {
    resetDb({ rooms: [room({ id: 2, company_id: 2 })] })
    const app = await roomsApp()

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/2/rooms/2',
      headers: authHeaders(companyAdminUser),
      payload: { config: smoke(ON) },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it.each(staff)('lets %s cut the smoke from true to false', async (_role, user) => {
    resetDb({ rooms: [room({ config: smoke(ON) })] })
    const app = await roomsApp()

    const response = await patch(app, user, { config: smoke(OFF) })

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ room: { config: unknown } }>(response).room.config).toEqual(smoke(OFF))
    expect(dbState.rooms[0]).toMatchObject({ config: smoke(OFF), config_revision: 4 })

    await app.close()
  })

  it('lets a config return the same smoke section while the rest changes', async () => {
    resetDb({ rooms: [room({ config: { ...smoke(ON), buzzers: { podiums: 2 } } })] })
    const app = await roomsApp()
    const config = { ...smoke(ON), buzzers: { podiums: 4 }, desksCount: 5 }

    const response = await patch(app, companyAdminUser, { config })

    expect(response.statusCode).toBe(200)
    expect(dbState.rooms[0]).toMatchObject({ config, config_revision: 4 })

    await app.close()
  })

  it('lets a PATCH without config through, even with the smoke enabled', async () => {
    resetDb({ rooms: [room({ config: smoke(ON) })] })
    const app = await roomsApp()

    const response = await patch(app, companyAdminUser, { name: 'Salle Laser' })

    expect(response.statusCode).toBe(200)
    expect(dbState.rooms[0]).toMatchObject({
      name: 'Salle Laser',
      config: smoke(ON),
      config_revision: 3,
    })

    await app.close()
  })

  it('answers 409 and writes nothing when the room screen changed the config meanwhile', async () => {
    resetDb({ rooms: [room({ config: smoke(ON) })] })
    const app = await roomsApp()

    // L'écran de salle coupe puis règle la fumée entre la lecture et l'écriture : une config
    // identique à la lecture périmée ne doit pas la réactiver.
    db.fn.now.mockImplementationOnce(() => {
      dbState.rooms[0]!.config = smoke({ ...OFF, maxDurationMs: 1000 })
      dbState.rooms[0]!.config_revision = 4

      return MOCK_NOW
    })

    const response = await patch(app, companyAdminUser, { config: smoke(ON) })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'room_config_conflict' })
    expect(dbState.rooms[0]).toMatchObject({
      config: smoke({ ...OFF, maxDurationMs: 1000 }),
      config_revision: 4,
    })

    await app.close()
  })
})

describe('POST /companies/:companyId/rooms — smoke guard', () => {
  const create = (app: Awaited<ReturnType<typeof roomsApp>>, user: TestUser, config: unknown) =>
    app.inject({
      method: 'POST',
      url: '/companies/1/rooms',
      headers: authHeaders(user),
      payload: { name: 'Salle Neuve', config } as Record<string, unknown>,
    })

  it.each(staff)('refuses a config with the smoke enabled, as %s', async (_role, user) => {
    const app = await roomsApp()

    const response = await create(app, user, smoke(ON))

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual(SMOKE_FORBIDDEN)
    expect(dbState.rooms).toHaveLength(0)

    await app.close()
  })

  it('accepts a config whose smoke is disabled', async () => {
    const app = await roomsApp()

    const response = await create(app, companyAdminUser, smoke(OFF))

    expect(response.statusCode).toBe(201)
    expect(dbState.rooms).toHaveLength(1)

    await app.close()
  })

  it('still refuses another company with the usual forbidden', async () => {
    const app = await roomsApp()

    const response = await app.inject({
      method: 'POST',
      url: '/companies/2/rooms',
      headers: authHeaders(companyAdminUser),
      payload: { name: 'Salle Neuve', config: smoke(ON) },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })
})
