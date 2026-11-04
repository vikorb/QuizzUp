import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  GAME_STATE_ABORTED,
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
    expect(game?.participants).toEqual([
      { id: 1, podium: 1, displayName: 'Léa', secondDisplayName: null, score: 0 },
    ])

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

  it('finishes the game with the desk scores, once', async () => {
    seedRoom()
    seedGame({ state: GAME_STATE_RUNNING })
    dbState.game_participants.push({
      id: 2,
      game_id: 5,
      podium: 2,
      display_name: 'Tom',
      score: 0,
    })
    const app = await createRouteApp(roomRoutes)
    const finish = (scores: unknown, gameId = 5) =>
      app.inject({
        method: 'POST',
        url: `/room/games/${gameId}/finish`,
        headers: authHeaders(roomUser),
        payload: { scores },
      })

    const unknownDesk = await finish([{ podium: 3, score: 10 }])
    const duplicated = await finish([
      { podium: 1, score: 10 },
      { podium: 1, score: 20 },
    ])

    expect(unknownDesk.statusCode).toBe(400)
    expect(parseJson(unknownDesk)).toEqual({ error: 'game_scores_invalid' })
    expect(duplicated.statusCode).toBe(400)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_RUNNING)

    const finished = await finish([
      { podium: 1, score: 1200 },
      { podium: 2, score: 300 },
    ])

    expect(finished.statusCode).toBe(200)
    expect(parseJson<CurrentBody>(finished).game).toMatchObject({
      id: 5,
      state: GAME_STATE_FINISHED,
    })
    expect(dbState.games[0]!.finished_at).not.toBeNull()
    expect(dbState.game_participants.map((row) => row.score)).toEqual([1200, 300])

    // Renvoi (réseau coupé au retour) : rien ne change, les premiers scores restent.
    const again = await finish([{ podium: 1, score: 0 }])

    expect(again.statusCode).toBe(200)
    expect(dbState.game_participants.map((row) => row.score)).toEqual([1200, 300])
    expect((await finish([], 6)).statusCode).toBe(404)
    expect((await finish('nope')).statusCode).toBe(400)

    await app.close()
  })

  it('refuses to finish an aborted game or a game of another room', async () => {
    seedRoom()
    seedGame({ state: GAME_STATE_ABORTED })
    const app = await createRouteApp(roomRoutes)

    const aborted = await app.inject({
      method: 'POST',
      url: '/room/games/5/finish',
      headers: authHeaders(roomUser),
      payload: { scores: [] },
    })
    const otherRoom = await app.inject({
      method: 'POST',
      url: '/room/games/5/finish',
      headers: authHeaders({ ...roomUser, room_id: 2 } as TestUser),
      payload: { scores: [] },
    })

    expect(aborted.statusCode).toBe(409)
    expect(parseJson(aborted)).toEqual({ error: 'game_already_over' })
    expect(otherRoom.statusCode).toBe(404)

    await app.close()
  })

  it('is reserved to room accounts', async () => {
    const app = await createRouteApp(roomRoutes)

    const finish = await app.inject({
      method: 'POST',
      url: '/room/games/5/finish',
      headers: authHeaders(companyAdminUser),
      payload: { scores: [] },
    })

    expect(finish.statusCode).toBe(403)

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
  it('lets the room PC save its hardware config, read back by /room/me', async () => {
    seedRoom()
    const app = await createRouteApp(roomRoutes)
    const config = {
      buzzers: { podiums: 4, keys: { '1': ['a', 'z', 'e', 'r'] } },
      dmx: { universe: 1 },
    }

    const saved = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config },
    })
    const me = await app.inject({ method: 'GET', url: '/room/me', headers: authHeaders(roomUser) })

    expect(saved.statusCode).toBe(200)
    expect(parseJson<{ room: { config: unknown } }>(saved).room.config).toEqual(config)
    expect(parseJson<{ room: { config: unknown } }>(me).room.config).toEqual(config)

    await app.close()
  })

  it('keeps the sections the PC does not send, like the backoffice lights', async () => {
    seedRoom({ config: { lights: { profile: 'par-led' }, buzzers: { podiums: 2 } } })
    const app = await createRouteApp(roomRoutes)

    const saved = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config: { buzzers: { podiums: 4 } } },
    })
    const tooLarge = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config: { smoke: 'x'.repeat(19_960) } },
    })

    expect(parseJson<{ room: { config: unknown } }>(saved).room.config).toEqual({
      lights: { profile: 'par-led' },
      buzzers: { podiums: 4 },
    })
    expect(tooLarge.statusCode).toBe(400)
    expect(parseJson(tooLarge)).toEqual({ error: 'room_config_too_large' })

    await app.close()
  })

  it('validates the config and is reserved to a non deleted room', async () => {
    seedRoom()
    const app = await createRouteApp(roomRoutes)

    const invalid = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config: 'texte' },
    })
    const tooLarge = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config: { blob: 'x'.repeat(20_001) } },
    })
    const staff = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(companyAdminUser),
      payload: { config: {} },
    })
    dbState.rooms[0]!.status = ROOM_STATUS_DELETED
    const deleted = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config: {} },
    })

    expect(invalid.statusCode).toBe(400)
    expect(tooLarge.statusCode).toBe(400)
    expect(staff.statusCode).toBe(403)
    expect(deleted.statusCode).toBe(404)

    await app.close()
  })
})
