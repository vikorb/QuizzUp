import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  COMPANY_STATUS_DELETED,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_SEED_MAX,
  GAME_STATE_ABORTED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'
import gamesRoutes from '@backend/routes/games'
import { dbState, MOCK_NOW } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'

resetRouteMocksBeforeEach()

type GameBody = { game: Record<string, unknown> & { participants: Array<Record<string, unknown>> } }

const operator = { ...companyUser, company_id: 1, companyId: 1 } as TestUser

function seedRoom(overrides: Record<string, unknown> = {}) {
  dbState.rooms.push({
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: {},
    status: ROOM_STATUS_ACTIVE,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
    ...overrides,
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
    seed: 42,
    state: GAME_STATE_PENDING,
    started_at: null,
    finished_at: null,
    status: GAME_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

const PARTICIPANTS = [
  { podium: 1, displayName: 'Léa', email: 'LEA@exemple.fr', emailConsent: true },
  { podium: 2, displayName: 'Hugo' },
]

describe('routes/games.ts (US-GAME-08)', () => {
  describe('POST /companies/:companyId/games', () => {
    it('launches a pending 10 × 10 game with a 32-bit seed and its participants', async () => {
      seedRoom()
      const app = await createRouteApp(gamesRoutes)

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(operator),
        payload: { roomId: 1, participants: PARTICIPANTS },
      })

      expect(response.statusCode).toBe(201)
      const { game } = parseJson<GameBody>(response)
      expect(game).toMatchObject({
        companyId: 1,
        roomId: 1,
        adminId: 3,
        roundsCount: GAME_DEFAULT_ROUNDS,
        questionsPerRound: GAME_DEFAULT_QUESTIONS_PER_ROUND,
        state: GAME_STATE_PENDING,
      })
      expect(Number(game.seed)).toBeGreaterThanOrEqual(0)
      expect(Number(game.seed)).toBeLessThanOrEqual(GAME_SEED_MAX)
      expect(Number.isInteger(Number(game.seed))).toBe(true)
      expect(game.participants).toEqual([
        expect.objectContaining({
          podium: 1,
          displayName: 'Léa',
          email: 'lea@exemple.fr',
          consentAt: MOCK_NOW,
        }),
        expect.objectContaining({ podium: 2, displayName: 'Hugo', email: null, consentAt: null }),
      ])

      await app.close()
    })

    it('refuses an email without explicit GDPR consent', async () => {
      seedRoom()
      const app = await createRouteApp(gamesRoutes)

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(companyAdminUser),
        payload: {
          roomId: 1,
          participants: [{ podium: 1, displayName: 'Léa', email: 'lea@exemple.fr' }],
        },
      })

      expect(response.statusCode).toBe(400)
      expect(JSON.stringify(parseJson(response))).toContain('email_consent_required')
      expect(dbState.games).toHaveLength(0)

      await app.close()
    })

    it.each<[Record<string, unknown>, string]>([
      [{ participants: [] }, 'no participant'],
      [{ participants: [...PARTICIPANTS, ...PARTICIPANTS, ...PARTICIPANTS] }, 'more than 4'],
      [{ participants: [PARTICIPANTS[1], PARTICIPANTS[1]] }, 'duplicated podium'],
      [{ participants: [{ podium: 5, displayName: 'X' }] }, 'unknown podium'],
      [{ participants: [{ podium: 1, displayName: '  ' }] }, 'empty name'],
      [{ roundsCount: 21, participants: PARTICIPANTS }, 'too many rounds'],
    ])('rejects an invalid body (%o, %s)', async (body) => {
      seedRoom()
      const app = await createRouteApp(gamesRoutes)

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(companyAdminUser),
        payload: { roomId: 1, ...body },
      })

      expect(response.statusCode).toBe(400)

      await app.close()
    })

    it('needs an active room of the company that is not already playing', async () => {
      seedRoom()
      seedRoom({ id: 2, name: 'Fermée', status: ROOM_STATUS_INACTIVE })
      seedRoom({ id: 3, company_id: 2, name: 'Ailleurs' })
      seedGame()
      const app = await createRouteApp(gamesRoutes)
      const launch = (roomId: number, user: TestUser = companyAdminUser) =>
        app.inject({
          method: 'POST',
          url: '/companies/1/games',
          headers: authHeaders(user),
          payload: { roomId, participants: PARTICIPANTS },
        })

      const busy = await launch(1)
      const inactive = await launch(2)
      const otherCompanyRoom = await launch(3)
      const otherCompanyUser = await launch(1, companyUser)

      expect(busy.statusCode).toBe(409)
      expect(parseJson(busy)).toEqual({ error: 'room_busy' })
      expect(parseJson(inactive)).toEqual({ error: 'room_inactive' })
      expect(otherCompanyRoom.statusCode).toBe(404)
      expect(otherCompanyUser.statusCode).toBe(403)

      dbState.games[0]!.state = GAME_STATE_FINISHED
      expect((await launch(1)).statusCode).toBe(201)

      await app.close()
    })
  })

  describe('POST /companies/:companyId/games — edge cases', () => {
    it('accepts the room id as returned by the API (bigint as text)', async () => {
      seedRoom()
      const app = await createRouteApp(gamesRoutes)

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(companyAdminUser),
        payload: { roomId: '1', participants: PARTICIPANTS },
      })

      expect(response.statusCode).toBe(201)

      await app.close()
    })

    it('refuses to launch a game in a deleted company', async () => {
      seedRoom()
      dbState.companies[0]!.status = COMPANY_STATUS_DELETED
      const app = await createRouteApp(gamesRoutes)

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(superadminUser),
        payload: { roomId: 1, participants: PARTICIPANTS },
      })

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'company_deleted' })

      await app.close()
    })
  })

  describe('GET /companies/:companyId/games', () => {
    it('lists the games of the company, newest first, with the room name', async () => {
      seedRoom()
      seedGame({ state: GAME_STATE_FINISHED })
      seedGame({ id: 2 })
      seedGame({ id: 3, company_id: 2 })
      const app = await createRouteApp(gamesRoutes)

      const response = await app.inject({
        method: 'GET',
        url: '/companies/1/games',
        headers: authHeaders(operator),
      })
      const forbidden = await app.inject({
        method: 'GET',
        url: '/companies/1/games',
        headers: authHeaders(companyUser),
      })

      const { games } = parseJson<{ games: Array<Record<string, unknown>> }>(response)
      expect(games.map((game) => game.id)).toEqual([2, 1])
      expect(games[0]).toMatchObject({ roomName: 'Salle Néon', state: GAME_STATE_PENDING })
      expect(forbidden.statusCode).toBe(403)

      await app.close()
    })
  })

  describe('GET and abort /companies/:companyId/games/:gameId', () => {
    it('returns the game with its participants, then aborts it', async () => {
      seedRoom()
      seedGame()
      dbState.game_participants.push({
        id: 1,
        game_id: 1,
        podium: 1,
        display_name: 'Léa',
        email: null,
        consent_at: null,
        score: 0,
      })
      const app = await createRouteApp(gamesRoutes)

      const detail = await app.inject({
        method: 'GET',
        url: '/companies/1/games/1',
        headers: authHeaders(superadminUser),
      })
      const aborted = await app.inject({
        method: 'POST',
        url: '/companies/1/games/1/abort',
        headers: authHeaders(companyAdminUser),
      })
      const again = await app.inject({
        method: 'POST',
        url: '/companies/1/games/1/abort',
        headers: authHeaders(companyAdminUser),
      })
      const unknown = await app.inject({
        method: 'GET',
        url: '/companies/1/games/9',
        headers: authHeaders(superadminUser),
      })

      expect(parseJson<GameBody>(detail).game.participants).toEqual([
        expect.objectContaining({ podium: 1, displayName: 'Léa' }),
      ])
      expect(parseJson<GameBody>(aborted).game).toMatchObject({
        state: GAME_STATE_ABORTED,
        finishedAt: MOCK_NOW,
      })
      expect(again.statusCode).toBe(409)
      expect(unknown.statusCode).toBe(404)

      await app.close()
    })
  })
})
