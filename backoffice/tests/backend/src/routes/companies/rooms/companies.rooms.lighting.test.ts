import '../../_helpers/registerRouteMocks'

import companyRoomsRoutes from '@backend/routes/companies/rooms'
import { isLightingConfigChangeForbidden } from '@backend/routes/companies/rooms/_lighting'
import companyRoomIdRoutes from '@backend/routes/companies/rooms/id'
import { ROOM_STATUS_ACTIVE } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { db, dbState, MOCK_NOW, resetDb } from '../../_helpers/mockDb'
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

// Réglages réels de la fumée (`game/hardware/src/lighting/smoke.ts`).
const OFF = {
  enabled: false,
  maxDurationMs: 3000,
  cooldownMs: 30_000,
  maxLevel: 255,
  requireConfirmation: true,
}
const ON = { ...OFF, enabled: true }

const RELAY = { id: 'fog', name: 'Fumée', profileId: 'smoke-relay', address: 12 }
const PAR = { id: 'par-1', name: 'PAR 1', profileId: 'par-rgb', address: 1 }
const PROGRESSIVE_SMOKE_PROFILE = {
  id: 'fog-x',
  name: 'Fumée X',
  kind: 'smoke',
  channels: [{ role: 'smoke' }],
}
const BINARY_SMOKE_PROFILE = {
  ...PROGRESSIVE_SMOKE_PROFILE,
  channels: [{ role: 'smoke', binary: true }],
}

const lighting = (value: Record<string, unknown>) => ({ lighting: value })
/** Salle équipée : fumée, un PAR et un relais fumée. */
const rig = (smoke: unknown = OFF) => ({
  smoke,
  fixtures: [PAR, RELAY],
  customProfiles: [PROGRESSIVE_SMOKE_PROFILE],
  bindings: { roundStart: 'intro' },
})

describe('isLightingConfigChangeForbidden', () => {
  it.each([
    ['enabling the smoke', lighting(rig(OFF)), lighting(rig(ON))],
    ['enabling when the stored config is empty', {}, lighting({ smoke: ON })],
    ['enabling when the stored config is null', null, lighting({ smoke: ON })],
    ['enabling when lighting is not an object', { lighting: 'x' }, lighting({ smoke: ON })],
    ['a non strict enabled', lighting(rig(OFF)), lighting(rig({ ...OFF, enabled: 'true' }))],
    [
      'dropping the confirmation',
      lighting(rig(OFF)),
      lighting(rig({ ...OFF, requireConfirmation: false })),
    ],
    [
      'dropping the confirmation while on',
      lighting(rig(ON)),
      lighting(rig({ ...ON, requireConfirmation: false })),
    ],
    [
      'declaring a signal loss cut',
      lighting(rig(OFF)),
      lighting(rig({ ...OFF, cutsOnSignalLoss: true })),
    ],
    ['a longer emission', lighting(rig(OFF)), lighting(rig({ ...OFF, maxDurationMs: 10_000 }))],
    ['a shorter pause', lighting(rig(ON)), lighting(rig({ ...ON, cooldownMs: 5000 }))],
    ['a lower level', lighting(rig(ON)), lighting(rig({ ...ON, maxLevel: 10 }))],
    ['dropping the smoke section', lighting(rig(OFF)), lighting({ ...rig(OFF), smoke: undefined })],
    ['replacing the smoke section by a non object', lighting(rig(ON)), lighting(rig('off'))],
    [
      'a smoke relay turned into a plain fixture at the same address',
      lighting(rig(OFF)),
      lighting({ ...rig(OFF), fixtures: [PAR, { ...RELAY, profileId: 'par-rgb' }] }),
    ],
    [
      'a plain fixture turned into a smoke relay',
      lighting({ ...rig(ON), fixtures: [PAR] }),
      lighting({ ...rig(ON), fixtures: [{ ...PAR, profileId: 'smoke-relay' }] }),
    ],
    [
      'a smoke channel made binary in the custom profiles',
      lighting(rig(ON)),
      lighting({ ...rig(ON), customProfiles: [BINARY_SMOKE_PROFILE] }),
    ],
    [
      'a scene bound to buzz',
      lighting(rig(ON)),
      lighting({ ...rig(ON), bindings: { roundStart: 'intro', buzz: 'fog-burst' } }),
    ],
    [
      'a new fixture',
      lighting(rig(OFF)),
      lighting({ ...rig(OFF), fixtures: [PAR, RELAY, { ...PAR, id: 'p2' }] }),
    ],
    ['dropping lighting', lighting(rig(OFF)), {}],
    ['creating lighting', {}, lighting({ fixtures: [PAR] })],
    [
      'cutting and changing a fixture at once',
      lighting(rig(ON)),
      lighting({ ...rig(OFF), fixtures: [PAR] }),
    ],
    [
      'cutting and changing a smoke setting at once',
      lighting(rig(ON)),
      lighting(rig({ ...OFF, cooldownMs: 5000 })),
    ],
    [
      'cutting and adding a smoke setting',
      lighting(rig(ON)),
      lighting(rig({ ...OFF, cutsOnSignalLoss: true })),
    ],
    [
      'cutting and changing a binding',
      lighting(rig(ON)),
      lighting({ ...rig(OFF), bindings: { buzz: 'fog-burst' } }),
    ],
    ['a non strict false when cutting', lighting(rig(ON)), lighting(rig({ ...ON, enabled: 0 }))],
    [
      'a cut that drops the smoke section',
      lighting(rig(ON)),
      lighting({ ...rig(ON), smoke: undefined }),
    ],
  ])('forbids %s', (_label, stored, incoming) => {
    expect(isLightingConfigChangeForbidden(stored, incoming)).toBe(true)
  })

  it.each([
    ['cutting the smoke, all the rest identical', lighting(rig(ON)), lighting(rig(OFF))],
    ['the same lighting, smoke enabled', lighting(rig(ON)), lighting(rig(ON))],
    ['the same lighting, smoke disabled', lighting(rig(OFF)), lighting(rig(OFF))],
    [
      'the same lighting with keys in another order',
      lighting(rig(ON)),
      lighting({
        bindings: { roundStart: 'intro' },
        smoke: ON,
        customProfiles: [PROGRESSIVE_SMOKE_PROFILE],
        fixtures: [PAR, RELAY],
      }),
    ],
    ['no lighting on both sides', { buzzers: {} }, { dmx: { universe: 1 } }],
    ['an empty lighting and no lighting', {}, { lighting: {} }],
    ['an unset stored config without lighting', undefined, {}],
    [
      'any change outside lighting next to the same lighting',
      { ...lighting(rig(ON)), buzzers: { podiums: 2 } },
      { ...lighting(rig(ON)), buzzers: { podiums: 4 }, desksCount: 5 },
    ],
    [
      'a cut next to a change outside lighting',
      { ...lighting(rig(ON)), desksCount: 4 },
      { ...lighting(rig(OFF)), desksCount: 6 },
    ],
  ])('allows %s', (_label, stored, incoming) => {
    expect(isLightingConfigChangeForbidden(stored, incoming)).toBe(false)
  })
})

function room(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: lighting(rig(OFF)),
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

type App = Awaited<ReturnType<typeof roomsApp>>

const FORBIDDEN = { error: 'smoke_config_forbidden' }
const staff: Array<[string, TestUser]> = [
  ['admin', companyAdminUser],
  ['superadmin', superadminUser],
]

describe('PATCH /companies/:companyId/rooms/:roomId — lighting guard', () => {
  const patch = (app: App, user: TestUser, payload: unknown) =>
    app.inject({
      method: 'PATCH',
      url: '/companies/1/rooms/1',
      headers: authHeaders(user),
      payload: payload as Record<string, unknown>,
    })

  const expectRefusedAndUntouched = async (
    stored: Record<string, unknown>,
    incoming: Record<string, unknown>,
    user: TestUser = companyAdminUser
  ) => {
    resetDb({ rooms: [room({ config: stored })] })
    const app = await roomsApp()

    const response = await patch(app, user, { config: incoming })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual(FORBIDDEN)
    expect(dbState.rooms[0]).toMatchObject({ config: stored, config_revision: 3 })

    await app.close()
  }

  it.each(staff)('refuses to enable the smoke, as %s, and writes nothing', async (_role, user) => {
    await expectRefusedAndUntouched(lighting(rig(OFF)), lighting(rig(ON)), user)
  })

  it.each(staff)('refuses a smoke setting change, as %s', async (_role, user) => {
    await expectRefusedAndUntouched(
      lighting(rig(ON)),
      lighting(rig({ ...ON, maxDurationMs: 9000 })),
      user
    )
  })

  it('refuses to enable the smoke on a room without stored config, and the name with it', async () => {
    resetDb({ rooms: [room({ config: {} })] })
    const app = await roomsApp()

    const response = await patch(app, superadminUser, {
      name: 'Autre',
      config: lighting({ smoke: ON }),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual(FORBIDDEN)
    expect(dbState.rooms[0]).toMatchObject({ name: 'Salle Néon', config: {}, config_revision: 3 })

    await app.close()
  })

  it('refuses to drop the confirmation requirement', async () => {
    await expectRefusedAndUntouched(
      lighting(rig(OFF)),
      lighting(rig({ ...OFF, requireConfirmation: false }))
    )
  })

  it('refuses to declare that the machine cuts on signal loss', async () => {
    await expectRefusedAndUntouched(
      lighting(rig(OFF)),
      lighting(rig({ ...OFF, cutsOnSignalLoss: true }))
    )
  })

  it('refuses a smoke relay turned into a plain fixture at the same address (scenario A)', async () => {
    await expectRefusedAndUntouched(lighting(rig(ON)), {
      lighting: { ...rig(ON), fixtures: [PAR, { ...RELAY, profileId: 'par-rgb' }] },
    })
  })

  it('refuses a smoke channel made binary (scenario B)', async () => {
    await expectRefusedAndUntouched(
      lighting({ ...rig(ON), fixtures: [{ ...RELAY, profileId: 'fog-x' }] }),
      {
        lighting: {
          ...rig(ON),
          fixtures: [{ ...RELAY, profileId: 'fog-x' }],
          customProfiles: [BINARY_SMOKE_PROFILE],
        },
      }
    )
  })

  it('refuses a fixture switched to the smoke relay profile (scenario B)', async () => {
    await expectRefusedAndUntouched(
      lighting({ ...rig(ON), fixtures: [{ ...RELAY, profileId: 'fog-x' }] }),
      { lighting: { ...rig(ON), fixtures: [{ ...RELAY, profileId: 'smoke-relay' }] } }
    )
  })

  it('refuses to bind a smoke scene to buzz', async () => {
    await expectRefusedAndUntouched(lighting(rig(ON)), {
      lighting: { ...rig(ON), bindings: { roundStart: 'intro', buzz: 'fog-burst' } },
    })
  })

  it('still refuses another company with the usual forbidden', async () => {
    resetDb({ rooms: [room({ id: 2, company_id: 2 })] })
    const app = await roomsApp()

    const response = await app.inject({
      method: 'PATCH',
      url: '/companies/2/rooms/2',
      headers: authHeaders(companyAdminUser),
      payload: { config: lighting(rig(ON)) },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it.each(staff)('lets %s cut the smoke from true to false', async (_role, user) => {
    resetDb({ rooms: [room({ config: lighting(rig(ON)) })] })
    const app = await roomsApp()

    const response = await patch(app, user, { config: lighting(rig(OFF)) })

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ room: { config: unknown } }>(response).room.config).toEqual(
      lighting(rig(OFF))
    )
    expect(dbState.rooms[0]).toMatchObject({ config: lighting(rig(OFF)), config_revision: 4 })

    await app.close()
  })

  it('lets a config return the same lighting while the rest changes', async () => {
    resetDb({ rooms: [room({ config: { ...lighting(rig(ON)), buzzers: { podiums: 2 } } })] })
    const app = await roomsApp()
    const config = { ...lighting(rig(ON)), buzzers: { podiums: 4 }, desksCount: 5 }

    const response = await patch(app, companyAdminUser, { config })

    expect(response.statusCode).toBe(200)
    expect(dbState.rooms[0]).toMatchObject({ config, config_revision: 4 })

    await app.close()
  })

  it('lets a PATCH without config through, even with the smoke enabled', async () => {
    resetDb({ rooms: [room({ config: lighting(rig(ON)) })] })
    const app = await roomsApp()

    const response = await patch(app, companyAdminUser, { name: 'Salle Laser' })

    expect(response.statusCode).toBe(200)
    expect(dbState.rooms[0]).toMatchObject({
      name: 'Salle Laser',
      config: lighting(rig(ON)),
      config_revision: 3,
    })

    await app.close()
  })

  it('answers 409 and writes nothing when the room screen changed the config meanwhile', async () => {
    resetDb({ rooms: [room({ config: lighting(rig(ON)) })] })
    const app = await roomsApp()
    const meanwhile = lighting(rig({ ...OFF, maxDurationMs: 1000 }))

    // L'écran de salle coupe puis règle la fumée entre la lecture et l'écriture : une config
    // identique à la lecture périmée ne doit pas la réactiver.
    db.fn.now.mockImplementationOnce(() => {
      dbState.rooms[0]!.config = meanwhile
      dbState.rooms[0]!.config_revision = 4

      return MOCK_NOW
    })

    const response = await patch(app, companyAdminUser, { config: lighting(rig(ON)) })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'room_config_conflict' })
    expect(dbState.rooms[0]).toMatchObject({ config: meanwhile, config_revision: 4 })

    await app.close()
  })
})

describe('POST /companies/:companyId/rooms — lighting guard', () => {
  const create = (app: App, user: TestUser, config: unknown) =>
    app.inject({
      method: 'POST',
      url: '/companies/1/rooms',
      headers: authHeaders(user),
      payload: { name: 'Salle Neuve', config } as Record<string, unknown>,
    })

  it.each(staff)('refuses a config with the smoke enabled, as %s', async (_role, user) => {
    const app = await roomsApp()

    const response = await create(app, user, lighting({ smoke: ON }))

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual(FORBIDDEN)
    expect(dbState.rooms).toHaveLength(0)

    await app.close()
  })

  it.each([
    ['disabled smoke settings', lighting({ smoke: OFF })],
    ['no confirmation requirement', lighting({ smoke: { ...OFF, requireConfirmation: false } })],
    ['a signal loss cut', lighting({ smoke: { ...OFF, cutsOnSignalLoss: true } })],
    ['a smoke relay fixture', lighting({ fixtures: [RELAY] })],
    ['a smoke scene binding', lighting({ bindings: { buzz: 'fog-burst' } })],
  ])('refuses any non empty lighting: %s', async (_label, config) => {
    const app = await roomsApp()

    const response = await create(app, companyAdminUser, config)

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual(FORBIDDEN)
    expect(dbState.rooms).toHaveLength(0)

    await app.close()
  })

  it('still creates a room with a config without lighting, or with an empty one', async () => {
    const app = await roomsApp()

    const withoutLighting = await create(app, companyAdminUser, { desksCount: 5 })
    const emptyLighting = await app.inject({
      method: 'POST',
      url: '/companies/1/rooms',
      headers: authHeaders(companyAdminUser),
      payload: { name: 'Salle Deux', config: { lighting: {} } },
    })

    expect(withoutLighting.statusCode).toBe(201)
    expect(emptyLighting.statusCode).toBe(201)
    expect(dbState.rooms).toHaveLength(2)

    await app.close()
  })

  it('still refuses another company with the usual forbidden', async () => {
    const app = await roomsApp()

    const response = await app.inject({
      method: 'POST',
      url: '/companies/2/rooms',
      headers: authHeaders(companyAdminUser),
      payload: { name: 'Salle Neuve', config: lighting({ smoke: ON }) },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })
})
