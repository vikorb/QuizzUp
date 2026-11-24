import '../_helpers/registerDbMock'

import { PUBLIC_BOOKING_BODY_LIMIT } from '@backend/routes/public/bookings'
import {
  COMPANY_STATUS_ACTIVE,
  GAME_STATE_CANCELLED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db, dbState, resetDb } from '../_helpers/mockDb'
import {
  bearer,
  createPublicApp,
  OPEN_EVERY_DAY,
  PUBLIC_API_NOW,
  seedRoom,
  seedToken,
} from '../_helpers/publicApi'

type App = Awaited<ReturnType<typeof createPublicApp>>
type Json = Record<string, unknown>

let app: App
let token: string

// Jeudi 11 mars 2027 à Paris (UTC+1) : 11:00-12:00 puis 13:00-14:00 locales.
const SLOT = '2027-03-11T10:00:00.000Z'
const SLOT_END = '2027-03-11T11:00:00.000Z'
const OTHER_SLOT = '2027-03-11T12:00:00.000Z'

const LEA = {
  podium: 1,
  displayName: 'Léa',
  email: 'lea@exemple.test',
  emailConsent: true,
  secondPlayer: { displayName: 'Noé', email: 'noe@exemple.test', emailConsent: true },
}

const call = (
  method: 'POST' | 'GET' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  headers: Record<string, string> = bearer(token)
) => app.inject({ method, url, headers, payload: payload as never })

const book = (
  body: Record<string, unknown> = {},
  key: string | null = 'key-1',
  headers: Record<string, string> = bearer(token)
) =>
  call(
    'POST',
    '/public/v1/bookings',
    { roomId: 1, startsAt: SLOT, ...body },
    key === null ? headers : { ...headers, 'idempotency-key': key }
  )

const bookingOf = (response: { json: () => Json }) => response.json().booking as Json

/** Crée une réservation et renvoie son id. */
async function seedBooking(body: Record<string, unknown> = {}, key = 'seed') {
  const response = await book(body, key)

  expect(response.statusCode).toBe(201)

  return bookingOf(response).id as number
}

/** Session créée au backoffice (sans clé d'API), avec un joueur et son e-mail. */
function seedBackofficeSession() {
  dbState.games.push({
    id: 50,
    company_id: 1,
    room_id: 1,
    admin_id: 2,
    api_key_id: null,
    state: GAME_STATE_SCHEDULED,
    status: 1,
    scheduled_at: SLOT,
    scheduled_end_at: SLOT_END,
  })
  dbState.game_participants.push({
    id: 1,
    game_id: 50,
    podium: 1,
    display_name: 'Léa',
    email: 'lea@exemple.test',
  })
}

/** Simule la contrainte d'exclusion PostgreSQL (SQLSTATE 23P01) levée à l'écriture. */
function failWithOverlap() {
  vi.spyOn(db, 'transaction').mockRejectedValueOnce(
    Object.assign(new Error('conflicting key value violates exclusion constraint'), {
      code: '23P01',
    })
  )
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
  vi.restoreAllMocks()
  await app.close()
  vi.useRealTimers()
})

describe('POST /public/v1/bookings', () => {
  it('requires an API key', async () => {
    const response = await book({}, 'key-1', {})

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'api_key_missing' })
  })

  it('creates a scheduled session on the grid slot, made by the API key', async () => {
    const response = await book({ playersCount: 3, locale: 'en', externalRef: 'RESA-1' })

    expect(response.statusCode).toBe(201)
    expect(response.headers['idempotent-replayed']).toBeUndefined()
    expect(bookingOf(response)).toMatchObject({
      roomId: 1,
      state: GAME_STATE_SCHEDULED,
      startsAt: SLOT,
      endsAt: SLOT_END,
      playersCount: 3,
      locale: 'en',
      externalRef: 'RESA-1',
      participants: [],
    })
    expect(dbState.games).toHaveLength(1)
    expect(dbState.games[0]).toMatchObject({
      company_id: 1,
      room_id: 1,
      admin_id: null,
      api_key_id: dbState.api_keys[0]!.id,
      state: GAME_STATE_SCHEDULED,
      scheduled_at: SLOT,
      scheduled_end_at: SLOT_END,
    })
  })

  it('books a slot that starts after midnight, which belongs to the opening day before', async () => {
    dbState.rooms[0]!.schedule = {
      ...OPEN_EVERY_DAY,
      days: { '4': { opensAt: '20:00', closesAt: '02:00' } }, // jeudi soir, jusqu'à 02:00
    }

    // Vendredi 12 mars 01:00 à Paris : dernier créneau de la soirée du jeudi.
    const response = await book({ startsAt: '2027-03-12T00:00:00.000Z' })

    expect(response.statusCode).toBe(201)
    expect(bookingOf(response).endsAt).toBe('2027-03-12T01:00:00.000Z')
  })

  it('accepts the same instant written with an offset', async () => {
    const response = await book({ startsAt: '2027-03-11T11:00:00+01:00' })

    expect(response.statusCode).toBe(201)
    expect(bookingOf(response).startsAt).toBe(SLOT)
  })

  it('keeps the players and never returns an e-mail address', async () => {
    const created = await book({ participants: [LEA] })
    const read = await call('GET', `/public/v1/bookings/${bookingOf(created).id}`)
    const expected = [
      {
        podium: 1,
        displayName: 'Léa',
        hasEmail: true,
        secondPlayer: { displayName: 'Noé', hasEmail: true },
      },
    ]

    expect(bookingOf(created).participants).toEqual(expected)
    expect(bookingOf(read).participants).toEqual(expected)
    expect(dbState.game_participants[0]).toMatchObject({ email: 'lea@exemple.test' })

    for (const body of [created.body, read.body]) {
      expect(body).not.toContain('@')
      expect(body).not.toContain('email"')
    }
  })

  it('ignores the marketing consent, which the API does not offer', async () => {
    await book({ participants: [{ ...LEA, marketingConsent: true }] })

    expect(dbState.game_participants[0]).toMatchObject({
      email: 'lea@exemple.test',
      marketing_consent_at: null,
      second_marketing_consent_at: null,
    })
  })

  describe('idempotency', () => {
    it('replays the same key and body: 201, the same booking, nothing created', async () => {
      const first = await book({ participants: [LEA] })
      const replay = await book({ participants: [LEA] })

      expect(replay.statusCode).toBe(201)
      expect(replay.headers['idempotent-replayed']).toBe('true')
      expect(bookingOf(replay)).toEqual(bookingOf(first))
      expect(dbState.games).toHaveLength(1)
      expect(dbState.game_participants).toHaveLength(1)
      expect(dbState.api_idempotency_keys).toHaveLength(1)
    })

    it('stores a fingerprint of the body, never the body', async () => {
      await book({ participants: [LEA] }, 'order-42')

      expect(dbState.api_idempotency_keys[0]).toMatchObject({
        company_id: 1,
        api_key_id: dbState.api_keys[0]!.id,
        idempotency_key: 'order-42',
        game_id: dbState.games[0]!.id,
      })
      expect(dbState.api_idempotency_keys[0]!.request_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(JSON.stringify(dbState.api_idempotency_keys)).not.toContain('@')
    })

    it('replays the same instant written with another offset', async () => {
      await book({ startsAt: SLOT })
      const replay = await book({ startsAt: '2027-03-11T11:00:00+01:00' })

      expect(replay.statusCode).toBe(201)
      expect(replay.headers['idempotent-replayed']).toBe('true')
      expect(dbState.games).toHaveLength(1)
    })

    it('replays the current state of the booking, not the first answer', async () => {
      const first = await book()
      dbState.games[0]!.state = GAME_STATE_PENDING

      const replay = await book()

      expect(bookingOf(first).state).toBe(GAME_STATE_SCHEDULED)
      expect(bookingOf(replay).state).toBe(GAME_STATE_PENDING)
    })

    it('replays even when the slot is no longer on offer', async () => {
      await book()
      vi.setSystemTime(new Date('2027-03-11T10:30:00.000Z')) // le créneau a commencé

      const replay = await book()

      expect(replay.statusCode).toBe(201)
      expect(replay.headers['idempotent-replayed']).toBe('true')
    })

    it('refuses the same key with another body: 422 idempotency_key_reused', async () => {
      await book()

      const response = await book({ startsAt: OTHER_SLOT })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toEqual({ error: 'idempotency_key_reused' })
      expect(dbState.games).toHaveLength(1)
    })

    it('refuses the same key with another list of players', async () => {
      await book({ participants: [LEA] })

      const response = await book({ participants: [{ ...LEA, displayName: 'Léo' }] })

      expect(response.json()).toEqual({ error: 'idempotency_key_reused' })
    })

    it('creates two bookings for two keys', async () => {
      await book({}, 'key-1')
      await book({ startsAt: OTHER_SLOT }, 'key-2')

      expect(dbState.games).toHaveLength(2)
    })

    it('does not remember a request that failed: the same key can be used again', async () => {
      const refused = await book({ startsAt: '2027-03-11T10:30:00.000Z' }, 'retry')
      const accepted = await book({ startsAt: SLOT }, 'retry')

      expect(refused.statusCode).toBe(422)
      expect(accepted.statusCode).toBe(201)
      expect(accepted.headers['idempotent-replayed']).toBeUndefined()
    })

    it.each([
      ['absent', null],
      ['empty', ''],
      ['with a space', 'two words'],
      ['256 characters long', 'k'.repeat(256)],
    ])('answers 400 idempotency_key_required when the key is %s', async (_label, key) => {
      const response = await book({}, key)

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'idempotency_key_required' })
      expect(dbState.games).toHaveLength(0)
    })

    it('accepts a key of 255 visible characters', async () => {
      expect((await book({}, 'k'.repeat(255))).statusCode).toBe(201)
    })
  })

  describe('slot', () => {
    it.each([
      ['off the grid', '2027-03-11T10:30:00.000Z'],
      ['before the opening', '2027-03-11T08:00:00.000Z'],
      ['at the closing', '2027-03-11T21:00:00.000Z'],
      ['in the past', '2027-03-09T10:00:00.000Z'],
      ['beyond the horizon', '2028-03-12T10:00:00.000Z'],
    ])('answers 422 slot_unavailable for a start %s', async (_label, startsAt) => {
      const response = await book({ startsAt })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toEqual({ error: 'slot_unavailable' })
      expect(dbState.games).toHaveLength(0)
    })

    it('answers 422 slot_unavailable on a closed day', async () => {
      dbState.rooms[0]!.schedule = {
        ...OPEN_EVERY_DAY,
        days: { '1': { opensAt: '10:00', closesAt: '22:00' } }, // lundi seulement
      }

      expect((await book()).json()).toEqual({ error: 'slot_unavailable' })
    })

    it('answers 409 slot_taken when the database refuses an overlapping session (23P01)', async () => {
      failWithOverlap()

      const response = await book()

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({ error: 'slot_taken' })
    })

    it('logs the call without its body, with the error code', async () => {
      failWithOverlap()
      await book({ participants: [LEA] })

      expect(dbState.api_request_logs).toHaveLength(1)
      expect(dbState.api_request_logs[0]).toMatchObject({
        method: 'POST',
        route: '/public/v1/bookings',
        status_code: 409,
        error_code: 'slot_taken',
      })
      expect(JSON.stringify(dbState.api_request_logs)).not.toContain('@')
    })
  })

  describe('room', () => {
    it.each([
      ['unknown', 99],
      ['inactive', 3],
      ['closed to public booking', 4],
      ['without slots', 5],
      ['of another company', 2],
    ])('answers 404 room_not_found for a room %s', async (_label, roomId) => {
      seedRoom({ id: 2, company_id: 2 })
      seedRoom({ id: 3, status: ROOM_STATUS_INACTIVE })
      seedRoom({ id: 4, schedule: { ...OPEN_EVERY_DAY, publicBooking: false } })
      seedRoom({ id: 5, schedule: null })

      const response = await book({ roomId })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'room_not_found' })
      expect(dbState.games).toHaveLength(0)
    })

    it('answers 422 too_many_players for a podium beyond the bookable desks', async () => {
      dbState.rooms[0]!.schedule = { ...OPEN_EVERY_DAY, bookableDesks: 2 }

      const response = await book({ participants: [{ podium: 3, displayName: 'Léa' }] })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toEqual({ error: 'too_many_players' })
    })

    it('answers 422 too_many_players for more players than twice the bookable desks', async () => {
      dbState.rooms[0]!.schedule = { ...OPEN_EVERY_DAY, bookableDesks: 2 }

      expect((await book({ playersCount: 5 }, 'k5')).statusCode).toBe(422)
      expect((await book({ playersCount: 4 }, 'k4')).statusCode).toBe(201)
    })

    it('never offers more desks than the room has, whatever the setting says', async () => {
      dbState.rooms[0]!.config = { desksCount: 2 }

      const response = await book({ playersCount: 5 })

      expect(response.json()).toEqual({ error: 'too_many_players' })
    })
  })

  describe('invalid body', () => {
    it.each([
      ['no room', { roomId: undefined }],
      ['a room that is not a number', { roomId: 'one' }],
      ['no start', { startsAt: undefined }],
      ['a start that is not ISO 8601', { startsAt: '11/03/2027 11:00' }],
      ['a start without offset', { startsAt: '2027-03-11T11:00:00' }],
      ['an unknown locale', { locale: 'de' }],
      ['13 players', { playersCount: 13 }],
      ['a reference that is too long', { externalRef: 'x'.repeat(101) }],
      [
        'an e-mail without consent',
        { participants: [{ podium: 1, displayName: 'A', email: 'a@x.test' }] },
      ],
      [
        'a podium used twice',
        {
          participants: [
            { podium: 1, displayName: 'A' },
            { podium: 1, displayName: 'B' },
          ],
        },
      ],
      ['a podium 0', { participants: [{ podium: 0, displayName: 'A' }] }],
      ['an empty name', { participants: [{ podium: 1, displayName: ' ' }] }],
    ])('answers 400 invalid_body for %s', async (_label, overrides) => {
      const response = await book(overrides)

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('invalid_body')
      expect(response.json().details.fieldErrors).toBeDefined()
      expect(dbState.games).toHaveLength(0)
    })

    it('answers 400 invalid_json for a body that is not JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/public/v1/bookings',
        headers: { ...bearer(token), 'idempotency-key': 'k', 'content-type': 'application/json' },
        payload: '{nope',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'invalid_json' })
    })

    it('answers 413 payload_too_large above 16 KB', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/public/v1/bookings',
        headers: {
          ...bearer(token),
          'idempotency-key': 'k',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          roomId: 1,
          startsAt: SLOT,
          externalRef: 'x'.repeat(PUBLIC_BOOKING_BODY_LIMIT),
        }),
      })

      expect(response.statusCode).toBe(413)
      expect(response.json()).toEqual({ error: 'payload_too_large' })
    })
  })
})

describe('GET /public/v1/bookings/:id', () => {
  it('reads a booking of the company', async () => {
    const id = await seedBooking({ externalRef: 'RESA-1' })

    const response = await call('GET', `/public/v1/bookings/${id}`)

    expect(response.statusCode).toBe(200)
    expect(bookingOf(response)).toMatchObject({
      id,
      state: GAME_STATE_SCHEDULED,
      externalRef: 'RESA-1',
    })
  })

  it('reads a booking made with another key of the same company', async () => {
    const id = await seedBooking()
    const other = seedToken(1, { name: 'Autre clé' })

    const response = await call('GET', `/public/v1/bookings/${id}`, undefined, bearer(other.token))

    expect(response.statusCode).toBe(200)
  })

  it.each([
    ['an unknown id', '999'],
    ['text', 'abc'],
    ['zero', '0'],
    ['a huge number', '99999999999999999999'],
  ])('answers 404 booking_not_found for %s', async (_label, id) => {
    const response = await call('GET', `/public/v1/bookings/${id}`)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'booking_not_found' })
  })

  it('does not show a session made at the backoffice', async () => {
    seedBackofficeSession()

    expect((await call('GET', '/public/v1/bookings/50')).statusCode).toBe(404)
  })

  it('does not show a deleted booking', async () => {
    const id = await seedBooking()
    dbState.games[0]!.status = 2

    expect((await call('GET', `/public/v1/bookings/${id}`)).statusCode).toBe(404)
  })
})

describe('PATCH /public/v1/bookings/:id', () => {
  const patch = (id: number, body: unknown) => call('PATCH', `/public/v1/bookings/${id}`, body)

  it('changes the fields sent and keeps the others', async () => {
    const id = await seedBooking({ playersCount: 3, externalRef: 'RESA-1', locale: 'fr' })

    const response = await patch(id, { externalRef: 'RESA-2', locale: 'en' })

    expect(response.statusCode).toBe(200)
    expect(bookingOf(response)).toMatchObject({
      id,
      startsAt: SLOT,
      playersCount: 3,
      externalRef: 'RESA-2',
      locale: 'en',
    })
  })

  it('clears playersCount, locale and externalRef with null', async () => {
    const id = await seedBooking({ playersCount: 3, externalRef: 'RESA-1', locale: 'fr' })

    const response = await patch(id, { playersCount: null, externalRef: null, locale: null })

    expect(bookingOf(response)).toMatchObject({
      playersCount: null,
      externalRef: null,
      locale: null,
    })
  })

  it('replaces the whole list of players', async () => {
    const id = await seedBooking({ participants: [LEA] })

    const response = await patch(id, { participants: [{ podium: 2, displayName: 'Zoé' }] })

    expect(bookingOf(response).participants).toEqual([
      { podium: 2, displayName: 'Zoé', hasEmail: false, secondPlayer: null },
    ])
    expect(dbState.game_participants).toHaveLength(1)
    expect(response.body).not.toContain('@')
  })

  it('moves the booking to another slot of the grid', async () => {
    const id = await seedBooking()

    const response = await patch(id, { startsAt: OTHER_SLOT })

    expect(bookingOf(response)).toMatchObject({
      startsAt: OTHER_SLOT,
      endsAt: '2027-03-11T13:00:00.000Z',
    })
  })

  it('moves the booking to another room, with the slot length of that room', async () => {
    seedRoom({ id: 2, schedule: { ...OPEN_EVERY_DAY, slotMinutes: 30 } })
    const id = await seedBooking()

    const response = await patch(id, { roomId: 2 })

    expect(bookingOf(response)).toMatchObject({
      roomId: 2,
      startsAt: SLOT,
      endsAt: '2027-03-11T10:30:00.000Z',
    })
  })

  it('refuses a start off the grid, or a room that cannot be booked', async () => {
    seedRoom({ id: 2, company_id: 2 })
    const id = await seedBooking()

    const offGrid = await patch(id, { startsAt: '2027-03-11T10:30:00.000Z' })
    const otherCompanyRoom = await patch(id, { roomId: 2 })

    expect(offGrid.statusCode).toBe(422)
    expect(offGrid.json()).toEqual({ error: 'slot_unavailable' })
    expect(otherCompanyRoom.statusCode).toBe(404)
    expect(otherCompanyRoom.json()).toEqual({ error: 'room_not_found' })
    expect(dbState.games[0]).toMatchObject({ room_id: 1, scheduled_at: SLOT })
  })

  it('answers 422 too_many_players beyond the bookable desks', async () => {
    const id = await seedBooking()

    const podium = await patch(id, { participants: [{ podium: 5, displayName: 'Léa' }] })
    const count = await patch(id, { playersCount: 9 })

    expect(podium.json()).toEqual({ error: 'too_many_players' })
    expect(count.json()).toEqual({ error: 'too_many_players' })
  })

  it('answers 409 slot_taken when the database refuses the new slot (23P01)', async () => {
    const id = await seedBooking()
    failWithOverlap()

    const response = await patch(id, { startsAt: OTHER_SLOT })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'slot_taken' })
  })

  it.each([GAME_STATE_PENDING, GAME_STATE_RUNNING, GAME_STATE_FINISHED, GAME_STATE_CANCELLED])(
    'answers 409 booking_not_modifiable once the session is %s',
    async (state) => {
      const id = await seedBooking()
      dbState.games[0]!.state = state

      const response = await patch(id, { externalRef: 'late' })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({ error: 'booking_not_modifiable' })
      expect(dbState.games[0]!.external_ref).toBeNull()
    }
  )

  it('answers 409 booking_not_modifiable when the centre opens it between the read and the write', async () => {
    const id = await seedBooking()
    vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback) => {
      dbState.games[0]!.state = GAME_STATE_PENDING

      return callback(db)
    })

    const response = await patch(id, { externalRef: 'late' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'booking_not_modifiable' })
  })

  it.each([
    ['nothing', {}],
    ['a locale that does not exist', { locale: 'de' }],
    [
      'a podium used twice',
      {
        participants: [
          { podium: 1, displayName: 'A' },
          { podium: 1, displayName: 'B' },
        ],
      },
    ],
  ])('answers 400 invalid_body for %s', async (_label, body) => {
    const id = await seedBooking()

    const response = await patch(id, body)

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_body')
  })

  describe('when the room has been closed to public booking since', () => {
    const closeRoom = () => {
      dbState.rooms[0]!.schedule = { ...OPEN_EVERY_DAY, publicBooking: false }
    }

    it('still changes the players, the headcount and the reference', async () => {
      const id = await seedBooking({ participants: [LEA] })
      closeRoom()

      const response = await patch(id, {
        participants: [{ podium: 2, displayName: 'Zoé' }],
        playersCount: 2,
        externalRef: 'RESA-9',
      })

      expect(response.statusCode).toBe(200)
      expect(bookingOf(response)).toMatchObject({ playersCount: 2, externalRef: 'RESA-9' })
      expect(bookingOf(response).participants).toHaveLength(1)
    })

    it('still enforces the desks of the room', async () => {
      const id = await seedBooking()
      closeRoom()

      const response = await patch(id, { participants: [{ podium: 5, displayName: 'Léa' }] })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toEqual({ error: 'too_many_players' })
    })

    it('refuses to move to a room that cannot be booked, or to another start in this one', async () => {
      seedRoom({ id: 2, schedule: { ...OPEN_EVERY_DAY, publicBooking: false } })
      const id = await seedBooking()
      closeRoom()

      for (const body of [{ roomId: 2 }, { startsAt: OTHER_SLOT }]) {
        const response = await patch(id, body)

        expect(response.statusCode).toBe(404)
        expect(response.json()).toEqual({ error: 'room_not_found' })
      }
      expect(dbState.games[0]).toMatchObject({ room_id: 1, scheduled_at: SLOT })
    })
  })

  it('does not touch a session made at the backoffice', async () => {
    seedBackofficeSession()

    const response = await patch(50, { externalRef: 'x', participants: [] })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'booking_not_found' })
    expect(dbState.games[0]!.external_ref).toBeUndefined()
    expect(dbState.game_participants).toHaveLength(1)
  })

  it('answers 404 booking_not_found for an unknown id', async () => {
    const response = await patch(999, { externalRef: 'x' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'booking_not_found' })
  })
})

describe('DELETE /public/v1/bookings/:id', () => {
  const cancel = (id: number | string) => call('DELETE', `/public/v1/bookings/${id}`)

  it('cancels the session and erases the e-mails and consents of the players at once', async () => {
    const id = await seedBooking({ participants: [LEA] })

    const response = await cancel(id)

    expect(response.statusCode).toBe(200)
    expect(bookingOf(response)).toMatchObject({ id, state: GAME_STATE_CANCELLED })
    expect(bookingOf(response).participants).toEqual([
      {
        podium: 1,
        displayName: 'Léa',
        hasEmail: false,
        secondPlayer: { displayName: 'Noé', hasEmail: false },
      },
    ])
    expect(dbState.game_participants[0]).toMatchObject({
      display_name: 'Léa',
      email: null,
      consent_at: null,
      marketing_consent_at: null,
      second_display_name: 'Noé',
      second_email: null,
      second_consent_at: null,
    })
    expect(dbState.games[0]).toMatchObject({ state: GAME_STATE_CANCELLED, status: 1 })
    expect(dbState.games[0]!.cancelled_at).toBeTruthy()
  })

  it('is idempotent: cancelling a cancelled booking answers 200', async () => {
    const id = await seedBooking()

    await cancel(id)
    const again = await cancel(id)

    expect(again.statusCode).toBe(200)
    expect(bookingOf(again).state).toBe(GAME_STATE_CANCELLED)
  })

  it.each([GAME_STATE_PENDING, GAME_STATE_RUNNING, GAME_STATE_FINISHED])(
    'answers 409 booking_not_cancellable once the session is %s',
    async (state) => {
      const id = await seedBooking({ participants: [LEA] })
      dbState.games[0]!.state = state

      const response = await cancel(id)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({ error: 'booking_not_cancellable' })
      expect(dbState.games[0]!.state).toBe(state)
      expect(dbState.game_participants[0]).toMatchObject({ email: 'lea@exemple.test' })
    }
  )

  it('still cancels once the room has been closed to public booking', async () => {
    const id = await seedBooking()
    dbState.rooms[0]!.schedule = { ...OPEN_EVERY_DAY, publicBooking: false }

    const response = await cancel(id)

    expect(response.statusCode).toBe(200)
    expect(bookingOf(response).state).toBe(GAME_STATE_CANCELLED)
  })

  it('does not touch a session made at the backoffice', async () => {
    seedBackofficeSession()

    const response = await cancel(50)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'booking_not_found' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)
    expect(dbState.game_participants[0]).toMatchObject({ email: 'lea@exemple.test' })
  })

  it('answers 404 booking_not_found for an unknown id', async () => {
    const response = await cancel(999)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'booking_not_found' })
  })
})

describe('isolation between companies (A = compagnie 1, B = compagnie 2)', () => {
  let tokenB: string

  beforeEach(() => {
    tokenB = seedToken(2).token
    seedRoom({ id: 2, company_id: 2 })
  })

  it('does not let B read, change or cancel a booking of A: the same 404 as an unknown id', async () => {
    const id = await seedBooking({ participants: [LEA] })
    const asB = bearer(tokenB)
    const unknown = await call('GET', '/public/v1/bookings/999', undefined, asB)

    const read = await call('GET', `/public/v1/bookings/${id}`, undefined, asB)
    const patched = await call('PATCH', `/public/v1/bookings/${id}`, { externalRef: 'B' }, asB)
    const cancelled = await call('DELETE', `/public/v1/bookings/${id}`, undefined, asB)

    for (const response of [read, patched, cancelled]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'booking_not_found' })
      expect(response.body).toBe(unknown.body)
    }
    expect(dbState.games[0]).toMatchObject({ state: GAME_STATE_SCHEDULED })
    expect(dbState.game_participants[0]).toMatchObject({ email: 'lea@exemple.test' })
  })

  it('does not let A see a booking of B', async () => {
    const created = await book({ roomId: 2 }, 'key-b', bearer(tokenB))
    const id = bookingOf(created).id

    const response = await call('GET', `/public/v1/bookings/${id}`)

    expect(created.statusCode).toBe(201)
    expect(response.statusCode).toBe(404)
  })

  it('does not let B book a room of A', async () => {
    const response = await book({ roomId: 1 }, 'key-b', bearer(tokenB))

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'room_not_found' })
    expect(dbState.games).toHaveLength(0)
  })

  it('keeps the idempotency keys of two companies apart', async () => {
    const a = await book({}, 'same-key')
    const b = await book({ roomId: 2 }, 'same-key', bearer(tokenB))

    expect(a.statusCode).toBe(201)
    expect(b.statusCode).toBe(201)
    expect(b.headers['idempotent-replayed']).toBeUndefined()
    expect(bookingOf(b).id).not.toBe(bookingOf(a).id)
    expect(dbState.games).toHaveLength(2)
  })
})
