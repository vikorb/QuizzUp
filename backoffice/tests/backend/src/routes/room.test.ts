import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import { ADMIN_ROLE_ROOM, ROOM_STATUS_ACTIVE, ROOM_STATUS_DELETED } from '@quizzup/shared'
import roomRoutes from '@backend/routes/room'
import { dbState } from './_helpers/mockDb'
import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  type TestUser,
} from './_helpers/testApp'

resetRouteMocksBeforeEach()

const roomUser = {
  sub: '10',
  id: 10,
  company_id: 1,
  role: ADMIN_ROLE_ROOM,
  room_id: 1,
  sid: 'sid-room',
} as TestUser

function seedRoom(overrides: Record<string, unknown> = {}) {
  dbState.rooms.push({
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: { buzzers: { podiums: 4 } },
    status: ROOM_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

describe('routes/room.ts (US-ROOM-02)', () => {
  it('returns the room and the company of a room account', async () => {
    seedRoom()
    const app = await createRouteApp(roomRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/room/me',
      headers: authHeaders(roomUser),
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toMatchObject({
      room: { id: 1, name: 'Salle Néon', config: { buzzers: { podiums: 4 } } },
      company: { id: 1, name: 'QuizzUp' },
    })

    await app.close()
  })

  it('is reserved to room accounts', async () => {
    seedRoom()
    const app = await createRouteApp(roomRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/room/me',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(403)

    await app.close()
  })

  it('hides a deleted room or a room of another company', async () => {
    seedRoom({ status: ROOM_STATUS_DELETED })
    seedRoom({ id: 2, company_id: 2 })
    const app = await createRouteApp(roomRoutes)

    const deleted = await app.inject({
      method: 'GET',
      url: '/room/me',
      headers: authHeaders(roomUser),
    })
    const otherCompany = await app.inject({
      method: 'GET',
      url: '/room/me',
      headers: authHeaders({ ...roomUser, room_id: 2 } as TestUser),
    })

    expect(deleted.statusCode).toBe(404)
    expect(otherCompany.statusCode).toBe(404)

    await app.close()
  })
})
