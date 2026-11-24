import './_helpers/registerRouteMocks'

import roomRoutes from '@backend/routes/room'
import { qrSvg } from '@backend/utils/qrSvg'
import {
  ADMIN_ROLE_ROOM,
  GAME_STATE_ABORTED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  type RoomSchedule,
} from '@quizzup/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { db, dbState, lockedTables, MOCK_NOW } from './_helpers/mockDb'
import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  expectNobodyNotified,
  expectOnlyCompany1Notified,
  parseJson,
  type TestUser,
  watchGameUpdates,
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

const SCHEDULE: RoomSchedule = {
  timezone: 'Europe/Paris',
  slotMinutes: 60,
  breakMinutes: 15,
  bookableDesks: 4,
  publicBooking: true,
  days: { '1': { opensAt: '10:00', closesAt: '22:00' } },
}

/** Le `mockDb` n'applique pas les défauts de la base : `schedule` est posé explicitement. */
function seedRoom(overrides: Record<string, unknown> = {}) {
  dbState.rooms.push({
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: { buzzers: { podiums: 4 } },
    config_revision: 0,
    schedule: null,
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

  it('exposes the company logo url, or null without logo, and never the storage key', async () => {
    seedRoom()
    const app = await createRouteApp(roomRoutes)
    const read = async () =>
      parseJson<{ company: Record<string, unknown> }>(
        await app.inject({ method: 'GET', url: '/room/me', headers: authHeaders(roomUser) })
      ).company

    expect(await read()).toEqual({ id: 1, name: 'QuizzUp', logoUrl: null })

    Object.assign(dbState.companies[0] ?? {}, {
      logo_key: 'logos/11111111-1111-4111-8111-111111111111.png',
    })

    expect(await read()).toEqual({
      id: 1,
      name: 'QuizzUp',
      logoUrl: '/public/v1/logos/11111111-1111-4111-8111-111111111111.png',
    })

    await app.close()
  })

  it('returns the schedule settings of the room, null when there are none', async () => {
    seedRoom({ schedule: SCHEDULE })
    seedRoom({ id: 2, schedule: null })
    const app = await createRouteApp(roomRoutes)

    const withSchedule = await app.inject({
      method: 'GET',
      url: '/room/me',
      headers: authHeaders(roomUser),
    })
    const withoutSchedule = await app.inject({
      method: 'GET',
      url: '/room/me',
      headers: authHeaders({ ...roomUser, room_id: 2 } as TestUser),
    })

    expect(parseJson<{ room: { schedule: unknown } }>(withSchedule).room.schedule).toEqual(SCHEDULE)
    expect(parseJson<{ room: { schedule: unknown } }>(withoutSchedule).room.schedule).toBeNull()

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

  it('gives the room PC the mini-games chosen at launch, null meaning every one', async () => {
    seedRoom()
    seedGame({ mini_games: ['first_buzz', 'quick_answer'] })
    const app = await createRouteApp(roomRoutes)

    const restricted = await app.inject({
      method: 'GET',
      url: '/room/games/current',
      headers: authHeaders(roomUser),
    })
    dbState.games[0]!.mini_games = null
    const unrestricted = await app.inject({
      method: 'GET',
      url: '/room/games/current',
      headers: authHeaders(roomUser),
    })

    // Renvoyés dans l'ordre des codes partagés (quick_answer avant first_buzz).
    expect(parseJson<CurrentBody>(restricted).game?.miniGames).toEqual([
      'quick_answer',
      'first_buzz',
    ])
    expect(parseJson<CurrentBody>(unrestricted).game?.miniGames).toBeNull()

    await app.close()
  })

  describe('join link and pending registrations (lot 2)', () => {
    const TOKEN = 'a'.repeat(43)
    const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString()
    const read = async (app: Awaited<ReturnType<typeof createRouteApp>>) =>
      parseJson<CurrentBody>(
        await app.inject({
          method: 'GET',
          url: '/room/games/current',
          headers: authHeaders(roomUser),
        })
      ).game

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('puts the link and the number of pending registrations in game, never a name', async () => {
      vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test/')
      seedRoom()
      seedGame({ join_token: TOKEN, join_expires_at: inOneHour() })
      dbState.game_registrations.push(
        { id: 1, game_id: 5, display_name: 'Insulte', created_at: MOCK_NOW },
        { id: 2, game_id: 5, display_name: 'Autre', created_at: MOCK_NOW }
      )
      const app = await createRouteApp(roomRoutes)

      const response = await app.inject({
        method: 'GET',
        url: '/room/games/current',
        headers: authHeaders(roomUser),
      })
      const body = parseJson<CurrentBody>(response)

      expect(body.game).toMatchObject({
        join: {
          url: `https://bo.quizzup.test/rejoindre/#${TOKEN}`,
          qrSvg: qrSvg(`https://bo.quizzup.test/rejoindre/#${TOKEN}`),
        },
        pendingRegistrationsCount: 2,
      })
      expect(body).not.toHaveProperty('join')
      expect(response.body).not.toContain('Insulte')
      expect(response.body).not.toContain('join_token')

      await app.close()
    })

    it('has no link when none was opened, when it expired, or once the game runs', async () => {
      seedRoom()
      seedGame()
      const app = await createRouteApp(roomRoutes)

      expect(await read(app)).toMatchObject({ join: null, pendingRegistrationsCount: 0 })

      Object.assign(dbState.games[0]!, {
        join_token: TOKEN,
        join_expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      expect((await read(app))?.join).toBeNull()

      Object.assign(dbState.games[0]!, { join_expires_at: inOneHour(), state: GAME_STATE_RUNNING })
      expect(await read(app)).toMatchObject({ join: null, pendingRegistrationsCount: 0 })

      await app.close()
    })

    it('returns the running game first when a pending one waits in the room', async () => {
      seedRoom()
      seedGame({ id: 5, state: GAME_STATE_RUNNING })
      seedGame({ id: 6, state: GAME_STATE_PENDING })
      const app = await createRouteApp(roomRoutes)

      expect(await read(app)).toMatchObject({ id: 5, state: GAME_STATE_RUNNING })

      dbState.games[0]!.state = GAME_STATE_FINISHED
      expect(await read(app)).toMatchObject({ id: 6, state: GAME_STATE_PENDING })

      await app.close()
    })
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

  describe('game_updated on start', () => {
    const otherCompanyRoomUser = {
      ...roomUser,
      company_id: 2,
      room_id: 3,
      sid: 'sid-room-2',
    } as TestUser

    const startAs = async (user: TestUser, gameId = 5) => {
      seedRoom()
      seedGame()
      const app = await createRouteApp(roomRoutes)
      const updates = watchGameUpdates(app)
      const response = await app.inject({
        method: 'POST',
        url: `/room/games/${gameId}/start`,
        headers: authHeaders(user),
      })

      await app.close()

      return { response, updates }
    }

    it('tells the staff of the company and the room, by the game id only', async () => {
      const { response, updates } = await startAs(roomUser)

      expect(response.statusCode).toBe(200)
      expectOnlyCompany1Notified(updates, 5)
    })

    it('tells nobody when the game is not the room’s, or belongs to another company', async () => {
      const unknown = await startAs(roomUser, 6)
      dbState.games.length = 0
      dbState.rooms.length = 0
      const foreign = await startAs(otherCompanyRoomUser)

      expect(unknown.response.statusCode).toBe(404)
      expectNobodyNotified(unknown.updates)
      expect(foreign.response.statusCode).toBe(404)
      expectNobodyNotified(foreign.updates)
    })
  })

  describe('start with the desks loaded by the room', () => {
    async function start(podiums?: unknown) {
      seedRoom()
      seedGame()
      dbState.game_participants.push({
        id: 2,
        game_id: 5,
        podium: 2,
        display_name: 'Tom',
        score: 0,
      })
      const app = await createRouteApp(roomRoutes)
      const response = await app.inject({
        method: 'POST',
        url: '/room/games/5/start',
        headers: authHeaders(roomUser),
        ...(podiums === undefined ? {} : { payload: { podiums } }),
      })

      await app.close()

      return response
    }

    it('starts the game, under the game lock, when the desks are the stored ones', async () => {
      const response = await start([2, 1])

      expect(response.statusCode).toBe(200)
      expect(parseJson<CurrentBody>(response).game).toMatchObject({ state: GAME_STATE_RUNNING })
      expect(dbState.games[0]!.state).toBe(GAME_STATE_RUNNING)
      expect(lockedTables).toContain('games')
    })

    it('answers game_participants_changed when a stored desk is missing from the list', async () => {
      const response = await start([1])

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_participants_changed' })
      expect(dbState.games[0]!.state).toBe(GAME_STATE_PENDING)
    })

    it('answers game_participants_changed when the list has a desk nobody holds', async () => {
      const response = await start([1, 2, 3])

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_participants_changed' })
      expect(dbState.games[0]!.state).toBe(GAME_STATE_PENDING)
    })

    it('answers game_participants_changed for an empty list while players are stored', async () => {
      const response = await start([])

      expect(response.statusCode).toBe(409)
      expect(dbState.games[0]!.state).toBe(GAME_STATE_PENDING)
    })

    it('keeps the old behaviour without the field: no check, the game starts', async () => {
      const response = await start()

      expect(response.statusCode).toBe(200)
      expect(dbState.games[0]!.state).toBe(GAME_STATE_RUNNING)
    })

    it.each([[[0, 1]], [[1, 7]], [[1, 1]], [[1.5, 2]], [['1', '2']], ['1,2'], [null]])(
      'refuses the invalid desks %j and starts nothing',
      async (podiums) => {
        const response = await start(podiums)

        expect(response.statusCode).toBe(400)
        expect(parseJson<{ error: string }>(response).error).toBe('invalid_body')
        expect(dbState.games[0]!.state).toBe(GAME_STATE_PENDING)
      }
    )
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
    expect((await finish([{ podium: 1, score: 10 }])).statusCode).toBe(400)
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

  describe('game_updated on finish', () => {
    const finishAs = async (
      user: TestUser,
      state: string = GAME_STATE_RUNNING,
      scores: unknown = [{ podium: 1, score: 10 }],
      times = 1
    ) => {
      seedRoom()
      seedGame({ state })
      const app = await createRouteApp(roomRoutes)
      const updates = watchGameUpdates(app)
      let response!: Awaited<ReturnType<typeof app.inject>>

      for (let i = 0; i < times; i += 1) {
        response = await app.inject({
          method: 'POST',
          url: '/room/games/5/finish',
          headers: authHeaders(user),
          payload: { scores },
        })
      }

      await app.close()

      return { response, updates }
    }

    it('tells the staff of the company and the room, by the game id only', async () => {
      const { response, updates } = await finishAs(roomUser)

      expect(response.statusCode).toBe(200)
      expectOnlyCompany1Notified(updates, 5)
    })

    it('tells once only: a resend of a game already finished changes nothing', async () => {
      const { response, updates } = await finishAs(roomUser, GAME_STATE_RUNNING, undefined, 2)

      expect(response.statusCode).toBe(200)
      expect(updates.staff1).toEqual([{ gameId: 5 }])
      expect(updates.room1).toEqual([{ gameId: 5 }])
    })

    it('tells nobody when the scores are refused', async () => {
      const { response, updates } = await finishAs(roomUser, GAME_STATE_RUNNING, [
        { podium: 3, score: 1 },
      ])

      expect(response.statusCode).toBe(400)
      expectNobodyNotified(updates)
    })

    it('tells nobody when the game is already aborted', async () => {
      const { response, updates } = await finishAs(roomUser, GAME_STATE_ABORTED)

      expect(response.statusCode).toBe(409)
      expectNobodyNotified(updates)
    })

    it('tells nobody when the game belongs to another company', async () => {
      const { response, updates } = await finishAs({ ...roomUser, company_id: 2 } as TestUser)

      expect(response.statusCode).toBe(404)
      expectNobodyNotified(updates)
    })
  })

  it('finishes a game played on 6 pupitres', async () => {
    seedRoom()
    seedGame({ state: GAME_STATE_RUNNING })
    for (const podium of [2, 3, 4, 5, 6]) {
      dbState.game_participants.push({
        id: podium,
        game_id: 5,
        podium,
        display_name: `Joueur ${podium}`,
        score: 0,
      })
    }
    const app = await createRouteApp(roomRoutes)

    const finished = await app.inject({
      method: 'POST',
      url: '/room/games/5/finish',
      headers: authHeaders(roomUser),
      payload: {
        scores: [1, 2, 3, 4, 5, 6].map((podium) => ({ podium, score: podium * 100 })),
      },
    })
    const tooMany = await app.inject({
      method: 'POST',
      url: '/room/games/5/finish',
      headers: authHeaders(roomUser),
      payload: {
        scores: [1, 2, 3, 4, 5, 6, 7].map((podium) => ({ podium, score: 0 })),
      },
    })

    expect(finished.statusCode).toBe(200)
    expect(dbState.game_participants.map((row) => row.score)).toEqual([
      100, 200, 300, 400, 500, 600,
    ])
    expect(tooMany.statusCode).toBe(400)

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

    // Même salle n° 1, mais d'une autre compagnie : invisible.
    const otherCompany = await app.inject({
      method: 'POST',
      url: '/room/games/5/finish',
      headers: authHeaders({ ...roomUser, company_id: 2 } as TestUser),
      payload: { scores: [] },
    })

    expect(otherCompany.statusCode).toBe(404)

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

  it('returns the schedule in the answer of PUT /room/config and leaves it untouched', async () => {
    seedRoom({ schedule: SCHEDULE })
    const app = await createRouteApp(roomRoutes)

    const saved = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config: { desksCount: 3 } },
    })

    expect(saved.statusCode).toBe(200)
    expect(parseJson<{ room: { schedule: unknown } }>(saved).room.schedule).toEqual(SCHEDULE)
    expect(dbState.rooms[0]!.schedule).toEqual(SCHEDULE)

    await app.close()
  })

  it('still lets the room PC enable and set the smoke on site (the backoffice cannot)', async () => {
    const stored = { lighting: { smoke: { enabled: false, maxDurationMs: 3000 } } }
    seedRoom({ config: stored })
    const app = await createRouteApp(roomRoutes)
    const config = { lighting: { smoke: { enabled: true, maxDurationMs: 2000, restMs: 60_000 } } }

    const saved = await app.inject({
      method: 'PUT',
      url: '/room/config',
      headers: authHeaders(roomUser),
      payload: { config },
    })

    expect(saved.statusCode).toBe(200)
    expect(parseJson<{ room: { config: unknown } }>(saved).room.config).toEqual(config)

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

  it('stores the number of pupitres, from 1 to 6, and refuses the rest', async () => {
    seedRoom({ config: { buzzers: { keymap: {} } } })
    const app = await createRouteApp(roomRoutes)
    const save = (desksCount: unknown) =>
      app.inject({
        method: 'PUT',
        url: '/room/config',
        headers: authHeaders(roomUser),
        payload: { config: { desksCount } },
      })

    const six = await save(6)
    expect(six.statusCode).toBe(200)
    // Les autres sections sont gardées, `desksCount` est ajouté.
    expect(parseJson<{ room: { config: unknown } }>(six).room.config).toEqual({
      buzzers: { keymap: {} },
      desksCount: 6,
    })

    for (const invalid of [0, 7, 3.5, '4']) {
      expect((await save(invalid)).statusCode).toBe(400)
    }
    expect(dbState.rooms[0]!.config).toMatchObject({ desksCount: 6 })

    await app.close()
  })

  describe('config revision (writes from two PCs)', () => {
    type RoomBody = { room: { config: unknown; configRevision: number } }
    type ConflictBody = { error: string; config: unknown; configRevision: number }

    const put = (app: Awaited<ReturnType<typeof createRouteApp>>, payload: unknown) =>
      app.inject({
        method: 'PUT',
        url: '/room/config',
        headers: authHeaders(roomUser),
        payload: payload as Record<string, unknown>,
      })

    it('returns the revision with /room/me', async () => {
      seedRoom({ config_revision: 7 })
      const app = await createRouteApp(roomRoutes)

      const me = await app.inject({
        method: 'GET',
        url: '/room/me',
        headers: authHeaders(roomUser),
      })

      expect(parseJson<RoomBody>(me).room.configRevision).toBe(7)

      await app.close()
    })

    it('writes when the revision is current and returns the next one', async () => {
      seedRoom({ config_revision: 3 })
      const app = await createRouteApp(roomRoutes)

      const first = await put(app, { config: { desksCount: 5 }, revision: 3 })
      const second = await put(app, { config: { desksCount: 6 }, revision: 4 })

      expect(first.statusCode).toBe(200)
      expect(parseJson<RoomBody>(first).room.configRevision).toBe(4)
      expect(second.statusCode).toBe(200)
      expect(parseJson<RoomBody>(second).room.configRevision).toBe(5)
      expect(dbState.rooms[0]).toMatchObject({ config_revision: 5, config: { desksCount: 6 } })

      await app.close()
    })

    it('answers 409 with the current config on a stale revision, and writes nothing', async () => {
      const stored = { buzzers: { podiums: 4 }, lights: { profile: 'par-led' } }
      seedRoom({ config: stored, config_revision: 5 })
      const app = await createRouteApp(roomRoutes)

      const stale = await put(app, { config: { desksCount: 2 }, revision: 4 })

      expect(stale.statusCode).toBe(409)
      expect(parseJson<ConflictBody>(stale)).toEqual({
        error: 'room_config_conflict',
        config: stored,
        configRevision: 5,
      })
      expect(dbState.rooms[0]).toMatchObject({ config: stored, config_revision: 5 })

      await app.close()
    })

    it('still overwrites and bumps the revision when the client sends none', async () => {
      seedRoom({ config_revision: 9 })
      const app = await createRouteApp(roomRoutes)

      const legacy = await put(app, { config: { desksCount: 3 } })

      expect(legacy.statusCode).toBe(200)
      expect(parseJson<RoomBody>(legacy).room.configRevision).toBe(10)
      expect(dbState.rooms[0]).toMatchObject({ config_revision: 10 })

      await app.close()
    })

    it('answers 409 when the revision is ahead of the stored one, and writes nothing', async () => {
      seedRoom({ config_revision: 2 })
      const app = await createRouteApp(roomRoutes)

      const ahead = await put(app, { config: { desksCount: 6 }, revision: 5 })

      expect(ahead.statusCode).toBe(409)
      expect(parseJson<ConflictBody>(ahead)).toMatchObject({ configRevision: 2 })
      expect(dbState.rooms[0]).toMatchObject({
        config_revision: 2,
        config: { buzzers: { podiums: 4 } },
      })

      await app.close()
    })

    it('answers 404 for a revision write on a deleted room', async () => {
      seedRoom({ status: ROOM_STATUS_DELETED, config_revision: 1 })
      const app = await createRouteApp(roomRoutes)

      expect((await put(app, { config: {}, revision: 1 })).statusCode).toBe(404)
      expect((await put(app, { config: {} })).statusCode).toBe(404)

      await app.close()
    })

    // Un `PATCH` du backoffice passe entre la lecture et l'écriture : simulé dans `db.fn.now()`,
    // appelé juste avant l'UPDATE.
    function patchBeforeWrite() {
      db.fn.now.mockImplementationOnce(() => {
        dbState.rooms[0]!.config = { lights: { profile: 'par-led' } }
        dbState.rooms[0]!.config_revision = Number(dbState.rooms[0]!.config_revision) + 1

        return MOCK_NOW
      })
    }

    it('without revision, redoes the merge once on the config written meanwhile', async () => {
      seedRoom({ config: { buzzers: { podiums: 2 } }, config_revision: 1 })
      const app = await createRouteApp(roomRoutes)
      patchBeforeWrite()

      const legacy = await put(app, { config: { desksCount: 3 } })

      expect(legacy.statusCode).toBe(200)
      // Le PATCH du backoffice (`lights`) n'est pas annulé.
      expect(parseJson<RoomBody>(legacy).room).toMatchObject({
        config: { lights: { profile: 'par-led' }, desksCount: 3 },
        configRevision: 3,
      })

      await app.close()
    })

    it('without revision, answers 409 when the second write also loses the race', async () => {
      seedRoom({ config_revision: 1 })
      const app = await createRouteApp(roomRoutes)
      patchBeforeWrite()
      patchBeforeWrite()

      const legacy = await put(app, { config: { desksCount: 3 } })

      expect(legacy.statusCode).toBe(409)
      expect(parseJson<ConflictBody>(legacy)).toMatchObject({ configRevision: 3 })

      await app.close()
    })

    it('with a revision, answers 409 when the config changes before the write', async () => {
      seedRoom({ config_revision: 1 })
      const app = await createRouteApp(roomRoutes)
      patchBeforeWrite()

      const raced = await put(app, { config: { desksCount: 3 }, revision: 1 })

      expect(raced.statusCode).toBe(409)
      expect(parseJson<ConflictBody>(raced)).toEqual({
        error: 'room_config_conflict',
        config: { lights: { profile: 'par-led' } },
        configRevision: 2,
      })
      expect(dbState.rooms[0]).toMatchObject({ config_revision: 2 })

      await app.close()
    })

    it('refuses a negative or non integer revision', async () => {
      seedRoom()
      const app = await createRouteApp(roomRoutes)

      for (const revision of [-1, 1.5, '1']) {
        expect((await put(app, { config: {}, revision })).statusCode).toBe(400)
      }

      await app.close()
    })
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
