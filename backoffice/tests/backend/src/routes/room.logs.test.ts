import './_helpers/registerRouteMocks'

import roomLogsRoutes from '@backend/routes/room/logs'
import {
  ADMIN_ROLE_ROOM,
  ROOM_LOG_BATCH_MAX_ENTRIES,
  ROOM_LOG_MAX_PER_ROOM,
  ROOM_LOG_MESSAGE_MAX_LENGTH,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { db, dbState } from './_helpers/mockDb'
import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from './_helpers/testApp'

resetRouteMocksBeforeEach()

afterEach(() => {
  vi.useRealTimers()
  delete process.env.ROOM_LOG_RETENTION_DAYS
})

const roomUser = {
  sub: '10',
  id: 10,
  company_id: 1,
  role: ADMIN_ROLE_ROOM,
  room_id: 1,
  sid: 'sid-room',
} as TestUser

const otherCompanyRoomUser = {
  ...roomUser,
  sub: '11',
  id: 11,
  company_id: 2,
  room_id: 2,
  sid: 'sid-room-2',
} as TestUser

function seedRooms() {
  for (const [id, companyId] of [
    [1, 1],
    [2, 2],
  ] as const) {
    dbState.rooms.push({
      id,
      company_id: companyId,
      name: `Salle ${id}`,
      config: {},
      config_revision: 0,
      status: ROOM_STATUS_ACTIVE,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: null,
      deleted_at: null,
    })
  }
}

const PAST = '2020-01-01T10:00:00.000Z'

function entry(overrides: Record<string, unknown> = {}) {
  return {
    level: 'error',
    code: 'dmx_output_error',
    message: 'Interface DMX débranchée',
    occurredAt: PAST,
    ...overrides,
  }
}

function batch(overrides: Record<string, unknown> = {}) {
  return { appVersion: '1.2.3', entries: [entry()], ...overrides }
}

async function post(
  user: TestUser | null,
  payload: unknown,
  app?: Awaited<ReturnType<typeof createRouteApp>>
) {
  const instance = app ?? (await createRouteApp(roomLogsRoutes))
  const response = await instance.inject({
    method: 'POST',
    url: '/room/logs',
    headers: user ? authHeaders(user) : {},
    payload: payload as never,
  })

  if (!app) {
    await instance.close()
  }

  return response
}

describe('POST /room/logs', () => {
  it('stores the entries for the room of the token and answers 204', async () => {
    seedRooms()

    const response = await post(
      roomUser,
      batch({
        entries: [
          entry({ occurrences: 3, context: { route: 'play', phase: 'question', desk: 2 } }),
          entry({ level: 'warn', code: 'gamepad_lost', message: 'Manette perdue' }),
        ],
      })
    )

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(dbState.room_logs).toHaveLength(2)
    expect(dbState.room_logs[0]).toMatchObject({
      company_id: 1,
      room_id: 1,
      level: 'error',
      code: 'dmx_output_error',
      message: 'Interface DMX débranchée',
      context: { route: 'play', phase: 'question', desk: 2 },
      app_version: '1.2.3',
      occurrences: 3,
    })
    expect((dbState.room_logs[0]!.occurred_at as Date).toISOString()).toBe(PAST)
    // `mockDb` n'applique pas les valeurs par défaut : l'entrée sans `occurrences` reçoit 1 du serveur.
    expect(dbState.room_logs[1]).toMatchObject({ level: 'warn', occurrences: 1, context: null })
  })

  it('writes only for its own room, whatever the body says', async () => {
    seedRooms()

    const response = await post(
      otherCompanyRoomUser,
      batch({ roomId: 1, companyId: 1, entries: [entry({ roomId: 1, company_id: 1 })] })
    )

    expect(response.statusCode).toBe(204)
    expect(dbState.room_logs).toHaveLength(1)
    expect(dbState.room_logs[0]).toMatchObject({ company_id: 2, room_id: 2 })
    expect(dbState.room_logs.filter((row) => row.room_id === 1)).toHaveLength(0)
  })

  it('refuses a room whose id belongs to another company (404, nothing written)', async () => {
    seedRooms()

    const response = await post({ ...roomUser, room_id: 2 } as TestUser, batch())

    expect(response.statusCode).toBe(404)
    expect(dbState.room_logs).toHaveLength(0)
  })

  it('refuses a deleted room (404, nothing written)', async () => {
    seedRooms()
    dbState.rooms[0]!.status = ROOM_STATUS_DELETED

    const response = await post(roomUser, batch())

    expect(response.statusCode).toBe(404)
    expect(dbState.room_logs).toHaveLength(0)
  })

  it('masks e-mail addresses everywhere and keeps only the whitelisted context keys', async () => {
    seedRooms()

    const response = await post(
      roomUser,
      batch({
        appVersion: 'v1@lea@exemple.fr',
        entries: [
          entry({
            message: 'Envoi refusé pour lea.martin@exemple.fr (HTTP 400)',
            context: {
              route: '/play?email=lea@exemple.fr',
              driver: 'artnet',
              httpStatus: 400,
              email: 'lea@exemple.fr',
              displayName: 'Léa',
              nested: { desk: 1 },
              desk: Number.NaN,
              phase: '',
            },
          }),
        ],
      })
    )

    expect(response.statusCode).toBe(204)
    const [row] = dbState.room_logs

    expect(row).toMatchObject({
      message: 'Envoi refusé pour [email] (HTTP 400)',
      app_version: '[email]',
      context: { route: '[email]', driver: 'artnet', httpStatus: 400 },
    })
    expect(JSON.stringify(dbState.room_logs)).not.toContain('exemple.fr')
    expect(JSON.stringify(dbState.room_logs)).not.toContain('Léa')
  })

  it('masks before cutting: "[email]" is longer than a short address, the result stays within 300', async () => {
    seedRooms()
    // 298 caractères en entrée ; une fois « a@b » remplacé par « [email] », 302 avant la coupe.
    const message = `${'x'.repeat(ROOM_LOG_MESSAGE_MAX_LENGTH - 6)} a@b`

    const response = await post(roomUser, batch({ entries: [entry({ message })] }))

    const stored = dbState.room_logs[0]!.message as string

    expect(response.statusCode).toBe(204)
    expect(stored).toHaveLength(ROOM_LOG_MESSAGE_MAX_LENGTH)
    expect(stored).not.toContain('@')
  })

  it('does not date an entry in the future', async () => {
    seedRooms()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-23T12:00:00.000Z'))

    await post(roomUser, batch({ entries: [entry({ occurredAt: '2030-01-01T00:00:00.000Z' })] }))

    expect((dbState.room_logs[0]!.occurred_at as Date).toISOString()).toBe(
      '2026-11-23T12:00:00.000Z'
    )
  })

  it('cleans the room logs after the insertion, with the configured retention', async () => {
    seedRooms()
    process.env.ROOM_LOG_RETENTION_DAYS = '7'

    await post(roomUser, batch())

    const calls = db.raw.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM room_logs'))

    expect(calls).toHaveLength(1)
    expect(calls[0]![1]).toEqual([1, 7, 1, ROOM_LOG_MAX_PER_ROOM])
  })

  it.each([
    ['an empty batch', batch({ entries: [] })],
    ['no appVersion', { entries: [entry()] }],
    ['a blank appVersion', batch({ appVersion: '   ' })],
    ['an appVersion over 32 characters', batch({ appVersion: 'v'.repeat(33) })],
    [
      'too many entries',
      batch({ entries: Array.from({ length: ROOM_LOG_BATCH_MAX_ENTRIES + 1 }, () => entry()) }),
    ],
    ['an unknown level', batch({ entries: [entry({ level: 'info' })] })],
    ['a code that is not snake_case', batch({ entries: [entry({ code: 'DmxError' })] })],
    ['a code over 64 characters', batch({ entries: [entry({ code: 'a'.repeat(65) })] })],
    ['an empty message', batch({ entries: [entry({ message: '  ' })] })],
    ['a message over 300 characters', batch({ entries: [entry({ message: 'x'.repeat(301) })] })],
    ['zero occurrences', batch({ entries: [entry({ occurrences: 0 })] })],
    ['a fractional occurrences count', batch({ entries: [entry({ occurrences: 1.5 })] })],
    ['a date that is not ISO', batch({ entries: [entry({ occurredAt: 'hier' })] })],
    ['a context that is not an object', batch({ entries: [entry({ context: 'route=play' })] })],
    [
      'a context value over 256 characters',
      batch({ entries: [entry({ context: { route: 'a'.repeat(257) } })] }),
    ],
    [
      'a context value of 100 000 characters',
      batch({ entries: [entry({ context: { route: `${'a'.repeat(100_000)}@b` } })] }),
    ],
  ])('answers 400 invalid_body for %s', async (_name, payload) => {
    seedRooms()

    const response = await post(roomUser, payload)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    expect(dbState.room_logs).toHaveLength(0)
  })

  it('accepts the maximum batch of 50 entries', async () => {
    seedRooms()

    const response = await post(
      roomUser,
      batch({ entries: Array.from({ length: ROOM_LOG_BATCH_MAX_ENTRIES }, () => entry()) })
    )

    expect(response.statusCode).toBe(204)
    expect(dbState.room_logs).toHaveLength(ROOM_LOG_BATCH_MAX_ENTRIES)
  })

  it('answers 400 on a body that is not JSON', async () => {
    seedRooms()
    const app = await createRouteApp(roomLogsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/room/logs',
      headers: { ...authHeaders(roomUser), 'content-type': 'application/json' },
      payload: '{ pas du json',
    })

    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('answers 413 payload_too_large above 128 KB', async () => {
    seedRooms()

    const response = await post(roomUser, batch({ pad: 'x'.repeat(130 * 1024) }))

    expect(response.statusCode).toBe(413)
    expect(parseJson(response)).toEqual({ error: 'payload_too_large' })
    expect(dbState.room_logs).toHaveLength(0)
  })

  it('answers 429 too_many_requests after 6 batches a minute, per room', async () => {
    seedRooms()
    const app = await createRouteApp(roomLogsRoutes)

    for (let index = 0; index < 6; index += 1) {
      expect((await post(roomUser, batch(), app)).statusCode).toBe(204)
    }

    const refused = await post(roomUser, batch(), app)

    expect(refused.statusCode).toBe(429)
    expect(parseJson(refused)).toEqual({ error: 'too_many_requests' })
    expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    expect(dbState.room_logs).toHaveLength(6)

    // Une autre salle, même adresse : sa propre limite.
    expect((await post(otherCompanyRoomUser, batch(), app)).statusCode).toBe(204)

    await app.close()
  })

  it('counts invalid batches too', async () => {
    seedRooms()
    const app = await createRouteApp(roomLogsRoutes)

    for (let index = 0; index < 6; index += 1) {
      expect((await post(roomUser, { entries: [] }, app)).statusCode).toBe(400)
    }

    expect((await post(roomUser, batch(), app)).statusCode).toBe(429)

    await app.close()
  })

  it.each([
    ['superadmin', superadminUser],
    ['company admin', companyAdminUser],
    ['company user', companyUser],
  ])('is reserved to room accounts (%s gets 403)', async (_name, user) => {
    seedRooms()

    const response = await post(user, batch())

    expect(response.statusCode).toBe(403)
    expect(dbState.room_logs).toHaveLength(0)
  })

  it('answers 401 without a session', async () => {
    seedRooms()

    const response = await post(null, batch())

    expect(response.statusCode).toBe(401)
    expect(dbState.room_logs).toHaveLength(0)
  })
})
