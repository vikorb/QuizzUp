import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_FORMAT_CUSTOM,
  GAME_FORMAT_DISCOVERY,
  GAME_FORMAT_SETTINGS,
  GAME_FORMAT_SHORT,
  GAME_FORMAT_STANDARD,
  GAME_FORMATS,
  GAME_STATE_PENDING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import gamesRoutes from '@backend/routes/games'
import { createGameSchema } from '@backend/routes/games/_schemas'
import roomRoutes from '@backend/routes/room'
import { dbState, MOCK_NOW } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  type TestUser,
} from '../_helpers/testApp'

resetRouteMocksBeforeEach()

type GameBody = { game: Record<string, unknown> }
type ListBody = { games: Array<Record<string, unknown>> }

const operator = { ...companyUser, company_id: 1, companyId: 1 } as TestUser
const otherCompanyAdmin = { ...companyAdminUser, company_id: 2, companyId: 2 } as TestUser
const roomUser = {
  sub: '10',
  id: 10,
  company_id: 1,
  role: ADMIN_ROLE_ROOM,
  room_id: 1,
  sid: 'sid-room',
} as TestUser

const PARTICIPANTS = [{ podium: 1, displayName: 'Léa' }]
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const FIXED_FORMATS = [GAME_FORMAT_DISCOVERY, GAME_FORMAT_SHORT, GAME_FORMAT_STANDARD] as const

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

/** Sans `format` par défaut : une partie d'avant les formats (le mockDb n'applique aucun défaut). */
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
    state: GAME_STATE_PENDING,
    started_at: null,
    finished_at: null,
    scheduled_at: null,
    scheduled_end_at: null,
    status: GAME_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

async function call(
  method: 'POST' | 'PATCH' | 'GET',
  url: string,
  payload?: Record<string, unknown>,
  user: TestUser = operator
) {
  const app = await createRouteApp(gamesRoutes)
  const response = await app.inject({ method, url, headers: authHeaders(user), payload })

  await app.close()

  return response
}

function launch(extra: Record<string, unknown>, user: TestUser = operator) {
  seedRoom()

  return call(
    'POST',
    '/companies/1/games',
    { roomId: 1, participants: PARTICIPANTS, ...extra },
    user
  )
}

async function readCurrentRoomGame() {
  const app = await createRouteApp(roomRoutes)
  const response = await app.inject({
    method: 'GET',
    url: '/room/games/current',
    headers: authHeaders(roomUser),
  })

  await app.close()

  return parseJson<{ game: Record<string, unknown> }>(response).game
}

describe('POST /companies/:companyId/games — format', () => {
  it.each(FIXED_FORMATS)('format %s takes its numbers from the shared constant', async (format) => {
    const counts = GAME_FORMAT_SETTINGS[format]
    const response = await launch({ format })

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game).toMatchObject({ format, ...counts })
    expect(dbState.games[0]).toMatchObject({
      format,
      rounds_count: counts.roundsCount,
      questions_per_round: counts.questionsPerRound,
    })
  })

  it('defaults to the standard format when nothing is sent', async () => {
    const response = await launch({})

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      format: GAME_FORMAT_STANDARD,
      roundsCount: GAME_DEFAULT_ROUNDS,
      questionsPerRound: GAME_DEFAULT_QUESTIONS_PER_ROUND,
    })
  })

  it('makes a custom game when numbers are sent without a format', async () => {
    const response = await launch({ roundsCount: 4, questionsPerRound: 5 })

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      format: GAME_FORMAT_CUSTOM,
      roundsCount: 4,
      questionsPerRound: 5,
    })
  })

  it('completes a single number with the default one', async () => {
    const response = await launch({ roundsCount: 4 })

    expect(parseJson<GameBody>(response).game).toMatchObject({
      format: GAME_FORMAT_CUSTOM,
      roundsCount: 4,
      questionsPerRound: GAME_DEFAULT_QUESTIONS_PER_ROUND,
    })
  })

  it('keeps the numbers of an explicit custom format', async () => {
    const response = await launch({
      format: GAME_FORMAT_CUSTOM,
      roundsCount: 2,
      questionsPerRound: 12,
    })

    expect(parseJson<GameBody>(response).game).toMatchObject({
      format: GAME_FORMAT_CUSTOM,
      roundsCount: 2,
      questionsPerRound: 12,
    })
  })

  it('gives a custom format without numbers the default numbers', async () => {
    const response = await launch({ format: GAME_FORMAT_CUSTOM })

    expect(parseJson<GameBody>(response).game).toMatchObject({
      format: GAME_FORMAT_CUSTOM,
      roundsCount: GAME_DEFAULT_ROUNDS,
      questionsPerRound: GAME_DEFAULT_QUESTIONS_PER_ROUND,
    })
  })

  it.each([
    ['rounds', { roundsCount: 3 }],
    ['questions', { questionsPerRound: 3 }],
    ['both numbers, even equal to the format', { roundsCount: 3, questionsPerRound: 3 }],
  ])('refuses a fixed format mixed with %s', async (_label, counts) => {
    const response = await launch({ format: GAME_FORMAT_DISCOVERY, ...counts })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({
      error: 'invalid_body',
      details: { fieldErrors: { format: ['format_fixes_counts'] } },
    })
    expect(dbState.games).toHaveLength(0)
  })

  it('refuses a format that is not in the shared list', async () => {
    const response = await launch({ format: 'epic' })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({
      error: 'invalid_body',
      details: { fieldErrors: { format: expect.any(Array) } },
    })
    expect(dbState.games).toHaveLength(0)
  })

  it('accepts every format of GAME_FORMATS and nothing else', () => {
    const base = { roomId: 1, participants: PARTICIPANTS }

    for (const format of GAME_FORMATS) {
      expect(createGameSchema.safeParse({ ...base, format }).success).toBe(true)
    }
    expect(createGameSchema.safeParse({ ...base, format: 'unknown' }).success).toBe(false)
  })

  it('stores the format of a scheduled session too', async () => {
    // Demain, à la minute près : dans l'horizon des sessions, sans horloge simulée.
    const tomorrow = new Date(Math.ceil((Date.now() + DAY_MS) / MINUTE_MS) * MINUTE_MS)
    const response = await launch({
      format: GAME_FORMAT_SHORT,
      scheduledAt: tomorrow.toISOString(),
    })

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      state: GAME_STATE_SCHEDULED,
      format: GAME_FORMAT_SHORT,
      roundsCount: 6,
      questionsPerRound: 7,
    })
  })

  it('lets a company create nothing in the room of another one', async () => {
    const response = await launch({ format: GAME_FORMAT_SHORT }, otherCompanyAdmin)

    expect(response.statusCode).toBe(403)
    expect(dbState.games).toHaveLength(0)
  })
})

describe('reading the format', () => {
  it('returns null for a game created before the formats', async () => {
    seedRoom()
    seedGame()

    const detail = await call('GET', '/companies/1/games/1')
    const list = await call('GET', '/companies/1/games')

    expect(parseJson<GameBody>(detail).game.format).toBeNull()
    expect(parseJson<ListBody>(list).games[0]).toMatchObject({ format: null, roundsCount: 10 })
  })

  it('returns the stored format in the detail and the list', async () => {
    seedRoom()
    seedGame({ format: GAME_FORMAT_SHORT, rounds_count: 6, questions_per_round: 7 })

    const detail = await call('GET', '/companies/1/games/1')
    const list = await call('GET', '/companies/1/games')

    expect(parseJson<GameBody>(detail).game.format).toBe(GAME_FORMAT_SHORT)
    expect(parseJson<ListBody>(list).games[0]!.format).toBe(GAME_FORMAT_SHORT)
  })

  it('does not show the games of a company to another one', async () => {
    seedRoom()
    seedGame({ format: GAME_FORMAT_SHORT })

    const detail = await call('GET', '/companies/1/games/1', undefined, otherCompanyAdmin)
    const list = await call('GET', '/companies/1/games', undefined, otherCompanyAdmin)

    expect(detail.statusCode).toBe(403)
    expect(list.statusCode).toBe(403)
  })

  it('puts the format in game for GET /room/games/current', async () => {
    seedRoom()
    seedGame({ format: GAME_FORMAT_DISCOVERY, rounds_count: 3, questions_per_round: 3 })

    expect(await readCurrentRoomGame()).toMatchObject({
      format: GAME_FORMAT_DISCOVERY,
      roundsCount: 3,
      questionsPerRound: 3,
    })
  })

  it('gives the room a null format for an old game', async () => {
    seedRoom()
    seedGame()

    expect((await readCurrentRoomGame()).format).toBeNull()
  })
})

describe('PATCH /companies/:companyId/games/:gameId — format', () => {
  const SESSION = {
    state: GAME_STATE_SCHEDULED,
    scheduled_at: '2999-03-10T13:00:00.000Z',
    scheduled_end_at: '2999-03-10T14:00:00.000Z',
    format: GAME_FORMAT_SHORT,
    rounds_count: 6,
    questions_per_round: 7,
  }
  const patch = (payload: Record<string, unknown>, user: TestUser = operator) =>
    call('PATCH', '/companies/1/games/1', payload, user)

  it.each([
    ['rounds', { roundsCount: 5 }],
    ['questions', { questionsPerRound: 5 }],
    ['both', { roundsCount: 3, questionsPerRound: 3 }],
  ])('turns the format to custom when %s change', async (_label, payload) => {
    seedRoom()
    seedGame(SESSION)

    const response = await patch(payload)

    expect(response.statusCode).toBe(200)
    expect(parseJson<GameBody>(response).game.format).toBe(GAME_FORMAT_CUSTOM)
    expect(dbState.games[0]!.format).toBe(GAME_FORMAT_CUSTOM)
  })

  it('keeps the format when the numbers are not touched', async () => {
    seedRoom()
    seedGame(SESSION)

    const response = await patch({ locale: 'en' })

    expect(response.statusCode).toBe(200)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      format: GAME_FORMAT_SHORT,
      roundsCount: 6,
      questionsPerRound: 7,
    })
  })

  it('does not let another company change the numbers or the format', async () => {
    seedRoom()
    seedGame(SESSION)

    const response = await patch({ roundsCount: 5 }, otherCompanyAdmin)

    expect(response.statusCode).toBe(403)
    expect(dbState.games[0]).toMatchObject({ format: GAME_FORMAT_SHORT, rounds_count: 6 })
  })
})
