import './_helpers/registerRouteMocks'

import roomRoutes from '@backend/routes/room'
import {
  ADMIN_ROLE_ROOM,
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_INACTIVE,
  GAME_STATE_CANCELLED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_ACTIVE,
  GAME_STATUS_DELETED,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState } from './_helpers/mockDb'
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

const NOW = new Date('2027-03-10T12:00:00.000Z')
const STARTS_AT = '2027-03-10T13:00:00.000Z'
const ENDS_AT = '2027-03-10T14:00:00.000Z'

type RoomGameBody = {
  game: (Record<string, unknown> & { participants: Array<Record<string, unknown>> }) | null
  next?: (Record<string, unknown> & { participants: Array<Record<string, unknown>> }) | null
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seedRoom()
})

afterEach(() => {
  vi.useRealTimers()
})

function seedRoom(overrides: Record<string, unknown> = {}) {
  dbState.rooms.push({
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: {},
    config_revision: 0,
    schedule: null,
    status: ROOM_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

/** Une session programmée de 14:00 à 15:00 à Paris (13:00-14:00 UTC), avec un participant. */
function seedSession(id: number, overrides: Record<string, unknown> = {}) {
  dbState.games.push({
    id,
    company_id: 1,
    room_id: 1,
    admin_id: 2,
    rounds_count: 10,
    questions_per_round: 10,
    mini_games: null,
    seed: 42,
    state: GAME_STATE_SCHEDULED,
    started_at: null,
    finished_at: null,
    scheduled_at: STARTS_AT,
    scheduled_end_at: ENDS_AT,
    cancelled_at: null,
    players_count: null,
    external_ref: null,
    locale: null,
    status: GAME_STATUS_ACTIVE,
    created_at: '2027-03-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
  dbState.game_participants.push({
    id: id * 10,
    game_id: id,
    podium: 1,
    display_name: `Léa ${id}`,
    email: 'lea@exemple.fr',
    consent_at: '2027-03-01T00:00:00.000Z',
    second_display_name: null,
    second_email: null,
    score: 0,
  })
}

const getCurrent = async (app: Awaited<ReturnType<typeof createRouteApp>>, user = roomUser) =>
  app.inject({ method: 'GET', url: '/room/games/current', headers: authHeaders(user) })

const open = (
  app: Awaited<ReturnType<typeof createRouteApp>>,
  gameId: number | string,
  user: TestUser = roomUser
) => app.inject({ method: 'POST', url: `/room/games/${gameId}/open`, headers: authHeaders(user) })

describe('GET /room/games/current — next session', () => {
  it('returns null for next when nothing is scheduled', async () => {
    const app = await createRouteApp(roomRoutes)

    const response = await getCurrent(app)

    expect(response.statusCode).toBe(200)
    expect(parseJson<RoomGameBody>(response)).toEqual({ game: null, next: null })

    await app.close()
  })

  it('returns the nearest scheduled session of the room, without emails', async () => {
    seedSession(1, {
      scheduled_at: '2027-03-10T15:00:00.000Z',
      scheduled_end_at: '2027-03-10T16:00:00.000Z',
    })
    seedSession(2)
    const app = await createRouteApp(roomRoutes)

    const response = await getCurrent(app)

    const { game, next } = parseJson<RoomGameBody>(response)
    expect(game).toBeNull()
    expect(next).toMatchObject({
      id: 2,
      state: GAME_STATE_SCHEDULED,
      roomName: 'Salle Néon',
      scheduledAt: STARTS_AT,
      scheduledEndAt: ENDS_AT,
    })
    expect(next?.participants).toEqual([
      { id: 20, podium: 1, displayName: 'Léa 2', secondDisplayName: null, score: 0 },
    ])
    expect(response.body).not.toContain('@exemple.fr')

    await app.close()
  })

  it('keeps a session that is late but whose slot is not over, and skips one that is over', async () => {
    seedSession(1)
    const app = await createRouteApp(roomRoutes)

    vi.setSystemTime(new Date('2027-03-10T13:30:00.000Z'))
    const late = parseJson<RoomGameBody>(await getCurrent(app)).next
    vi.setSystemTime(new Date('2027-03-10T14:00:00.000Z'))
    const over = parseJson<RoomGameBody>(await getCurrent(app)).next

    expect(late).toMatchObject({ id: 1 })
    expect(over).toBeNull()

    await app.close()
  })

  it('ignores cancelled, already opened and deleted sessions', async () => {
    seedSession(1, { state: GAME_STATE_CANCELLED })
    seedSession(2, { state: GAME_STATE_PENDING })
    seedSession(3, { status: GAME_STATUS_DELETED })
    const app = await createRouteApp(roomRoutes)

    const body = parseJson<RoomGameBody>(await getCurrent(app))

    expect(body.next).toBeNull()
    expect(body.game).toMatchObject({ id: 2, state: GAME_STATE_PENDING })

    await app.close()
  })

  it('never shows the session of another room or of another company', async () => {
    seedRoom({ id: 2, name: 'Autre salle' })
    seedRoom({ id: 3, company_id: 2, name: 'Autre compagnie' })
    seedSession(1, { room_id: 2 })
    seedSession(2, { company_id: 2, room_id: 3 })
    // Même identifiant de salle que le compte, mais une autre compagnie : jamais visible.
    seedSession(3, { company_id: 2, room_id: 1 })
    const app = await createRouteApp(roomRoutes)

    const own = parseJson<RoomGameBody>(await getCurrent(app))
    const other = parseJson<RoomGameBody>(
      await getCurrent(app, { ...roomUser, room_id: 2 } as TestUser)
    )

    expect(own.next).toBeNull()
    expect(other.next).toMatchObject({ id: 1, roomName: 'Autre salle' })

    await app.close()
  })

  it('skips an earlier session of another company in the same room id and returns the own one', async () => {
    seedSession(1, { company_id: 2, room_id: 1 })
    seedSession(2, {
      scheduled_at: '2027-03-10T15:00:00.000Z',
      scheduled_end_at: '2027-03-10T16:00:00.000Z',
    })
    const app = await createRouteApp(roomRoutes)

    const { next } = parseJson<RoomGameBody>(await getCurrent(app))

    expect(next).toMatchObject({ id: 2 })

    await app.close()
  })

  it.each([
    ['pending', GAME_STATE_PENDING],
    ['running', GAME_STATE_RUNNING],
  ])('returns a %s game together with the next scheduled session', async (_label, state) => {
    seedSession(1, { state, scheduled_at: null, scheduled_end_at: null })
    seedSession(2)
    const app = await createRouteApp(roomRoutes)

    const response = await getCurrent(app)

    const { game, next } = parseJson<RoomGameBody>(response)
    expect(response.statusCode).toBe(200)
    expect(game).toMatchObject({ id: 1, state })
    expect(next).toMatchObject({ id: 2, state: GAME_STATE_SCHEDULED })

    await app.close()
  })

  it('refuses an account that is not a room account', async () => {
    const app = await createRouteApp(roomRoutes)

    expect((await getCurrent(app, companyAdminUser)).statusCode).toBe(403)

    await app.close()
  })
})

describe('POST /room/games/:gameId/open', () => {
  beforeEach(() => {
    seedSession(1)
  })

  it('opens the session of the room an hour before it starts and returns it, without emails', async () => {
    vi.setSystemTime(new Date('2027-03-10T12:00:00.000Z'))
    const app = await createRouteApp(roomRoutes)

    const response = await open(app, 1)

    expect(response.statusCode).toBe(200)
    expect(parseJson<RoomGameBody>(response).game).toMatchObject({
      id: 1,
      state: GAME_STATE_PENDING,
      participants: [{ podium: 1, displayName: 'Léa 1' }],
    })
    expect(response.body).not.toContain('@exemple.fr')
    expect(dbState.games[0]!.state).toBe(GAME_STATE_PENDING)

    // La partie ouverte est maintenant la partie courante de la salle.
    expect(parseJson<RoomGameBody>(await getCurrent(app)).game).toMatchObject({ id: 1 })

    await app.close()
  })

  it('game_updated: tells the staff of the company and the room only once the session is open', async () => {
    const app = await createRouteApp(roomRoutes)
    const updates = watchGameUpdates(app)

    vi.setSystemTime(new Date('2027-03-10T11:59:00.000Z'))
    expect((await open(app, 1)).statusCode).toBe(409)
    expectNobodyNotified(updates)

    vi.setSystemTime(new Date('2027-03-10T12:00:00.000Z'))
    expect((await open(app, 1)).statusCode).toBe(200)
    expectOnlyCompany1Notified(updates, 1)

    await app.close()
  })

  it('game_updated: tells nobody when a room of another company tries to open it', async () => {
    vi.setSystemTime(new Date('2027-03-10T12:00:00.000Z'))
    const app = await createRouteApp(roomRoutes)
    const updates = watchGameUpdates(app)

    const response = await open(app, 1, {
      ...roomUser,
      company_id: 2,
      room_id: 3,
      sid: 'sid-room-2',
    } as TestUser)

    expect(response.statusCode).toBe(404)
    expectNobodyNotified(updates)

    await app.close()
  })

  it('refuses to open more than an hour before the start', async () => {
    vi.setSystemTime(new Date('2027-03-10T11:59:00.000Z'))
    const app = await createRouteApp(roomRoutes)

    const response = await open(app, 1)

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'session_not_open_yet' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)

    await app.close()
  })

  // La compagnie n'est lue qu'une fois la partie lue, avant l'UPDATE : on y simule une autre requête.
  function changeGameDuringOpen(change: Record<string, unknown>) {
    Object.defineProperty(dbState.companies[0]!, 'status', {
      configurable: true,
      get() {
        Object.assign(dbState.games[0]!, change)

        return COMPANY_STATUS_ACTIVE
      },
    })
  }

  it('answers session_not_open_yet when the start is pushed back after the window check', async () => {
    vi.setSystemTime(new Date('2027-03-10T12:30:00.000Z'))
    changeGameDuringOpen({ scheduled_at: '2027-03-10T15:00:00.000Z' })
    const app = await createRouteApp(roomRoutes)

    const response = await open(app, 1)

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'session_not_open_yet' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)

    await app.close()
  })

  it('answers game_not_scheduled when the session is cancelled after the window check', async () => {
    vi.setSystemTime(new Date('2027-03-10T12:30:00.000Z'))
    changeGameDuringOpen({ state: GAME_STATE_CANCELLED })
    const app = await createRouteApp(roomRoutes)

    const response = await open(app, 1)

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'game_not_scheduled' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_CANCELLED)

    await app.close()
  })

  it('opens a session late, after its slot', async () => {
    vi.setSystemTime(new Date('2027-03-10T20:00:00.000Z'))
    const app = await createRouteApp(roomRoutes)

    expect((await open(app, 1)).statusCode).toBe(200)

    await app.close()
  })

  it('opens only once: the second call changes nothing and creates no second game', async () => {
    const app = await createRouteApp(roomRoutes)

    const first = await open(app, 1)
    const second = await open(app, 1)

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(409)
    expect(parseJson(second)).toEqual({ error: 'game_not_scheduled' })
    expect(dbState.games).toHaveLength(1)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_PENDING)

    await app.close()
  })

  it('answers room_busy while a game of the room is already pending', async () => {
    seedSession(2, { state: GAME_STATE_PENDING, scheduled_at: null, scheduled_end_at: null })
    const app = await createRouteApp(roomRoutes)

    const response = await open(app, 1)

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'room_busy' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)

    await app.close()
  })

  it('opens while another game of the room is running (arbitrage 4)', async () => {
    seedSession(2, { state: GAME_STATE_RUNNING, scheduled_at: null, scheduled_end_at: null })
    const app = await createRouteApp(roomRoutes)

    const response = await open(app, 1)

    expect(response.statusCode).toBe(200)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_PENDING)

    await app.close()
  })

  it('refuses an inactive room or an inactive company', async () => {
    const app = await createRouteApp(roomRoutes)

    dbState.rooms[0]!.status = ROOM_STATUS_INACTIVE
    const inactiveRoom = await open(app, 1)
    dbState.rooms[0]!.status = ROOM_STATUS_ACTIVE
    dbState.companies[0]!.status = COMPANY_STATUS_INACTIVE
    const inactiveCompany = await open(app, 1)

    expect(inactiveRoom.statusCode).toBe(409)
    expect(parseJson(inactiveRoom)).toEqual({ error: 'room_inactive' })
    expect(inactiveCompany.statusCode).toBe(409)
    expect(parseJson(inactiveCompany)).toEqual({ error: 'company_inactive' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)

    await app.close()
  })

  it('refuses a cancelled session', async () => {
    dbState.games[0]!.state = GAME_STATE_CANCELLED
    const app = await createRouteApp(roomRoutes)

    const response = await open(app, 1)

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'game_not_scheduled' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_CANCELLED)

    await app.close()
  })

  it('answers 404 for an unknown or deleted game and 400 for a bad id', async () => {
    const app = await createRouteApp(roomRoutes)

    expect((await open(app, 99)).statusCode).toBe(404)
    dbState.games[0]!.status = GAME_STATUS_DELETED
    expect((await open(app, 1)).statusCode).toBe(404)
    expect((await open(app, 'abc')).statusCode).toBe(400)

    await app.close()
  })

  it('cannot open the session of another room', async () => {
    seedRoom({ id: 2, name: 'Autre salle' })
    seedSession(2, { room_id: 2 })
    const app = await createRouteApp(roomRoutes)

    const response = await open(app, 2)

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'game_not_found' })
    expect(dbState.games[1]!.state).toBe(GAME_STATE_SCHEDULED)

    await app.close()
  })

  it('cannot open the session of another company, even with the same room id', async () => {
    seedRoom({ id: 3, company_id: 2, name: 'Autre compagnie' })
    seedSession(2, { company_id: 2, room_id: 3 })
    seedSession(3, { company_id: 2, room_id: 1 })
    const app = await createRouteApp(roomRoutes)

    const otherRoom = await open(app, 2)
    const sameRoomId = await open(app, 3)

    expect(otherRoom.statusCode).toBe(404)
    expect(sameRoomId.statusCode).toBe(404)
    expect(dbState.games[1]!.state).toBe(GAME_STATE_SCHEDULED)
    expect(dbState.games[2]!.state).toBe(GAME_STATE_SCHEDULED)

    await app.close()
  })

  it('refuses an account that is not a room account, and anonymous calls', async () => {
    const app = await createRouteApp(roomRoutes)

    const staff = await open(app, 1, companyAdminUser)
    const anonymous = await app.inject({ method: 'POST', url: '/room/games/1/open' })

    expect(staff.statusCode).toBe(403)
    expect(anonymous.statusCode).toBe(401)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)

    await app.close()
  })
})
