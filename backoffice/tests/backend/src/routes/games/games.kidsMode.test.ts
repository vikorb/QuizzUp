import '../_helpers/registerRouteMocks'

import gamesRoutes from '@backend/routes/games'
import { toGameRow } from '@backend/routes/games/_shared'
import {
  GAME_STATE_PENDING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState, MOCK_NOW } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  type TestUser,
} from '../_helpers/testApp'

resetRouteMocksBeforeEach()

type GameBody = { game: Record<string, unknown> }

const NOW = new Date('2027-03-10T08:00:00.000Z')
const otherCompanyAdmin = { ...companyAdminUser, company_id: 2, companyId: 2 } as TestUser

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function seedRoom() {
  dbState.rooms.push({
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: {},
    status: ROOM_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
  })
}

function seedGame(overrides: Record<string, unknown> = {}) {
  dbState.games.push({
    id: 1,
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
    scheduled_at: '2027-03-10T13:00:00.000Z',
    scheduled_end_at: '2027-03-10T14:00:00.000Z',
    cancelled_at: null,
    kids_mode: false,
    status: GAME_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

async function call(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
  user: TestUser = companyAdminUser
) {
  const app = await createRouteApp(gamesRoutes)
  const response = await app.inject({ method, url, headers: authHeaders(user), payload })

  await app.close()

  return response
}

const PARTICIPANTS = [{ podium: 1, displayName: 'Léa' }]

describe('mode enfants — POST /companies/:companyId/games', () => {
  it('stores kidsMode and returns it', async () => {
    seedRoom()

    const response = await call('POST', '/companies/1/games', {
      roomId: 1,
      participants: PARTICIPANTS,
      kidsMode: true,
    })

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game).toMatchObject({ kidsMode: true })
    expect(dbState.games[0]).toMatchObject({ state: GAME_STATE_PENDING, kids_mode: true })
  })

  it('creates a game without kidsMode as a normal game', async () => {
    seedRoom()

    const response = await call('POST', '/companies/1/games', {
      roomId: 1,
      participants: PARTICIPANTS,
    })

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game).toMatchObject({ kidsMode: false })
    expect(dbState.games[0]).toMatchObject({ kids_mode: false })
  })

  it('refuses a kidsMode that is not a boolean', async () => {
    seedRoom()

    const response = await call('POST', '/companies/1/games', {
      roomId: 1,
      participants: PARTICIPANTS,
      kidsMode: 'oui',
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson<{ error: string }>(response).error).toBe('invalid_body')
    expect(dbState.games).toHaveLength(0)
  })

  it('refuses an admin of another company: nothing is created', async () => {
    seedRoom()

    const response = await call(
      'POST',
      '/companies/1/games',
      { roomId: 1, participants: PARTICIPANTS, kidsMode: true },
      otherCompanyAdmin
    )

    expect(response.statusCode).toBe(403)
    expect(dbState.games).toHaveLength(0)
  })
})

describe('mode enfants — PATCH /companies/:companyId/games/:gameId', () => {
  it('turns the mode on, then off, on a scheduled session', async () => {
    seedRoom()
    seedGame()

    const on = await call('PATCH', '/companies/1/games/1', { kidsMode: true })

    expect(on.statusCode).toBe(200)
    expect(parseJson<GameBody>(on).game).toMatchObject({ kidsMode: true })
    expect(dbState.games[0].kids_mode).toBe(true)

    const off = await call('PATCH', '/companies/1/games/1', { kidsMode: false })

    expect(off.statusCode).toBe(200)
    expect(parseJson<GameBody>(off).game).toMatchObject({ kidsMode: false })
    expect(dbState.games[0].kids_mode).toBe(false)
  })

  it('keeps the mode when the field is absent', async () => {
    seedRoom()
    seedGame({ kids_mode: true })

    const response = await call('PATCH', '/companies/1/games/1', { roundsCount: 5 })

    expect(response.statusCode).toBe(200)
    expect(parseJson<GameBody>(response).game).toMatchObject({ roundsCount: 5, kidsMode: true })
    expect(dbState.games[0].kids_mode).toBe(true)
  })

  it('refuses a kidsMode that is not a boolean', async () => {
    seedRoom()
    seedGame()

    const response = await call('PATCH', '/companies/1/games/1', { kidsMode: 1 })

    expect(response.statusCode).toBe(400)
    expect(dbState.games[0].kids_mode).toBe(false)
  })

  it('does not let another company change the mode, whether it targets its own or the other path', async () => {
    seedRoom()
    seedGame()

    const foreignPath = await call(
      'PATCH',
      '/companies/1/games/1',
      { kidsMode: true },
      otherCompanyAdmin
    )
    const ownPath = await call(
      'PATCH',
      '/companies/2/games/1',
      { kidsMode: true },
      otherCompanyAdmin
    )

    expect(foreignPath.statusCode).toBe(403)
    expect(ownPath.statusCode).toBe(404)
    expect(dbState.games[0].kids_mode).toBe(false)
  })
})

describe('mode enfants — lecture', () => {
  it('returns kidsMode on the sheet and on the list of the own company only', async () => {
    seedRoom()
    seedGame({ kids_mode: true })

    const sheet = await call('GET', '/companies/1/games/1')
    const list = await call('GET', '/companies/1/games')
    const foreign = await call('GET', '/companies/2/games/1', undefined, otherCompanyAdmin)

    expect(parseJson<GameBody>(sheet).game).toMatchObject({ kidsMode: true })
    expect(parseJson<{ games: Array<Record<string, unknown>> }>(list).games[0]).toMatchObject({
      kidsMode: true,
    })
    expect(foreign.statusCode).toBe(404)
  })

  it('reads a missing column as a normal game', () => {
    expect(toGameRow({ id: 1, companyId: 1, roomId: 1, seed: 1 }).kidsMode).toBe(false)
  })
})
