import '../routes/_helpers/registerDbMock'

import liveHubPlugin from '@backend/plugins/liveHub'
import liveJoinRegistrationsPlugin from '@backend/plugins/liveJoinRegistrations'
import publicRoutes from '@backend/routes/public'
import { PUBLIC_API_PREFIX } from '@backend/routes/public/_shared'
import {
  COMPANY_STATUS_ACTIVE,
  GAME_STATE_PENDING,
  GAME_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState, resetDb } from '../routes/_helpers/mockDb'
import {
  expectNobodyNotified,
  expectOnlyCompany1Notified,
  watchGameUpdates,
} from '../routes/_helpers/testApp'

const REGISTRATIONS = `${PUBLIC_API_PREFIX}/join/registrations`
const NOW = new Date('2027-03-10T08:00:00.000Z')
const TOKEN = 'a'.repeat(43)
const OTHER_TOKEN = 'b'.repeat(43)

async function createApp() {
  const app = fastify({ logger: false })

  await app.register(liveHubPlugin as never)
  await app.register(liveJoinRegistrationsPlugin as never)
  await app.register(publicRoutes as never, { prefix: PUBLIC_API_PREFIX })
  await app.ready()

  return app
}

let app: Awaited<ReturnType<typeof createApp>>
let updates: ReturnType<typeof watchGameUpdates>

const register = (token: string, displayName = 'Camille') =>
  app.inject({
    method: 'POST',
    url: REGISTRATIONS,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ token, displayName }),
  })

/** Une partie en attente de la compagnie 2 (salle 3), avec un lien ouvert ou expiré. */
function seedCompany2Game(expired = false) {
  dbState.companies[1]!.status = COMPANY_STATUS_ACTIVE
  dbState.rooms.push({ id: 3, company_id: 2, name: 'Salle B', status: ROOM_STATUS_ACTIVE })
  dbState.games.push({
    id: 2,
    company_id: 2,
    room_id: 3,
    state: GAME_STATE_PENDING,
    status: GAME_STATUS_ACTIVE,
    join_token: OTHER_TOKEN,
    join_expires_at: new Date(NOW.getTime() + (expired ? -1000 : 3_600_000)).toISOString(),
  })
}

/** Laisse passer le crochet `onResponse`, qui s'exécute après l'envoi de la réponse. */
const settle = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(async () => {
  resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  dbState.rooms.push({ id: 1, company_id: 1, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE })
  dbState.games.push({
    id: 1,
    company_id: 1,
    room_id: 1,
    state: GAME_STATE_PENDING,
    status: GAME_STATUS_ACTIVE,
    join_token: TOKEN,
    join_expires_at: new Date(NOW.getTime() + 3_600_000).toISOString(),
  })
  app = await createApp()
  updates = watchGameUpdates(app)
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

describe('plugins/liveJoinRegistrations', () => {
  it('tells the room and the staff of the company when a phone registers, by the game id only', async () => {
    const response = await register(TOKEN, 'Camille')

    await settle()

    expect(response.statusCode).toBe(201)
    expectOnlyCompany1Notified(updates, 1)
    expect(JSON.stringify(updates)).not.toMatch(/Camille|token|@/)
  })

  it('tells nobody when the link is unknown, closed or the body invalid', async () => {
    seedCompany2Game(true)

    const unknown = await register('c'.repeat(43))
    const expired = await register(OTHER_TOKEN)
    const invalid = await app.inject({
      method: 'POST',
      url: REGISTRATIONS,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ token: TOKEN }),
    })

    await settle()

    expect([unknown.statusCode, expired.statusCode, invalid.statusCode]).toEqual([404, 410, 400])
    expectNobodyNotified(updates)
  })

  it('tells only the company of the game: the token of another game never reaches company 1', async () => {
    seedCompany2Game()

    const response = await register(OTHER_TOKEN)

    await settle()

    expect(response.statusCode).toBe(201)
    expect(updates.staff2).toEqual([{ gameId: 2 }])
    expect(updates.room3).toEqual([{ gameId: 2 }])
    expect(updates.staff1).toEqual([])
    expect(updates.room1).toEqual([])
    expect(updates.room2).toEqual([])
  })
})
