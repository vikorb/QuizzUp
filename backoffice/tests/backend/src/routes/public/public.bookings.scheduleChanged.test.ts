import '../_helpers/registerDbMock'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMPANY_STATUS_ACTIVE, LIVE_EVENT } from '@quizzup/shared'
import { dbState, resetDb } from '../_helpers/mockDb'
import { bearer, createPublicApp, PUBLIC_API_NOW, seedRoom, seedToken } from '../_helpers/publicApi'
import { expectNobodyNotified, watchGameUpdates } from '../_helpers/testApp'

// `schedule_changed` : une réservation de l'API prévient la salle et le personnel de la compagnie,
// par l'identifiant de la salle seulement. Compagnie 1 : salles 1 et 2 ; compagnie 2 : salle 3.

type App = Awaited<ReturnType<typeof createPublicApp>>

const SLOT = '2027-03-11T10:00:00.000Z'
const OTHER_SLOT = '2027-03-11T12:00:00.000Z'
const URL = '/public/v1/bookings'

let app: App
let token: string

const watch = () => watchGameUpdates(app, LIVE_EVENT.SCHEDULE_CHANGED)
const send = (
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  headers: Record<string, string> = bearer(token)
) => app.inject({ method, url, headers, payload: payload as never })
const book = (body: Record<string, unknown> = {}, key = 'key-1', auth = bearer(token)) =>
  send('POST', URL, { roomId: 1, startsAt: SLOT, ...body }, { ...auth, 'idempotency-key': key })

/** Crée une réservation de la compagnie 1 avant de s'abonner : l'événement du départ n'est pas relevé. */
async function seedBooking(): Promise<number> {
  const response = await book({}, 'seed')

  return response.json().booking.id
}

beforeEach(async () => {
  resetDb()
  dbState.companies[1]!.status = COMPANY_STATUS_ACTIVE
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PUBLIC_API_NOW)
  token = seedToken().token
  seedRoom({ id: 1 })
  seedRoom({ id: 2 })
  seedRoom({ id: 3, company_id: 2 })
  app = await createPublicApp()
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

describe('POST /public/v1/bookings', () => {
  it('tells the room and the staff of the company, and nobody else', async () => {
    const updates = watch()

    const response = await book()

    expect(response.statusCode).toBe(201)
    expect(updates.staff1).toEqual([{ roomId: 1 }])
    expect(updates.room1).toEqual([{ roomId: 1 }])
    expect(updates.room2).toEqual([])
    expect(updates.staff2).toEqual([])
    expect(updates.room3).toEqual([])
  })

  it('tells nobody when the same request is replayed', async () => {
    await book()
    const updates = watch()

    const replay = await book()

    expect(replay.headers['idempotent-replayed']).toBe('true')
    expectNobodyNotified(updates)
  })

  it('tells nobody when the slot is refused', async () => {
    const updates = watch()

    const response = await book({ startsAt: '2027-03-11T10:15:00.000Z' })

    expect(response.statusCode).toBe(422)
    expectNobodyNotified(updates)
  })

  it('tells only the company of the key, not the other one', async () => {
    const tokenB = seedToken(2).token
    const updates = watch()

    const response = await book({ roomId: 3 }, 'key-b', bearer(tokenB))

    expect(response.statusCode).toBe(201)
    expect(updates.staff2).toEqual([{ roomId: 3 }])
    expect(updates.room3).toEqual([{ roomId: 3 }])
    expect(updates.staff1).toEqual([])
    expect(updates.room1).toEqual([])
  })
})

describe('PATCH /public/v1/bookings/:id', () => {
  it('tells the room once when the booking moves inside it', async () => {
    const id = await seedBooking()
    const updates = watch()

    const response = await send('PATCH', `${URL}/${id}`, { startsAt: OTHER_SLOT })

    expect(response.statusCode).toBe(200)
    expect(updates.staff1).toEqual([{ roomId: 1 }])
    expect(updates.room1).toEqual([{ roomId: 1 }])
    expect(updates.room2).toEqual([])
  })

  it('tells both rooms when the booking changes room', async () => {
    const id = await seedBooking()
    const updates = watch()

    const response = await send('PATCH', `${URL}/${id}`, { roomId: 2 })

    expect(response.statusCode).toBe(200)
    expect(updates.room1).toEqual([{ roomId: 1 }])
    expect(updates.room2).toEqual([{ roomId: 2 }])
    expect(updates.staff1).toEqual([{ roomId: 1 }, { roomId: 2 }])
    expect(updates.staff2).toEqual([])
    expect(updates.room3).toEqual([])
  })

  it('tells nobody when the update is refused', async () => {
    const id = await seedBooking()
    const updates = watch()

    const response = await send('PATCH', `${URL}/${id}`, { startsAt: '2027-03-11T10:15:00.000Z' })

    expect(response.statusCode).toBe(422)
    expectNobodyNotified(updates)
  })

  it('tells nobody when another company tries to change it', async () => {
    const id = await seedBooking()
    const tokenB = seedToken(2).token
    const updates = watch()

    const response = await send('PATCH', `${URL}/${id}`, { roomId: 2 }, bearer(tokenB))

    expect(response.statusCode).toBe(404)
    expectNobodyNotified(updates)
  })
})

describe('DELETE /public/v1/bookings/:id', () => {
  it('tells the room and the staff once, and not again when cancelled twice', async () => {
    const id = await seedBooking()
    const updates = watch()

    const first = await send('DELETE', `${URL}/${id}`)
    const second = await send('DELETE', `${URL}/${id}`)

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(updates.staff1).toEqual([{ roomId: 1 }])
    expect(updates.room1).toEqual([{ roomId: 1 }])
    expect(updates.staff2).toEqual([])
    expect(updates.room3).toEqual([])
  })

  it('tells nobody when another company tries to cancel it', async () => {
    const id = await seedBooking()
    const tokenB = seedToken(2).token
    const updates = watch()

    const response = await send('DELETE', `${URL}/${id}`, undefined, bearer(tokenB))

    expect(response.statusCode).toBe(404)
    expectNobodyNotified(updates)
  })
})
