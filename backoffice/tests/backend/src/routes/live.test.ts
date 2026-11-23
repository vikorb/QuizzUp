import './_helpers/registerDbMock'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  LIVE_EVENT,
  LIVE_HEARTBEAT_MS,
  LIVE_STATUS_EVERY_MS,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  ROOM_STATUS_INACTIVE,
  type RoomLive,
  type RoomStatusReport,
} from '@quizzup/shared'
import liveRoutes from '@backend/routes/live'
import { dbState, MOCK_NOW, resetDb } from './_helpers/mockDb'
import { openSse, type SseClient } from './_helpers/sse'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
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
    ['a phase the engine does not have', { phase: 'warm_up' }],
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
