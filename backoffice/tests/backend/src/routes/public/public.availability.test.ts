import '../_helpers/registerDbMock'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMPANY_STATUS_ACTIVE,
  GAME_STATE_CANCELLED,
  GAME_STATE_FINISHED,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_DELETED,
  ROOM_STATUS_INACTIVE,
  SESSION_HORIZON_DAYS,
} from '@quizzup/shared'
import { dbState, resetDb } from '../_helpers/mockDb'
import {
  bearer,
  createPublicApp,
  OPEN_EVERY_DAY,
  PUBLIC_API_NOW,
  seedRoom,
  seedToken,
} from '../_helpers/publicApi'

type App = Awaited<ReturnType<typeof createPublicApp>>

let app: App
let token: string

const availability = (query: string, headers: Record<string, string> = bearer(token)) =>
  app.inject({ method: 'GET', url: `/public/v1/availability?${query}`, headers })

/** Heures de début (locales) des créneaux de la réponse. */
const localTimes = (response: { json: () => { slots: Array<{ localTime: string }> } }) =>
  response.json().slots.map((slot) => slot.localTime)

function seedSession(overrides: Record<string, unknown> = {}) {
  dbState.games.push({
    id: dbState.games.length + 100,
    company_id: 1,
    room_id: 1,
    state: GAME_STATE_SCHEDULED,
    status: 1,
    // Jeudi 11 mars 2027, 11:00-12:00 à Paris (UTC+1).
    scheduled_at: new Date('2027-03-11T10:00:00.000Z'),
    scheduled_end_at: new Date('2027-03-11T11:00:00.000Z'),
    ...overrides,
  })
}

beforeEach(async () => {
  resetDb()
  dbState.companies[1]!.status = COMPANY_STATUS_ACTIVE
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PUBLIC_API_NOW)
  token = seedToken().token
  seedRoom({ id: 1 })
  app = await createPublicApp()
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

describe('routes/public/availability — GET /public/v1/availability', () => {
  it('requires an API key', async () => {
    const response = await availability('room=1&date=2027-03-11', {})

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'api_key_missing' })
  })

  it('lists the free slots of a local day, in UTC with the local time of the room', async () => {
    const response = await availability('room=1&date=2027-03-11')
    const { slots, ...head } = response.json()

    expect(response.statusCode).toBe(200)
    expect(head).toEqual({ roomId: 1, date: '2027-03-11', timezone: 'Europe/Paris' })
    expect(slots).toHaveLength(12)
    expect(slots[0]).toEqual({
      startsAt: '2027-03-11T09:00:00.000Z',
      endsAt: '2027-03-11T10:00:00.000Z',
      localTime: '10:00',
    })
    expect(slots[11].localTime).toBe('21:00')
  })

  it('drops the slots that already started today', async () => {
    vi.setSystemTime(new Date('2027-03-10T11:30:00.000Z')) // 12:30 à Paris

    expect(localTimes(await availability('room=1&date=2027-03-10'))[0]).toBe('13:00')
  })

  it('drops a slot taken by a scheduled, pending or running session, and only that one', async () => {
    seedSession()

    const times = localTimes(await availability('room=1&date=2027-03-11'))

    expect(times).toHaveLength(11)
    expect(times).not.toContain('11:00')
    expect(times).toContain('10:00')
    expect(times).toContain('12:00')
  })

  it.each([
    ['cancelled', { state: GAME_STATE_CANCELLED }],
    ['finished', { state: GAME_STATE_FINISHED }],
    ['deleted', { status: GAME_STATUS_DELETED }],
    ['in another room', { room_id: 2 }],
    ['in another company', { company_id: 2 }],
  ])('keeps the slot of a session that is %s', async (_label, overrides) => {
    seedSession(overrides)

    expect(localTimes(await availability('room=1&date=2027-03-11'))).toContain('11:00')
  })

  it('returns an empty list on a closed day', async () => {
    dbState.rooms[0]!.schedule = {
      ...OPEN_EVERY_DAY,
      days: { '1': { opensAt: '10:00', closesAt: '22:00' } }, // lundi seulement
    }

    const response = await availability('room=1&date=2027-03-11') // un jeudi

    expect(response.statusCode).toBe(200)
    expect(response.json().slots).toEqual([])
  })

  it.each([
    ['no room', 'date=2027-03-11'],
    ['no date', 'room=1'],
    ['a room that is not a number', 'room=abc&date=2027-03-11'],
    ['a room that is zero', 'room=0&date=2027-03-11'],
    ['a date that is not ISO', 'room=1&date=11/03/2027'],
    ['a day that does not exist', 'room=1&date=2027-02-30'],
  ])('answers 400 invalid_query for %s', async (_label, query) => {
    const response = await availability(query)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'invalid_query' })
  })

  it("answers the same 404 for an unknown room, another company's room, an inactive room and a closed one", async () => {
    seedRoom({ id: 2, company_id: 2 })
    seedRoom({ id: 3, status: ROOM_STATUS_INACTIVE })
    seedRoom({ id: 4, schedule: { ...OPEN_EVERY_DAY, publicBooking: false } })
    seedRoom({ id: 5, schedule: null })

    for (const room of [99, 2, 3, 4, 5]) {
      const response = await availability(`room=${room}&date=2027-03-11`)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'room_not_found' })
    }
  })

  it('does not let company B read the slots of a room of company A', async () => {
    const b = seedToken(2)

    const response = await availability('room=1&date=2027-03-11', bearer(b.token))

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'room_not_found' })
  })

  it('answers 422 date_out_of_range before yesterday and beyond the horizon, in the room time zone', async () => {
    // Hier (9 mars) est encore permis ; le 8 ne l'est plus.
    expect((await availability('room=1&date=2027-03-09')).statusCode).toBe(200)

    const tooOld = await availability('room=1&date=2027-03-08')
    expect(tooOld.statusCode).toBe(422)
    expect(tooOld.json()).toEqual({ error: 'date_out_of_range' })

    // 365 jours après le 10 mars 2027 : le 9 mars 2028.
    expect((await availability('room=1&date=2028-03-09')).statusCode).toBe(200)
    expect(SESSION_HORIZON_DAYS).toBe(365)

    const tooFar = await availability('room=1&date=2028-03-10')
    expect(tooFar.statusCode).toBe(422)
    expect(tooFar.json()).toEqual({ error: 'date_out_of_range' })
  })

  it('reads "today" in the room time zone, not in UTC', async () => {
    // 23:30 UTC le 10 mars : il est déjà le 11 mars à Paris, « avant la veille » devient le 9.
    vi.setSystemTime(new Date('2027-03-10T23:30:00.000Z'))

    expect((await availability('room=1&date=2027-03-10')).statusCode).toBe(200)
    expect((await availability('room=1&date=2027-03-09')).statusCode).toBe(422)
  })
})
