import './_helpers/registerDbMock'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  GAME_COMMAND_REFUSAL,
  GAME_COMMAND_REFUSALS,
  LIVE_EVENT,
  LIVE_HEARTBEAT_MS,
  LIVE_STATUS_EVERY_MS,
  ROOM_COMMAND_RESULT,
  ROOM_COMMAND_TIMEOUT_MS,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  ROOM_STATUS_INACTIVE,
  type RoomCommandMessage,
  type RoomCommandResultMessage,
  type RoomDiagnostics,
  type RoomLive,
  type RoomStatusReport,
} from '@quizzup/shared'
import { COMMAND_MAX_PER_ROOM } from '@backend/live/hub'
import liveRoutes from '@backend/routes/live'
import { dbState, MOCK_NOW, resetDb } from './_helpers/mockDb'
import { openSse, type SseClient } from './_helpers/sse'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  liveHubOf,
  superadminUser,
  type TestUser,
} from './_helpers/testApp'

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
  room_id: 3,
  sid: 'sid-room-2',
} as TestUser

const report: RoomStatusReport = {
  screen: 'play',
  gameId: 12,
  phase: 'question',
  round: 2,
  questionIndex: 3,
  miniGame: 'quick_answer',
  paused: false,
  scores: [
    { podium: 1, score: 30 },
    { podium: 2, score: -10 },
  ],
  audioReady: true,
}

const diagnostics: RoomDiagnostics = {
  appVersion: '0.1.0',
  buzzerSource: 'gamepad',
  gamepadCount: 1,
  lightingDriver: 'artnet-bridge',
  lightingStatus: 'open',
  smokeEnabled: true,
  smokeArmed: false,
  lastErrorAt: '2026-11-24T09:30:00.000Z',
}

function seedRooms() {
  const base = { config: {}, created_at: MOCK_NOW, updated_at: MOCK_NOW, deleted_at: null }

  dbState.rooms.push(
    { id: 1, company_id: 1, name: 'Salle 1', status: ROOM_STATUS_ACTIVE, ...base },
    { id: 2, company_id: 1, name: 'Salle 2', status: ROOM_STATUS_ACTIVE, ...base },
    { id: 4, company_id: 1, name: 'Salle éteinte', status: ROOM_STATUS_INACTIVE, ...base },
    { id: 5, company_id: 1, name: 'Salle supprimée', status: ROOM_STATUS_DELETED, ...base },
    { id: 3, company_id: 2, name: 'Salle autre compagnie', status: ROOM_STATUS_ACTIVE, ...base }
  )
}

let app: FastifyInstance
let baseUrl: string
const clients: SseClient[] = []

async function startApp() {
  app = await createRouteApp(liveRoutes)
  baseUrl = await app.listen({ port: 0, host: '127.0.0.1' })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))

  return { promise, resolve }
}

// Appli dont le handler attend que le client ait coupé, pour rejouer une coupure qui survient
// pendant l'authentification ou la lecture des salles (avant `reply.send`).
let gate: { entered: ReturnType<typeof deferred>; sent: ReturnType<typeof deferred> } | undefined

async function startGatedApp() {
  app = await createRouteApp(async (instance: FastifyInstance) => {
    instance.addHook('preHandler', async (_req, reply) => {
      if (gate) {
        gate.entered.resolve()
        await new Promise<void>((resolve) => reply.raw.once('close', resolve))
      }
    })
    instance.addHook('onSend', async (_req, _reply, payload) => {
      gate?.sent.resolve()

      return payload
    })
    await instance.register(liveRoutes as never)
  })
  baseUrl = await app.listen({ port: 0, host: '127.0.0.1' })
}

async function cutBeforeHandlerEnds(path: string, user: TestUser) {
  const current = { entered: deferred(), sent: deferred() }
  const controller = new AbortController()

  gate = current

  const request = fetch(`${baseUrl}${path}`, {
    headers: authHeaders(user),
    signal: controller.signal,
  }).catch(() => undefined)

  await current.entered.promise
  controller.abort()
  await request
  await current.sent.promise
  gate = undefined
  // Laisse Fastify détruire le flux et émettre son `close`.
  await new Promise((resolve) => setImmediate(resolve))
}

async function connect(path: string, user: TestUser) {
  const client = await openSse(`${baseUrl}${path}`, authHeaders(user))

  clients.push(client)

  return client
}

function postStatus(user: TestUser, body: unknown) {
  return fetch(`${baseUrl}/room/status`, {
    method: 'POST',
    headers: { ...authHeaders(user), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function nextRoomLive(client: SseClient): Promise<RoomLive> {
  const message = await client.next()

  expect(message.event).toBe(LIVE_EVENT.ROOM_STATUS)

  return JSON.parse(message.data) as RoomLive
}

beforeEach(() => {
  resetDb()
  seedRooms()
})

afterEach(async () => {
  gate = undefined
  clients.splice(0).forEach((client) => client.abort())
  await app?.close()
  vi.useRealTimers()
})

describe('live routes without an open stream', () => {
  beforeEach(startApp)

  it('GET /room/stream refuses a missing login (401) and an admin account (403)', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/room/stream' })
    const admin = await app.inject({
      method: 'GET',
      url: '/room/stream',
      headers: authHeaders(companyAdminUser),
    })

    expect(anonymous.statusCode).toBe(401)
    expect(admin.statusCode).toBe(403)
    expect(admin.json()).toEqual({ error: 'forbidden' })
  })

  it('POST /room/status refuses a missing login (401) and an admin account (403)', async () => {
    const anonymous = await app.inject({ method: 'POST', url: '/room/status', payload: report })
    const admin = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(companyAdminUser),
      payload: report,
    })

    expect(anonymous.statusCode).toBe(401)
    expect(admin.statusCode).toBe(403)
    expect(admin.json()).toEqual({ error: 'forbidden' })
  })

  it('POST /room/status answers 204 to a valid report', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(roomUser),
      payload: report,
    })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })

  it('POST /room/status accepts null game fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(roomUser),
      payload: {
        ...report,
        screen: 'launch',
        gameId: null,
        phase: null,
        round: null,
        questionIndex: null,
        miniGame: null,
        scores: [],
      },
    })

    expect(response.statusCode).toBe(204)
  })

  it.each([
    ['an unknown screen', { screen: 'nope' }],
    ['an unknown mini-game', { miniGame: 'darts' }],
    ['a missing field', { audioReady: undefined }],
    ['a game id that is not a number', { gameId: 'abc' }],
    ['a podium out of range', { scores: [{ podium: 7, score: 1 }] }],
    [
      'two scores for the same podium',
      {
        scores: [
          { podium: 2, score: 10 },
          { podium: 2, score: 20 },
        ],
      },
    ],
    ['a phase that is not a string', { phase: 12 }],
    [
      'more than 6 scores',
      { scores: Array.from({ length: 7 }, (_, index) => ({ podium: (index % 6) + 1, score: 0 })) },
    ],
  ])('POST /room/status answers 400 invalid_body for %s', async (_label, change) => {
    const response = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(roomUser),
      payload: { ...report, ...change },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('POST /room/status accepts a report with diagnostics, and without (old room screens)', async () => {
    const withDiagnostics = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(roomUser),
      payload: { ...report, diagnostics },
    })
    const noError = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(roomUser),
      payload: {
        ...report,
        diagnostics: { ...diagnostics, lightingStatus: 'closed', lastErrorAt: null },
      },
    })

    expect(withDiagnostics.statusCode).toBe(204)
    expect(noError.statusCode).toBe(204)
    // `report` n'a pas de `diagnostics` : 'POST /room/status answers 204 to a valid report' le couvre.
  })

  it.each([
    ['an unknown buzzer source', { buzzerSource: 'midi' }, { buzzerSource: null }],
    ['an unknown lighting driver', { lightingDriver: 'sacn' }, { lightingDriver: null }],
    ['an unknown output status', { lightingStatus: 'melting' }, { lightingStatus: null }],
    ['a negative gamepad count', { gamepadCount: -1 }, { gamepadCount: null }],
    ['too many gamepads', { gamepadCount: 17 }, { gamepadCount: null }],
    ['a gamepad count with decimals', { gamepadCount: 1.5 }, { gamepadCount: null }],
    ['an empty app version', { appVersion: '' }, { appVersion: null }],
    ['an app version of the wrong type', { appVersion: 12 }, { appVersion: null }],
    [
      'an app version longer than 32 characters',
      { appVersion: 'v'.repeat(33) },
      { appVersion: null },
    ],
    ['a smoke flag that is not a boolean', { smokeArmed: 'yes' }, { smokeArmed: null }],
    ['a last error that is not an ISO date', { lastErrorAt: 'yesterday' }, { lastErrorAt: null }],
    ['a missing field', { smokeEnabled: undefined }, { smokeEnabled: null }],
    ['a field this server does not know', { playerName: 'Alice' }, {}],
  ])(
    'POST /room/status accepts diagnostics with %s: the field is read as null or dropped, the room stays present',
    async (_label, change, expected) => {
      const response = await app.inject({
        method: 'POST',
        url: '/room/status',
        headers: authHeaders(roomUser),
        payload: { ...report, diagnostics: { ...diagnostics, ...change } },
      })

      expect(response.statusCode).toBe(204)

      const staff = await connect('/companies/1/live', companyAdminUser)
      const snapshot = JSON.parse((await staff.next()).data) as { rooms: RoomLive[] }

      expect(snapshot.rooms[0]).toMatchObject({ roomId: 1, presence: 'in_game', status: report })
      expect(snapshot.rooms[0]?.status?.diagnostics).toEqual({ ...diagnostics, ...expected })
    }
  )

  it.each([
    ['a string', 'x'],
    ['a number', 12],
    ['null', null],
    ['an array', [diagnostics]],
  ])(
    'POST /room/status accepts diagnostics that is %s: the report is kept without diagnostics',
    async (_label, bad) => {
      const response = await app.inject({
        method: 'POST',
        url: '/room/status',
        headers: authHeaders(roomUser),
        payload: { ...report, diagnostics: bad },
      })

      expect(response.statusCode).toBe(204)

      const staff = await connect('/companies/1/live', companyAdminUser)
      const snapshot = JSON.parse((await staff.next()).data) as { rooms: RoomLive[] }

      expect(snapshot.rooms[0]).toMatchObject({ roomId: 1, presence: 'in_game', status: report })
      expect(snapshot.rooms[0]?.status).not.toHaveProperty('diagnostics')
    }
  )

  it('POST /room/status still refuses a bad field outside diagnostics (400 invalid_body)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(roomUser),
      payload: { ...report, screen: 'nope', diagnostics },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('POST /room/status accepts a phase this server does not know and reads it as null (204)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(roomUser),
      payload: { ...report, phase: 'warm_up' },
    })

    expect(response.statusCode).toBe(204)

    const staff = await connect('/companies/1/live', companyAdminUser)
    const snapshot = JSON.parse((await staff.next()).data) as { rooms: RoomLive[] }

    expect(snapshot.rooms[0]).toMatchObject({
      roomId: 1,
      presence: 'in_game',
      status: { ...report, phase: null },
    })
  })

  it('POST /room/status accepts a stream id when the room has no open stream (204)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/room/status',
      headers: authHeaders(roomUser),
      payload: { ...report, streamId: 'a-stream-the-backend-forgot' },
    })

    expect(response.statusCode).toBe(204)
  })

  it('GET /companies/:id/live refuses a missing login (401) and a room account (403)', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/companies/1/live' })
    const room = await app.inject({
      method: 'GET',
      url: '/companies/1/live',
      headers: authHeaders(roomUser),
    })

    expect(anonymous.statusCode).toBe(401)
    expect(room.statusCode).toBe(403)
    expect(room.json()).toEqual({ error: 'forbidden' })
  })

  it('GET /companies/:id/live answers 400 invalid_params for a bad company id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/companies/abc/live',
      headers: authHeaders(superadminUser),
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'invalid_params' })
  })

  it('GET /companies/:id/live answers 403 to the admin of another company', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/companies/2/live',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })
})

describe('live routes with real streams', () => {
  beforeEach(startApp)

  it('sends the staff a snapshot of every active room of its company, offline ones included', async () => {
    const staff = await connect('/companies/1/live', companyAdminUser)

    expect(staff.status).toBe(200)
    expect(staff.headers.get('content-type')).toContain('text/event-stream')
    expect(staff.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(staff.headers.get('x-accel-buffering')).toBe('no')

    const snapshot = await staff.next()

    expect(snapshot.event).toBe(LIVE_EVENT.SNAPSHOT)
    expect(JSON.parse(snapshot.data)).toEqual({
      rooms: [
        { roomId: 1, presence: 'offline', controllable: false, lastSeenAt: null, status: null },
        { roomId: 2, presence: 'offline', controllable: false, lastSeenAt: null, status: null },
      ],
    })
  })

  it('lets the superadmin read the live state of any company', async () => {
    const staff = await connect('/companies/2/live', superadminUser)
    const snapshot = await staff.next()

    expect(snapshot.event).toBe(LIVE_EVENT.SNAPSHOT)
    expect(
      (JSON.parse(snapshot.data) as { rooms: RoomLive[] }).rooms.map((room) => room.roomId)
    ).toEqual([3])
  })

  it('greets a room with its stream id and the delays, and relays its reports to the staff', async () => {
    const staff = await connect('/companies/1/live', companyAdminUser)
    await staff.next()

    const room = await connect('/room/stream', roomUser)
    const hello = await room.next()
    const { streamId, heartbeatMs, statusEveryMs } = JSON.parse(hello.data) as {
      streamId: string
      heartbeatMs: number
      statusEveryMs: number
    }

    expect(hello.event).toBe(LIVE_EVENT.HELLO)
    expect(streamId).toEqual(expect.any(String))
    expect(heartbeatMs).toBe(LIVE_HEARTBEAT_MS)
    expect(statusEveryMs).toBe(LIVE_STATUS_EVERY_MS)

    // Ouvrir le flux ne suffit pas : sans rapport, la salle reste hors ligne.
    expect(await nextRoomLive(staff)).toMatchObject({ roomId: 1, presence: 'offline' })

    const posted = await postStatus(roomUser, { ...report, streamId })

    expect(posted.status).toBe(204)

    const live = await nextRoomLive(staff)

    expect(live).toMatchObject({
      roomId: 1,
      presence: 'in_game',
      controllable: true,
      status: report,
    })
    expect(live.lastSeenAt).toEqual(expect.any(String))
    expect(JSON.stringify(live)).not.toContain(streamId)
  })

  it('relays the diagnostics of a report to the staff, in the snapshot of a later stream too', async () => {
    const staff = await connect('/companies/1/live', companyAdminUser)
    await staff.next()

    const posted = await postStatus(roomUser, { ...report, diagnostics })

    expect(posted.status).toBe(204)
    expect((await nextRoomLive(staff)).status?.diagnostics).toEqual(diagnostics)

    const later = await connect('/companies/1/live', companyAdminUser)
    const snapshot = JSON.parse((await later.next()).data) as { rooms: RoomLive[] }

    expect(snapshot.rooms.find((room) => room.roomId === 1)?.status?.diagnostics).toEqual(
      diagnostics
    )
  })

  it('does not show the diagnostics of a room to the staff of another company', async () => {
    const staffOne = await connect('/companies/1/live', companyAdminUser)
    const staffTwo = await connect('/companies/2/live', companyUser)

    await staffOne.next()
    await staffTwo.next()

    await postStatus(roomUser, { ...report, diagnostics })
    await postStatus(otherCompanyRoomUser, report)

    expect(await nextRoomLive(staffOne)).toMatchObject({ roomId: 1 })
    expect(await nextRoomLive(staffTwo)).toMatchObject({ roomId: 3 })
    expect(staffOne.raw()).toContain('"lightingDriver"')
    expect(staffTwo.raw()).not.toContain('"lightingDriver"')
  })

  it('replaces the stream of a room: the old one gets replaced and closes, its reports are refused', async () => {
    const first = await connect('/room/stream', roomUser)
    const firstId = (JSON.parse((await first.next()).data) as { streamId: string }).streamId

    const second = await connect('/room/stream', roomUser)
    const secondId = (JSON.parse((await second.next()).data) as { streamId: string }).streamId

    expect((await first.next()).event).toBe(LIVE_EVENT.REPLACED)
    await first.closed

    const stale = await postStatus(roomUser, { ...report, streamId: firstId })
    const current = await postStatus(roomUser, { ...report, streamId: secondId })

    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ error: 'room_instance_replaced' })
    expect(current.status).toBe(204)
  })

  it('answers 409 room_instance_replaced only while another stream is open for the room', async () => {
    const room = await connect('/room/stream', roomUser)
    await room.next()

    const refused = await postStatus(roomUser, { ...report, streamId: 'not-the-current-stream' })

    expect(refused.status).toBe(409)
    expect(await refused.json()).toEqual({ error: 'room_instance_replaced' })
  })

  it('accepts a report with the old stream id once the stream is closed (204)', async () => {
    const room = await connect('/room/stream', roomUser)
    const { streamId } = JSON.parse((await room.next()).data) as { streamId: string }
    const staff = await connect('/companies/1/live', companyAdminUser)

    await staff.next()
    room.abort()
    await room.closed
    expect(await nextRoomLive(staff)).toMatchObject({ roomId: 1, controllable: false })

    const response = await postStatus(roomUser, { ...report, streamId })

    expect(response.status).toBe(204)
  })

  it('does not leak the rooms of one company to the staff of another', async () => {
    const staffOne = await connect('/companies/1/live', companyAdminUser)
    const staffTwo = await connect('/companies/2/live', companyUser)

    await staffOne.next()
    await staffTwo.next()

    await postStatus(roomUser, report)
    await postStatus(otherCompanyRoomUser, { ...report, gameId: 99 })

    expect(await nextRoomLive(staffOne)).toMatchObject({ roomId: 1 })
    expect(await nextRoomLive(staffTwo)).toMatchObject({ roomId: 3 })
    expect(staffOne.raw()).not.toContain('"roomId":3')
    expect(staffTwo.raw()).not.toContain('"roomId":1')
  })

  it('tells the staff when the stream of a room is cut by the client', async () => {
    const room = await connect('/room/stream', roomUser)
    const { streamId } = JSON.parse((await room.next()).data) as { streamId: string }

    await postStatus(roomUser, { ...report, streamId })

    const staff = await connect('/companies/1/live', companyAdminUser)
    const snapshot = JSON.parse((await staff.next()).data) as { rooms: RoomLive[] }

    expect(snapshot.rooms[0]).toMatchObject({ roomId: 1, controllable: true })

    room.abort()

    expect(await nextRoomLive(staff)).toMatchObject({ roomId: 1, controllable: false })
  })

  it('answers 429 too_many_streams above 5 open streams for one account, and frees a slot when one closes', async () => {
    const opened: SseClient[] = []

    for (let index = 0; index < 5; index += 1) {
      const client = await connect('/companies/1/live', companyAdminUser)

      expect(client.status).toBe(200)
      opened.push(client)
    }

    const refused = await fetch(`${baseUrl}/companies/1/live`, {
      headers: authHeaders(companyAdminUser),
    })

    expect(refused.status).toBe(429)
    expect(await refused.json()).toEqual({ error: 'too_many_streams' })

    // Un autre compte n'est pas concerné.
    const other = await connect('/companies/2/live', companyUser)

    expect(other.status).toBe(200)

    opened[0]?.abort()
    await opened[0]?.closed

    await vi.waitFor(async () => {
      const retry = await openSse(`${baseUrl}/companies/1/live`, authHeaders(companyAdminUser))

      clients.push(retry)
      expect(retry.status).toBe(200)
    })
  })

  it('ends the open streams when the application closes', async () => {
    const staff = await connect('/companies/1/live', companyAdminUser)
    const room = await connect('/room/stream', roomUser)

    await staff.next()
    await room.next()

    await app.close()

    await expect(Promise.all([staff.closed, room.closed])).resolves.toBeDefined()
  })
})

describe('live routes with a simulated clock', () => {
  // Seules les minuteries et la date sont simulées : les entrées-sorties de `fetch` restent réelles.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  })

  it('writes a ping comment on every heartbeat', async () => {
    await startApp()

    const staff = await connect('/companies/1/live', companyAdminUser)
    await staff.next()

    expect(staff.raw()).not.toContain(': ping')

    await vi.advanceTimersByTimeAsync(LIVE_HEARTBEAT_MS)

    await vi.waitFor(() => expect(staff.raw()).toContain(': ping\n\n'))
  })

  it('sends session_ended then closes when the session was revoked', async () => {
    dbState.admin_sessions.push({
      id: companyAdminUser.sid,
      admin_id: 2,
      created_at: MOCK_NOW,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    })
    await startApp()

    const staff = await connect('/companies/1/live', companyAdminUser)
    await staff.next()

    // Session encore valable : le flux reste ouvert.
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(staff.raw()).not.toContain(LIVE_EVENT.SESSION_ENDED)

    dbState.admin_sessions[0]!.revoked_at = new Date().toISOString()
    await vi.advanceTimersByTimeAsync(60_000)

    const ended = await staff.next()

    expect(ended.event).toBe(LIVE_EVENT.SESSION_ENDED)
    expect(JSON.parse(ended.data)).toEqual({ error: 'session_invalid' })
    await staff.closed
  })

  it('ends a staff stream once the inactivity limit passes, without extending the session', async () => {
    const lastSeenAt = new Date().toISOString()

    dbState.admin_sessions.push({
      id: companyAdminUser.sid,
      admin_id: 2,
      created_at: MOCK_NOW,
      last_seen_at: lastSeenAt,
      revoked_at: null,
    })
    await startApp()

    const staff = await connect('/companies/1/live', companyAdminUser)
    await staff.next()

    await vi.advanceTimersByTimeAsync(30 * 60_000)
    expect(dbState.admin_sessions[0]!.last_seen_at).toBe(lastSeenAt)
    expect(staff.raw()).not.toContain(LIVE_EVENT.SESSION_ENDED)

    await vi.advanceTimersByTimeAsync(31 * 60_000)

    const ended = await staff.next()

    expect(ended.event).toBe(LIVE_EVENT.SESSION_ENDED)
    expect(JSON.parse(ended.data)).toEqual({ error: 'session_expired_inactive' })
    expect(dbState.admin_sessions[0]!.last_seen_at).toBe(lastSeenAt)
    await staff.closed
  })

  it('ends a room stream and forgets it when its session becomes invalid', async () => {
    const lastSeenAt = new Date().toISOString()

    dbState.admin_sessions.push(
      {
        id: companyAdminUser.sid,
        admin_id: 2,
        created_at: MOCK_NOW,
        last_seen_at: lastSeenAt,
        revoked_at: null,
      },
      {
        id: roomUser.sid,
        admin_id: 10,
        created_at: MOCK_NOW,
        last_seen_at: lastSeenAt,
        revoked_at: null,
      }
    )
    await startApp()

    const staff = await connect('/companies/1/live', companyAdminUser)
    const room = await connect('/room/stream', roomUser)

    await staff.next()
    const { streamId } = JSON.parse((await room.next()).data) as { streamId: string }

    await nextRoomLive(staff)
    await postStatus(roomUser, { ...report, streamId })
    expect(await nextRoomLive(staff)).toMatchObject({ roomId: 1, controllable: true })

    dbState.admin_sessions[1]!.revoked_at = new Date().toISOString()
    await vi.advanceTimersByTimeAsync(60_000)

    const ended = await room.next()

    expect(ended.event).toBe(LIVE_EVENT.SESSION_ENDED)
    expect(JSON.parse(ended.data)).toEqual({ error: 'session_invalid' })
    await room.closed

    // Le hub ne garde plus de flux pour la salle : le personnel la voit non pilotable.
    expect(await nextRoomLive(staff)).toMatchObject({ roomId: 1, controllable: false })
  })

  it('leaves no subscription and no timer when staff cut before the handler ends', async () => {
    await startGatedApp()

    const baseline = vi.getTimerCount()

    for (let index = 0; index < 5; index += 1) {
      await cutBeforeHandlerEnds('/companies/1/live', companyAdminUser)
    }

    expect(vi.getTimerCount()).toBe(baseline)

    // Cinq flux fantômes feraient répondre 429 à celui-ci.
    const staff = await connect('/companies/1/live', companyAdminUser)

    expect(staff.status).toBe(200)
  })

  it('leaves no stream and no timer when a room cuts before the handler ends', async () => {
    await startGatedApp()

    const baseline = vi.getTimerCount()

    await postStatus(roomUser, report)
    await cutBeforeHandlerEnds('/room/stream', roomUser)

    expect(vi.getTimerCount()).toBe(baseline)

    const staff = await connect('/companies/1/live', companyAdminUser)
    const snapshot = JSON.parse((await staff.next()).data) as { rooms: RoomLive[] }

    expect(snapshot.rooms[0]).toMatchObject({ roomId: 1, presence: 'in_game', controllable: false })
  })

  it('leaves no timer behind once the streams are cut and the application is closed', async () => {
    await startApp()

    const baseline = vi.getTimerCount()
    const staff = await connect('/companies/1/live', companyAdminUser)
    const room = await connect('/room/stream', roomUser)

    await staff.next()
    await room.next()
    expect(vi.getTimerCount()).toBeGreaterThan(baseline)

    staff.abort()
    room.abort()
    await Promise.all([staff.closed, room.closed])

    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(baseline))

    // Il ne reste que la minuterie de balayage du hub, arrêtée avec l'application.
    await app.close()
    expect(vi.getTimerCount()).toBe(baseline - 1)
  })
})

const secondRoomUser = { ...roomUser, sub: '12', id: 12, room_id: 2, sid: 'sid-room-b' } as TestUser
const operator = { ...companyUser, company_id: 1, companyId: 1 } as TestUser

const COMMAND_ID = '3f2b8c1e-5d4a-4e7b-9a6c-1d2e3f4a5b6c'
const OTHER_COMMAND_ID = '5a1d9e2f-7b3c-4d8e-8f0a-2b4c6d8e0f1a'

function postCommand(user: TestUser | undefined, url: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url,
    headers: user ? authHeaders(user) : {},
    payload: payload as object,
  })
}

function postResult(user: TestUser | undefined, commandId: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: `/room/commands/${commandId}/result`,
    headers: user ? authHeaders(user) : {},
    payload: payload as object,
  })
}

// Salle pilotable : flux ouvert (premier message lu) et rapport reçu.
async function openControllableRoom(user: TestUser) {
  const room = await connect('/room/stream', user)
  const { streamId } = JSON.parse((await room.next()).data) as { streamId: string }

  await postStatus(user, { ...report, streamId })

  return room
}

async function nextMessage<T>(client: SseClient, event: string): Promise<T> {
  const message = await client.next()

  expect(message.event).toBe(event)

  return JSON.parse(message.data) as T
}

describe('POST /companies/:companyId/rooms/:roomId/commands', () => {
  beforeEach(startApp)

  it('answers 401 without login and 403 to a room account', async () => {
    const url = '/companies/1/rooms/1/commands'
    const body = { commandId: COMMAND_ID, command: 'pause' }

    expect((await postCommand(undefined, url, body)).statusCode).toBe(401)

    const room = await postCommand(roomUser, url, body)

    expect(room.statusCode).toBe(403)
    expect(room.json()).toEqual({ error: 'forbidden' })
  })

  it.each([
    ['superadmin', superadminUser],
    ['admin', companyAdminUser],
    ['user', operator],
  ])('relays the command of a %s to the stream of the room (202)', async (_role, user) => {
    const room = await openControllableRoom(roomUser)
    const response = await postCommand(user, '/companies/1/rooms/1/commands', {
      commandId: COMMAND_ID,
      command: 'pause',
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ commandId: COMMAND_ID })
    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toEqual({
      commandId: COMMAND_ID,
      command: 'pause',
    })
  })

  it('relays the round and the question index of a skip', async () => {
    const room = await openControllableRoom(roomUser)

    await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', {
      commandId: COMMAND_ID,
      command: 'skip',
      round: 2,
      questionIndex: 3,
    })

    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toEqual({
      commandId: COMMAND_ID,
      command: 'skip',
      round: 2,
      questionIndex: 3,
    })
  })

  it('lets the superadmin command a room of any company', async () => {
    const room = await openControllableRoom(otherCompanyRoomUser)
    const response = await postCommand(superadminUser, '/companies/2/rooms/3/commands', {
      commandId: COMMAND_ID,
      command: 'abort',
      gameId: 5,
    })

    expect(response.statusCode).toBe(202)
    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toMatchObject({
      command: 'abort',
      gameId: 5,
    })
  })

  it('relays an identifier received twice only once, and answers the same both times', async () => {
    const room = await openControllableRoom(roomUser)
    const body = { commandId: COMMAND_ID, command: 'pause' }

    const first = await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', body)
    const second = await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', body)

    expect([first.statusCode, second.statusCode]).toEqual([202, 202])
    expect(second.json()).toEqual(first.json())

    await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', {
      commandId: OTHER_COMMAND_ID,
      command: 'resume',
    })

    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toMatchObject({
      commandId: COMMAND_ID,
    })
    // La commande suivante est la deuxième, pas le doublon.
    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toMatchObject({
      commandId: OTHER_COMMAND_ID,
      command: 'resume',
    })
  })

  it('answers 409 command_id_conflict when an identifier comes back with another content, and relays nothing', async () => {
    const room = await openControllableRoom(roomUser)
    const url = '/companies/1/rooms/1/commands'

    await postCommand(companyAdminUser, url, { commandId: COMMAND_ID, command: 'pause' })
    const conflict = await postCommand(companyAdminUser, url, {
      commandId: COMMAND_ID,
      command: 'resume',
    })
    const skipA = { commandId: OTHER_COMMAND_ID, command: 'skip', round: 1, questionIndex: 2 }
    await postCommand(companyAdminUser, url, skipA)
    const skipB = await postCommand(companyAdminUser, url, { ...skipA, questionIndex: 3 })

    expect(conflict.statusCode).toBe(409)
    expect(conflict.json()).toEqual({ error: 'command_id_conflict' })
    expect(skipB.statusCode).toBe(409)
    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toMatchObject({
      command: 'pause',
    })
    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toMatchObject({
      command: 'skip',
    })
  })

  it.each([
    ['a command that does not exist', { commandId: COMMAND_ID, command: 'dance' }],
    ['the start command, not handled yet', { commandId: COMMAND_ID, command: 'start' }],
    ['an abort without game', { commandId: COMMAND_ID, command: 'abort' }],
    [
      'an abort with a game that is not an id',
      { commandId: COMMAND_ID, command: 'abort', gameId: 0 },
    ],
    ['a missing identifier', { command: 'pause' }],
    ['an identifier that is not a uuid', { commandId: 'cmd-1', command: 'pause' }],
    ['a skip without round', { commandId: COMMAND_ID, command: 'skip', questionIndex: 1 }],
    ['a skip without question index', { commandId: COMMAND_ID, command: 'skip', round: 1 }],
    [
      'a skip with a negative round',
      { commandId: COMMAND_ID, command: 'skip', round: -1, questionIndex: 1 },
    ],
    [
      'a skip with a question index that is not an integer',
      { commandId: COMMAND_ID, command: 'skip', round: 1, questionIndex: 1.5 },
    ],
  ])('answers 400 invalid_body for %s', async (_label, body) => {
    await openControllableRoom(roomUser)

    const response = await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', body)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('answers 400 invalid_params for a bad room or company id', async () => {
    const body = { commandId: COMMAND_ID, command: 'pause' }

    for (const url of ['/companies/1/rooms/abc/commands', '/companies/abc/rooms/1/commands']) {
      const response = await postCommand(superadminUser, url, body)

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'invalid_params' })
    }
  })

  it('answers 404 room_not_found for an unknown room, a deleted room and a room of another company', async () => {
    const body = { commandId: COMMAND_ID, command: 'pause' }

    for (const url of [
      '/companies/1/rooms/99/commands',
      '/companies/1/rooms/5/commands',
      '/companies/1/rooms/3/commands',
    ]) {
      const response = await postCommand(companyAdminUser, url, body)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'room_not_found' })
    }
  })

  it('answers 409 room_not_controllable when the room has no open stream, or its stream was cut', async () => {
    const body = { commandId: COMMAND_ID, command: 'pause' }
    const url = '/companies/1/rooms/1/commands'

    // Jamais vue.
    const unknown = await postCommand(companyAdminUser, url, body)

    expect(unknown.statusCode).toBe(409)
    expect(unknown.json()).toEqual({ error: 'room_not_controllable' })

    // Rapport reçu mais aucun flux : en ligne, pas pilotable.
    await postStatus(roomUser, report)
    expect((await postCommand(companyAdminUser, url, body)).statusCode).toBe(409)

    // Flux ouvert puis coupé : le personnel apprend que la salle n'est plus pilotable.
    const room = await openControllableRoom(roomUser)
    const staff = await connect('/companies/1/live', companyAdminUser)

    await staff.next()
    room.abort()
    expect(await nextRoomLive(staff)).toMatchObject({ roomId: 1, controllable: false })
    expect((await postCommand(companyAdminUser, url, body)).statusCode).toBe(409)
  })

  it('answers 403 to the admin of another company and does not reach its rooms', async () => {
    const room = await openControllableRoom(otherCompanyRoomUser)
    const refused = await postCommand(companyAdminUser, '/companies/2/rooms/3/commands', {
      commandId: COMMAND_ID,
      command: 'abort',
      gameId: 5,
    })
    const own = await postCommand(companyUser, '/companies/2/rooms/3/commands', {
      commandId: OTHER_COMMAND_ID,
      command: 'pause',
    })

    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual({ error: 'forbidden' })
    expect(own.statusCode).toBe(202)
    // La seule commande reçue est celle du personnel de la compagnie 2.
    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toMatchObject({
      commandId: OTHER_COMMAND_ID,
    })
  })

  it('does not deliver the command of a room to the stream of another room', async () => {
    const first = await openControllableRoom(roomUser)
    const second = await openControllableRoom(secondRoomUser)

    await postCommand(companyAdminUser, '/companies/1/rooms/2/commands', {
      commandId: COMMAND_ID,
      command: 'pause',
    })

    expect(await nextMessage<RoomCommandMessage>(second, LIVE_EVENT.COMMAND)).toMatchObject({
      commandId: COMMAND_ID,
    })
    expect(first.raw()).not.toContain(LIVE_EVENT.COMMAND)
  })

  it('answers 429 too_many_requests beyond the cap per room', async () => {
    await openControllableRoom(roomUser)

    for (let index = 0; index < COMMAND_MAX_PER_ROOM; index += 1) {
      const sent = await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', {
        commandId: crypto.randomUUID(),
        command: 'pause',
      })

      expect(sent.statusCode).toBe(202)
    }

    const refused = await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', {
      commandId: crypto.randomUUID(),
      command: 'pause',
    })

    expect(refused.statusCode).toBe(429)
    expect(refused.json()).toEqual({ error: 'too_many_requests' })
    expect(refused.headers['retry-after']).toBe('10')
  })

  it('still relays an abort when the cap per room is reached', async () => {
    const room = await openControllableRoom(roomUser)

    for (let index = 0; index < COMMAND_MAX_PER_ROOM; index += 1) {
      await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', {
        commandId: crypto.randomUUID(),
        command: 'pause',
      })
    }

    const abort = await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', {
      commandId: COMMAND_ID,
      command: 'abort',
      gameId: 1,
    })

    expect(abort.statusCode).toBe(202)

    for (let index = 0; index < COMMAND_MAX_PER_ROOM; index += 1) {
      await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)
    }

    expect(await nextMessage<RoomCommandMessage>(room, LIVE_EVENT.COMMAND)).toEqual({
      commandId: COMMAND_ID,
      command: 'abort',
      gameId: 1,
    })
  })
})

describe('POST /room/commands/:commandId/result', () => {
  beforeEach(startApp)

  // Salle 1 pilotable, personnel de la compagnie 1 à l'écoute, une commande `pause` envoyée.
  async function sendPause() {
    const room = await openControllableRoom(roomUser)
    const staff = await connect('/companies/1/live', companyAdminUser)

    await staff.next()
    await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', {
      commandId: COMMAND_ID,
      command: 'pause',
    })
    await room.next()

    return { room, staff }
  }

  it('answers 401 without login and 403 to a staff account', async () => {
    expect((await postResult(undefined, COMMAND_ID, { result: 'applied' })).statusCode).toBe(401)

    const admin = await postResult(companyAdminUser, COMMAND_ID, { result: 'applied' })

    expect(admin.statusCode).toBe(403)
    expect(admin.json()).toEqual({ error: 'forbidden' })
  })

  it('passes an applied command to the staff of the company (204)', async () => {
    const { staff } = await sendPause()

    const response = await postResult(roomUser, COMMAND_ID, { result: ROOM_COMMAND_RESULT.APPLIED })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(await nextMessage<RoomCommandResultMessage>(staff, LIVE_EVENT.COMMAND_RESULT)).toEqual({
      commandId: COMMAND_ID,
      roomId: 1,
      command: 'pause',
      result: 'applied',
    })
  })

  it('passes a refusal with its reason to the staff', async () => {
    const { staff } = await sendPause()

    const response = await postResult(roomUser, COMMAND_ID, {
      result: ROOM_COMMAND_RESULT.REFUSED,
      reason: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION,
    })

    expect(response.statusCode).toBe(204)
    expect(await nextMessage<RoomCommandResultMessage>(staff, LIVE_EVENT.COMMAND_RESULT)).toEqual({
      commandId: COMMAND_ID,
      roomId: 1,
      command: 'pause',
      result: 'refused',
      reason: 'not_in_question',
    })
  })

  it.each(GAME_COMMAND_REFUSALS)('accepts the refusal reason %s', async (reason) => {
    await sendPause()

    const response = await postResult(roomUser, COMMAND_ID, { result: 'refused', reason })

    expect(response.statusCode).toBe(204)
  })

  it.each([
    ['an expired result, which only the server decides', { result: 'expired' }],
    ['a refusal without reason', { result: 'refused' }],
    ['a refusal with an unknown reason', { result: 'refused', reason: 'because' }],
    ['a missing result', {}],
  ])('answers 400 invalid_body for %s', async (_label, body) => {
    await sendPause()

    const response = await postResult(roomUser, COMMAND_ID, body)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('answers 400 invalid_params for an identifier that is not a uuid', async () => {
    const response = await postResult(roomUser, 'cmd-1', { result: 'applied' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'invalid_params' })
  })

  it('answers 404 command_unknown for a command nobody sent', async () => {
    const response = await postResult(roomUser, COMMAND_ID, { result: 'applied' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'command_unknown' })
  })

  it('answers 404 command_unknown to a room of another company, and the command stays pending', async () => {
    const { staff } = await sendPause()
    const intruder = await postResult(otherCompanyRoomUser, COMMAND_ID, { result: 'applied' })

    expect(intruder.statusCode).toBe(404)
    expect(intruder.json()).toEqual({ error: 'command_unknown' })
    expect(staff.raw()).not.toContain(LIVE_EVENT.COMMAND_RESULT)
    expect((await postResult(roomUser, COMMAND_ID, { result: 'applied' })).statusCode).toBe(204)
  })

  it('answers 404 command_unknown to another room of the same company', async () => {
    const { staff } = await sendPause()
    const other = await postResult(secondRoomUser, COMMAND_ID, { result: 'applied' })

    expect(other.statusCode).toBe(404)
    expect(other.json()).toEqual({ error: 'command_unknown' })
    expect(staff.raw()).not.toContain(LIVE_EVENT.COMMAND_RESULT)
  })

  it('answers 404 command_unknown to a second acknowledgement', async () => {
    await sendPause()

    await postResult(roomUser, COMMAND_ID, { result: 'applied' })
    const again = await postResult(roomUser, COMMAND_ID, { result: 'applied' })

    expect(again.statusCode).toBe(404)
    expect(again.json()).toEqual({ error: 'command_unknown' })
  })

  it('does not leak a result to the staff of another company', async () => {
    await sendPause()
    const otherStaff = await connect('/companies/2/live', companyUser)

    await otherStaff.next()
    await postResult(roomUser, COMMAND_ID, { result: 'applied' })

    expect(otherStaff.raw()).not.toContain(LIVE_EVENT.COMMAND_RESULT)
  })
})

describe('remote commands with a simulated clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    })
  })

  it('tells the staff the command expired after 10 seconds, then refuses the late acknowledgement', async () => {
    await startApp()

    await openControllableRoom(roomUser)
    const staff = await connect('/companies/1/live', companyAdminUser)

    await staff.next()
    await postCommand(companyAdminUser, '/companies/1/rooms/1/commands', {
      commandId: COMMAND_ID,
      command: 'pause',
    })

    await vi.advanceTimersByTimeAsync(ROOM_COMMAND_TIMEOUT_MS - 1)
    expect(staff.raw()).not.toContain(LIVE_EVENT.COMMAND_RESULT)

    await vi.advanceTimersByTimeAsync(1)

    expect(await nextMessage<RoomCommandResultMessage>(staff, LIVE_EVENT.COMMAND_RESULT)).toEqual({
      commandId: COMMAND_ID,
      roomId: 1,
      command: 'pause',
      result: 'expired',
    })

    const late = await postResult(roomUser, COMMAND_ID, { result: 'applied' })

    expect(late.statusCode).toBe(404)
    expect(late.json()).toEqual({ error: 'command_unknown' })
    expect(liveHubOf(app).pendingCommandCount()).toBe(0)
  })
})
