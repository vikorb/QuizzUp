// Permissions et politique de compagnie réelles (pas de `registerRouteMocks`) : le test vérifie la
// matrice par rôle de bout en bout. Seule la base est simulée.
import '../../_helpers/registerDbMock'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  ROOM_LOG_LIST_DEFAULT_LIMIT,
  ROOM_LOG_LIST_MAX_LIMIT,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'
import companyRoomLogsRoutes from '@backend/routes/companies/rooms/logs'
import { dbState } from '../../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../../_helpers/testApp'

resetRouteMocksBeforeEach()

type LogsBody = { logs: Array<Record<string, unknown>> }

const otherCompanyAdmin = {
  ...companyAdminUser,
  id: 20,
  adminId: 20,
  sub: '20',
  company_id: 2,
  companyId: 2,
} as TestUser

const roomAccount = {
  sub: '10',
  id: 10,
  company_id: 1,
  role: ADMIN_ROLE_ROOM,
  room_id: 1,
  sid: 'sid-room',
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

let nextLogId = 1

function seedLog(overrides: Record<string, unknown> = {}) {
  dbState.room_logs.push({
    id: nextLogId++,
    company_id: 1,
    room_id: 1,
    level: 'error',
    code: 'dmx_output_error',
    message: 'Interface DMX débranchée',
    context: { driver: 'usbpro' },
    app_version: '1.2.3',
    occurrences: 2,
    occurred_at: '2026-11-20T10:00:00.000Z',
    created_at: '2026-11-20T10:00:05.000Z',
    ...overrides,
  })
}

async function get(user: TestUser | null, url: string) {
  const app = await createRouteApp(companyRoomLogsRoutes)
  const response = await app.inject({
    method: 'GET',
    url,
    headers: user ? authHeaders(user) : {},
  })

  await app.close()

  return response
}

const URL_ROOM_1 = '/companies/1/rooms/1/logs'

describe('GET /companies/:companyId/rooms/:roomId/logs', () => {
  it('lists the logs of the room, newest first, in the public shape', async () => {
    seedRooms()
    seedLog({ code: 'first' })
    seedLog({ code: 'second', level: 'warn', context: null, occurrences: 1 })

    const response = await get(companyAdminUser, URL_ROOM_1)

    expect(response.statusCode).toBe(200)
    const { logs } = parseJson<LogsBody>(response)

    expect(logs.map((log) => log.code)).toEqual(['second', 'first'])
    expect(logs[1]).toEqual({
      id: 1,
      level: 'error',
      code: 'first',
      message: 'Interface DMX débranchée',
      context: { driver: 'usbpro' },
      appVersion: '1.2.3',
      occurrences: 2,
      occurredAt: '2026-11-20T10:00:00.000Z',
      createdAt: '2026-11-20T10:00:05.000Z',
    })
    expect(logs[0]).toMatchObject({ level: 'warn', context: null })
  })

  it('answers an empty list for a room without logs', async () => {
    seedRooms()

    const response = await get(companyAdminUser, URL_ROOM_1)

    expect(response.statusCode).toBe(200)
    expect(parseJson<LogsBody>(response).logs).toEqual([])
  })

  it('filters by level', async () => {
    seedRooms()
    seedLog({ code: 'a' })
    seedLog({ code: 'b', level: 'warn' })

    const response = await get(companyAdminUser, `${URL_ROOM_1}?level=warn`)

    expect(parseJson<LogsBody>(response).logs.map((log) => log.code)).toEqual(['b'])
  })

  it('pages with before (the id of the last line read) and limit', async () => {
    seedRooms()
    for (const code of ['a', 'b', 'c', 'd']) {
      seedLog({ code })
    }

    const first = parseJson<LogsBody>(await get(companyAdminUser, `${URL_ROOM_1}?limit=2`))
    const lastId = first.logs[1]!.id
    const second = parseJson<LogsBody>(
      await get(companyAdminUser, `${URL_ROOM_1}?limit=2&before=${lastId}`)
    )

    expect(first.logs.map((log) => log.code)).toEqual(['d', 'c'])
    expect(second.logs.map((log) => log.code)).toEqual(['b', 'a'])
  })

  it('returns 100 lines by default and never more than 200', async () => {
    seedRooms()
    for (let index = 0; index < ROOM_LOG_LIST_MAX_LIMIT + 20; index += 1) {
      seedLog()
    }

    const byDefault = parseJson<LogsBody>(await get(companyAdminUser, URL_ROOM_1))
    const capped = parseJson<LogsBody>(await get(companyAdminUser, `${URL_ROOM_1}?limit=5000`))

    expect(byDefault.logs).toHaveLength(ROOM_LOG_LIST_DEFAULT_LIMIT)
    expect(capped.logs).toHaveLength(ROOM_LOG_LIST_MAX_LIMIT)
  })

  it.each([
    ['an unknown level', '?level=info'],
    ['an empty level', '?level='],
    ['a limit of 0', '?limit=0'],
    ['a limit that is not a number', '?limit=beaucoup'],
    ['a before that is not an id', '?before=-3'],
  ])('answers 400 invalid_query for %s', async (_name, query) => {
    seedRooms()

    const response = await get(companyAdminUser, `${URL_ROOM_1}${query}`)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_query' })
  })

  it('answers 400 invalid_params for an id that is not a number', async () => {
    seedRooms()

    const response = await get(companyAdminUser, '/companies/1/rooms/abc/logs')

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'invalid_params' })
  })

  it('answers 404 for an unknown room', async () => {
    seedRooms()

    const response = await get(companyAdminUser, '/companies/1/rooms/99/logs')

    expect(response.statusCode).toBe(404)
  })

  describe('one company never reads the logs of another', () => {
    it('refuses (403) the admin of company B on a room of company A', async () => {
      seedRooms()
      seedLog()

      const response = await get(otherCompanyAdmin, URL_ROOM_1)

      expect(response.statusCode).toBe(403)
      expect(response.body).not.toContain('dmx_output_error')
    })

    it('answers 404 when the room is in another company than the URL says', async () => {
      seedRooms()
      seedLog({ company_id: 2, room_id: 2, code: 'secret_of_b' })

      // Salle 2 (compagnie 2) demandée sous la compagnie 1 : l'admin de A passe la garde de
      // compagnie mais la salle n'est pas dans A.
      const response = await get(companyAdminUser, '/companies/1/rooms/2/logs')

      expect(response.statusCode).toBe(404)
      expect(response.body).not.toContain('secret_of_b')
    })

    it('shows each admin only the logs of their own room', async () => {
      seedRooms()
      seedLog({ code: 'of_a' })
      seedLog({ company_id: 2, room_id: 2, code: 'of_b' })

      const a = parseJson<LogsBody>(await get(companyAdminUser, URL_ROOM_1))
      const b = parseJson<LogsBody>(await get(otherCompanyAdmin, '/companies/2/rooms/2/logs'))

      expect(a.logs.map((log) => log.code)).toEqual(['of_a'])
      expect(b.logs.map((log) => log.code)).toEqual(['of_b'])
    })

    it('does not leak lines of another room through a row whose company differs', async () => {
      seedRooms()
      // Ligne incohérente : salle 1 mais compagnie 2. Le filtre de compagnie l'écarte.
      seedLog({ company_id: 2, code: 'wrong_company' })

      const response = await get(companyAdminUser, URL_ROOM_1)

      expect(parseJson<LogsBody>(response).logs).toEqual([])
    })

    it('lets the superadmin read any company', async () => {
      seedRooms()
      seedLog({ company_id: 2, room_id: 2, code: 'of_b' })

      const response = await get(superadminUser, '/companies/2/rooms/2/logs')

      expect(response.statusCode).toBe(200)
      expect(parseJson<LogsBody>(response).logs.map((log) => log.code)).toEqual(['of_b'])
    })
  })

  describe('role matrix', () => {
    it.each([
      ['superadmin', superadminUser, 200],
      ['admin of the company', companyAdminUser, 200],
      ['user of the company', { ...companyUser, company_id: 1, companyId: 1 } as TestUser, 403],
      ['room account', roomAccount, 403],
    ])('%s gets %i', async (_name, user, status) => {
      seedRooms()
      seedLog()

      const response = await get(user, URL_ROOM_1)

      expect(response.statusCode).toBe(status)

      if (status === 403) {
        expect(response.body).not.toContain('dmx_output_error')
      }
    })

    it('answers 401 without a session', async () => {
      seedRooms()

      expect((await get(null, URL_ROOM_1)).statusCode).toBe(401)
    })
  })

  describe('deleted room', () => {
    it('is hidden from the admin (404) but still readable by the superadmin', async () => {
      seedRooms()
      dbState.rooms[0]!.status = ROOM_STATUS_DELETED
      seedLog()

      expect((await get(companyAdminUser, URL_ROOM_1)).statusCode).toBe(404)
      expect((await get(superadminUser, URL_ROOM_1)).statusCode).toBe(200)
    })
  })
})
