import '../_helpers/registerDbMock'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMPANY_STATUS_ACTIVE, ROOM_STATUS_DELETED, ROOM_STATUS_INACTIVE } from '@quizzup/shared'
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

const listRooms = (headers: Record<string, string>) =>
  app.inject({ method: 'GET', url: '/public/v1/rooms', headers })

beforeEach(async () => {
  resetDb()
  dbState.companies[1]!.status = COMPANY_STATUS_ACTIVE
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PUBLIC_API_NOW)
  app = await createPublicApp()
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

describe('routes/public/rooms — GET /public/v1/rooms', () => {
  it('requires an API key', async () => {
    const response = await listRooms({})

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'api_key_missing' })
  })

  it('lists the bookable rooms the way public-v1.yaml describes them', async () => {
    const { token } = seedToken()
    const room = seedRoom({ id: 3, name: 'Salle Pirate' })

    const response = await listRooms(bearer(token))

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.json()).toEqual({
      rooms: [
        {
          id: room.id,
          name: 'Salle Pirate',
          timezone: 'Europe/Paris',
          slotMinutes: 60,
          breakMinutes: 0,
          bookableDesks: 4,
          maxPlayers: 8,
          days: OPEN_EVERY_DAY.days,
        },
      ],
    })
  })

  it('never offers more desks than the room has', async () => {
    const { token } = seedToken()
    seedRoom({ config: { desksCount: 2 }, schedule: { ...OPEN_EVERY_DAY, bookableDesks: 5 } })

    const [room] = (await listRooms(bearer(token))).json().rooms

    expect(room).toMatchObject({ bookableDesks: 2, maxPlayers: 4 })
  })

  it('skips rooms that are inactive, deleted, without slots or closed to public booking', async () => {
    const { token } = seedToken()
    const open = seedRoom({ name: 'Ouverte' })

    seedRoom({ name: 'Inactive', status: ROOM_STATUS_INACTIVE })
    seedRoom({ name: 'Supprimée', status: ROOM_STATUS_DELETED })
    seedRoom({ name: 'Sans créneaux', schedule: null })
    seedRoom({ name: 'Fermée', schedule: { ...OPEN_EVERY_DAY, publicBooking: false } })

    const { rooms } = (await listRooms(bearer(token))).json()

    expect(rooms.map((room: { id: number }) => room.id)).toEqual([open.id])
  })

  it("does not show a company's rooms to the key of another company", async () => {
    const a = seedToken(1)
    const b = seedToken(2)
    const roomOfA = seedRoom({ company_id: 1, name: 'Salle de A' })
    const roomOfB = seedRoom({ company_id: 2, name: 'Salle de B' })

    const seenByA = (await listRooms(bearer(a.token))).json().rooms
    const seenByB = (await listRooms(bearer(b.token))).json().rooms

    expect(seenByA.map((room: { id: number }) => room.id)).toEqual([roomOfA.id])
    expect(seenByB.map((room: { id: number }) => room.id)).toEqual([roomOfB.id])
  })

  it('exposes no internal field', async () => {
    const { token } = seedToken()
    seedRoom({ config: { desksCount: 4, secretField: 'x' } })

    const [room] = (await listRooms(bearer(token))).json().rooms

    expect(Object.keys(room).sort()).toEqual([
      'bookableDesks',
      'breakMinutes',
      'days',
      'id',
      'maxPlayers',
      'name',
      'slotMinutes',
      'timezone',
    ])
  })
})
