import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'
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

describe('routes/room.ts — current game (US-GAME-08)', () => {
  function seedGame(overrides: Record<string, unknown> = {}) {
    dbState.games.push({
      id: 5,
      company_id: 1,
      room_id: 1,
      admin_id: 2,
      rounds_count: 10,
      questions_per_round: 10,
      seed: '42',
      state: GAME_STATE_PENDING,
      started_at: null,
      finished_at: null,
      status: GAME_STATUS_ACTIVE,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: null,
      deleted_at: null,
      ...overrides,
    })
    dbState.game_participants.push({
      id: 1,
      game_id: 5,
      podium: 1,
      display_name: 'Léa',
      email: 'lea@exemple.fr',
      consent_at: '2026-11-01T00:00:00.000Z',
      score: 0,
    })
  }

  type CurrentBody = {
    game: (Record<string, unknown> & { participants: Array<Record<string, unknown>> }) | null
  }

  it('returns null when nothing was launched, the game otherwise, without emails', async () => {
    seedRoom()
    const app = await createRouteApp(roomRoutes)

    const empty = await app.inject({
      method: 'GET',
      url: '/room/games/current',
      headers: authHeaders(roomUser),
    })
    seedGame()
    const current = await app.inject({
      method: 'GET',
      url: '/room/games/current',
      headers: authHeaders(roomUser),
    })

    expect(parseJson<CurrentBody>(empty).game).toBeNull()
    const game = parseJson<CurrentBody>(current).game
    expect(game).toMatchObject({
      id: 5,
      seed: 42,
      state: GAME_STATE_PENDING,
      roomName: 'Salle Néon',
    })
    expect(game?.participants).toEqual([{ id: 1, podium: 1, displayName: 'Léa', score: 0 }])

    await app.close()
  })

  it('starts the pending game once and ignores finished games', async () => {
    seedRoom()
    seedGame()
    const app = await createRouteApp(roomRoutes)

    const started = await app.inject({
      method: 'POST',
      url: '/room/games/5/start',
      headers: authHeaders(roomUser),
    })
    const again = await app.inject({
      method: 'POST',
      url: '/room/games/5/start',
      headers: authHeaders(roomUser),
    })
    const wrongId = await app.inject({
      method: 'POST',
      url: '/room/games/6/start',
      headers: authHeaders(roomUser),
    })

    expect(parseJson<CurrentBody>(started).game).toMatchObject({ state: GAME_STATE_RUNNING })
    expect(again.statusCode).toBe(200)
    expect(wrongId.statusCode).toBe(404)

    dbState.games[0]!.state = GAME_STATE_FINISHED
    const finished = await app.inject({
      method: 'GET',
      url: '/room/games/current',
      headers: authHeaders(roomUser),
    })
    expect(parseJson<CurrentBody>(finished).game).toBeNull()

    await app.close()
  })

  it('is reserved to room accounts', async () => {
    const app = await createRouteApp(roomRoutes)

    const current = await app.inject({
      method: 'GET',
      url: '/room/games/current',
      headers: authHeaders(companyAdminUser),
    })
    const start = await app.inject({
      method: 'POST',
      url: '/room/games/5/start',
      headers: authHeaders(companyAdminUser),
    })

    expect(current.statusCode).toBe(403)
    expect(start.statusCode).toBe(403)

    await app.close()
  })
})

describe('routes/room.ts — hardware config', () => {
  const config = { version: 1, buzzers: { keymap: { KeyB: { desk: 1, button: 'A' } } } }

  it('saves the hardware config of the room account', async () => {
    seedRoom()
    const app = await createRouteApp(roomRoutes)

    const response = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config },
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toMatchObject({ room: { id: 1, config } })
    expect(dbState.rooms[0]?.config).toEqual(config)

    await app.close()
  })

  it('rejects an invalid or oversized config', async () => {
    seedRoom()
    const app = await createRouteApp(roomRoutes)

    for (const payload of [{ config: [1, 2] }, { config: { blob: 'x'.repeat(25_000) } }, {}]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/room/config',
        headers: authHeaders(roomUser),
        payload,
      })
      expect(response.statusCode).toBe(400)
    }

    await app.close()
  })

  it('is reserved to the room account of a live room', async () => {
    seedRoom({ status: ROOM_STATUS_DELETED })
    const app = await createRouteApp(roomRoutes)

    const staff = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(companyAdminUser),
      payload: { config },
    })
    const deleted = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config },
    })

    expect(staff.statusCode).toBe(403)
    expect(deleted.statusCode).toBe(404)

    await app.close()
  })
})
