import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_SEED_MAX,
  GAME_STATE_ABORTED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATUS_ACTIVE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAMES,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'
import gamesRoutes from '@backend/routes/games'
import { findGameParticipants, toGameRow } from '@backend/routes/games/_shared'
import { dbState, MOCK_NOW, resetDb } from '../_helpers/mockDb'
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
      // Le staff saisit l'email mais ne le relit pas (RGPD) : il est bien gardé en base.
      expect(game.participants).toEqual([
        expect.objectContaining({
          podium: 1,
          displayName: 'Léa',
          email: null,
          hasEmail: true,
          consentAt: MOCK_NOW,
          secondPlayer: null,
        }),
        expect.objectContaining({ podium: 2, displayName: 'Hugo', email: null, hasEmail: false }),
      ])
      expect(dbState.game_participants[0]).toMatchObject({
        email: 'lea@exemple.fr',
        consent_at: MOCK_NOW,
      })

      await app.close()
    })

    it('stores an optional second player per podium with their own GDPR email', async () => {
      seedRoom()
      const app = await createRouteApp(gamesRoutes)

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(companyAdminUser),
        payload: {
          roomId: 1,
          participants: [
            {
              podium: 1,
              displayName: 'Léa',
              secondPlayer: { displayName: 'Noé', email: 'NOE@exemple.fr', emailConsent: true },
            },
            { podium: 2, displayName: 'Hugo', secondPlayer: { displayName: 'Inès' } },
          ],
        },
      })
      const missingConsent = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(companyAdminUser),
        payload: {
          roomId: 1,
          participants: [
            {
              podium: 1,
              displayName: 'Léa',
              secondPlayer: { displayName: 'Noé', email: 'n@x.fr' },
            },
          ],
        },
      })

      expect(response.statusCode).toBe(201)
      expect(parseJson<GameBody>(response).game.participants).toEqual([
        expect.objectContaining({
          podium: 1,
          secondPlayer: {
            displayName: 'Noé',
            email: 'noe@exemple.fr',
            hasEmail: true,
            consentAt: MOCK_NOW,
          },
        }),
        expect.objectContaining({
          podium: 2,
          secondPlayer: { displayName: 'Inès', email: null, hasEmail: false, consentAt: null },
        }),
      ])
      expect(dbState.game_participants[0]).toMatchObject({
        second_display_name: 'Noé',
        second_email: 'noe@exemple.fr',
        second_consent_at: MOCK_NOW,
      })
      expect(missingConsent.statusCode).toBe(400)
      expect(JSON.stringify(parseJson(missingConsent))).toContain('email_consent_required')

      await app.close()
    })

    it('shows player emails to admins only, never to the staff', async () => {
      seedRoom()
      seedGame()
      dbState.game_participants.push({
        id: 1,
        game_id: 1,
        podium: 1,
        display_name: 'Léa',
        email: 'lea@exemple.fr',
        consent_at: MOCK_NOW,
        second_display_name: 'Noé',
        second_email: 'noe@exemple.fr',
        second_consent_at: MOCK_NOW,
        score: 0,
      })
      const app = await createRouteApp(gamesRoutes)

      const asAdmin = await app.inject({
        method: 'GET',
        url: '/companies/1/games/1',
        headers: authHeaders(companyAdminUser),
      })
      const asStaff = await app.inject({
        method: 'GET',
        url: '/companies/1/games/1',
        headers: authHeaders(operator),
      })

      expect(parseJson<GameBody>(asAdmin).game.participants[0]).toMatchObject({
        email: 'lea@exemple.fr',
        secondPlayer: { email: 'noe@exemple.fr' },
      })
      expect(parseJson<GameBody>(asStaff).game.participants[0]).toMatchObject({
        email: null,
        hasEmail: true,
        secondPlayer: { displayName: 'Noé', email: null, hasEmail: true },
      })
      expect(asStaff.body).not.toContain('@exemple.fr')

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

    it('refuses to launch a game in an inactive company', async () => {
      seedRoom()
      dbState.companies[0]!.status = COMPANY_STATUS_INACTIVE
      const app = await createRouteApp(gamesRoutes)

      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(superadminUser),
        payload: { roomId: 1, participants: PARTICIPANTS },
      })

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'company_inactive' })
      expect(dbState.games).toHaveLength(0)

      await app.close()
    })
  })

  describe('POST /companies/:companyId/games — mini-jeux', () => {
    async function launch(extra: Record<string, unknown>) {
      seedRoom()
      const app = await createRouteApp(gamesRoutes)
      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(operator),
        payload: { roomId: 1, participants: PARTICIPANTS, ...extra },
      })

      await app.close()
      return response
    }

    it('stores the chosen subset as JSON and returns it as an array', async () => {
      const response = await launch({ miniGames: [MINI_GAME_FIRST_BUZZ, MINI_GAME_QUICK_ANSWER] })

      expect(response.statusCode).toBe(201)
      expect(dbState.games[0]!.mini_games).toBe(
        JSON.stringify([MINI_GAME_FIRST_BUZZ, MINI_GAME_QUICK_ANSWER])
      )
      // Relu dans l'ordre des codes partagés, quel que soit l'ordre d'envoi.
      expect(parseJson<GameBody>(response).game.miniGames).toEqual([
        MINI_GAME_QUICK_ANSWER,
        MINI_GAME_FIRST_BUZZ,
      ])
    })

    it('stores a single mini-game', async () => {
      const response = await launch({ miniGames: [MINI_GAME_FLASH_BLIND_TEST] })

      expect(response.statusCode).toBe(201)
      expect(dbState.games[0]!.mini_games).toBe(JSON.stringify([MINI_GAME_FLASH_BLIND_TEST]))
    })

    it('stores null when the whole list is sent, whatever its order', async () => {
      const response = await launch({ miniGames: [...MINI_GAMES].reverse() })

      expect(response.statusCode).toBe(201)
      expect(dbState.games[0]!.mini_games ?? null).toBeNull()
      expect(parseJson<GameBody>(response).game.miniGames).toBeNull()
    })

    it('stores the list when only one mini-game is missing', async () => {
      const response = await launch({ miniGames: MINI_GAMES.slice(1) })

      expect(response.statusCode).toBe(201)
      expect(dbState.games[0]!.mini_games).toBe(JSON.stringify(MINI_GAMES.slice(1)))
    })

    it('stores null (= every mini-game) when the field is omitted', async () => {
      const response = await launch({})

      expect(response.statusCode).toBe(201)
      expect(dbState.games[0]!.mini_games ?? null).toBeNull()
      expect(parseJson<GameBody>(response).game.miniGames).toBeNull()
    })

    it.each([
      ['an unknown code', { miniGames: ['not_a_mini_game'] }],
      ['a duplicate', { miniGames: [MINI_GAME_FIRST_BUZZ, MINI_GAME_FIRST_BUZZ] }],
      ['an empty array', { miniGames: [] }],
      ['a non-array value', { miniGames: MINI_GAME_FIRST_BUZZ }],
      ['null', { miniGames: null }],
    ])('rejects %s with a 400 and creates nothing', async (_label, extra) => {
      const response = await launch(extra)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({
        error: 'invalid_body',
        details: { fieldErrors: { miniGames: expect.any(Array) } },
      })
      expect(dbState.games).toHaveLength(0)
    })
  })

  describe('POST /companies/:companyId/games — six pupitres', () => {
    const sixPlayers = Array.from({ length: 6 }, (_item, index) => ({
      podium: index + 1,
      displayName: `Joueur ${index + 1}`,
    }))

    async function launch(participants: unknown, config?: Record<string, unknown>) {
      seedRoom(config ? { config } : {})
      const app = await createRouteApp(gamesRoutes)
      const response = await app.inject({
        method: 'POST',
        url: '/companies/1/games',
        headers: authHeaders(operator),
        payload: { roomId: 1, participants },
      })
      await app.close()

      return response
    }

    it('launches a game on 6 pupitres in a room set to 6', async () => {
      const response = await launch(sixPlayers, { desksCount: 6 })

      expect(response.statusCode).toBe(201)
      expect(
        parseJson<GameBody>(response).game.participants.map((participant) => participant.podium)
      ).toEqual([1, 2, 3, 4, 5, 6])
      expect(dbState.game_participants).toHaveLength(6)
    })

    it('accepts pupitre 5 in a room set to 5, but not pupitre 6', async () => {
      const fiveOk = await launch(sixPlayers.slice(0, 5), { desksCount: 5 })
      expect(fiveOk.statusCode).toBe(201)

      resetDb()
      const sixRefused = await launch(sixPlayers, { desksCount: 5 })
      expect(sixRefused.statusCode).toBe(400)
      expect(parseJson(sixRefused)).toEqual({ error: 'podium_not_in_room', desksCount: 5 })
    })

    it('refuses pupitre 5 in a room without desksCount (4 by default)', async () => {
      const response = await launch([
        { podium: 1, displayName: 'Léa' },
        { podium: 5, displayName: 'Hugo' },
      ])

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'podium_not_in_room', desksCount: 4 })
      expect(dbState.games).toHaveLength(0)
      expect(dbState.game_participants).toHaveLength(0)
    })

    it('refuses a pupitre beyond a small room, whatever the participants count', async () => {
      const response = await launch([{ podium: 3, displayName: 'Léa' }], { desksCount: 2 })

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'podium_not_in_room', desksCount: 2 })
    })

    it('clamps an out-of-range desksCount stored in the room config', async () => {
      // 12 est ramené à 6 : le pupitre 6 passe, comme dans la liste des salles.
      const response = await launch(sixPlayers, { desksCount: 12 })

      expect(response.statusCode).toBe(201)
    })

    it('still caps the schema at 6 pupitres and 6 participants', async () => {
      const podiumSeven = await launch([{ podium: 7, displayName: 'Léa' }], { desksCount: 6 })
      expect(podiumSeven.statusCode).toBe(400)
      expect(parseJson<{ error: string }>(podiumSeven).error).toBe('invalid_body')

      const sevenPlayers = [...sixPlayers, { podium: 6, displayName: 'Doublon' }]
      const tooMany = await launch(sevenPlayers, { desksCount: 6 })
      expect(tooMany.statusCode).toBe(400)
      expect(parseJson<{ error: string }>(tooMany).error).toBe('invalid_body')
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

  describe('GET /companies/:companyId/games/:gameId — mini-jeux', () => {
    it('returns the chosen mini-games of the game as an array', async () => {
      seedRoom()
      seedGame({ mini_games: [MINI_GAME_FIRST_BUZZ] })
      const app = await createRouteApp(gamesRoutes)

      const detail = await app.inject({
        method: 'GET',
        url: '/companies/1/games/1',
        headers: authHeaders(superadminUser),
      })

      expect(parseJson<GameBody>(detail).game.miniGames).toEqual([MINI_GAME_FIRST_BUZZ])

      await app.close()
    })

    it('returns null when the game has no restriction', async () => {
      seedRoom()
      seedGame()
      const app = await createRouteApp(gamesRoutes)

      const detail = await app.inject({
        method: 'GET',
        url: '/companies/1/games/1',
        headers: authHeaders(superadminUser),
      })
      const list = await app.inject({
        method: 'GET',
        url: '/companies/1/games',
        headers: authHeaders(superadminUser),
      })

      expect(parseJson<GameBody>(detail).game.miniGames).toBeNull()
      expect(
        parseJson<{ games: Array<Record<string, unknown>> }>(list).games[0]!.miniGames
      ).toBeNull()

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

describe('routes/games/_shared.ts', () => {
  describe('toMiniGames (via toGameRow)', () => {
    it('reads the jsonb array as sent by pg', () => {
      expect(
        toGameRow({ id: '1', seed: '1', miniGames: [MINI_GAME_QUICK_ANSWER, MINI_GAME_FIRST_BUZZ] })
          .miniGames
      ).toEqual([MINI_GAME_QUICK_ANSWER, MINI_GAME_FIRST_BUZZ])
    })

    it('also accepts the JSON text form', () => {
      expect(
        toGameRow({ id: '1', seed: '1', miniGames: JSON.stringify([MINI_GAME_FIRST_BUZZ]) })
          .miniGames
      ).toEqual([MINI_GAME_FIRST_BUZZ])
    })

    it('puts the codes back in the shared order and drops unknown ones', () => {
      expect(
        toGameRow({
          id: '1',
          seed: '1',
          miniGames: [MINI_GAME_FIRST_BUZZ, 'retired_game', MINI_GAME_FLASH_BLIND_TEST],
        }).miniGames
      ).toEqual([MINI_GAME_FLASH_BLIND_TEST, MINI_GAME_FIRST_BUZZ])
    })

    it.each([
      ['invalid JSON text', 'not json'],
      ['null', null],
      ['undefined', undefined],
      ['an empty array', []],
      ['only unknown codes', ['retired_game']],
      ['an object', { a: 1 }],
      ['the JSON text null', 'null'],
      ['an empty JSON array text', '[]'],
    ])('returns null (= every mini-game) for %s', (_label, value) => {
      expect(toGameRow({ id: '1', seed: '1', miniGames: value }).miniGames).toBeNull()
    })
  })

  it('returns bigint ids, seed and counters as numbers (pg sends them as text)', () => {
    const row = toGameRow({
      id: '7',
      companyId: '1',
      roomId: '3',
      adminId: '2',
      seed: '4294967295',
      participantsCount: '4',
      state: GAME_STATE_PENDING,
    })

    expect(row).toMatchObject({
      id: 7,
      companyId: 1,
      roomId: 3,
      adminId: 2,
      seed: 4_294_967_295,
      participantsCount: 4,
    })
    expect(toGameRow({ id: '7', seed: '1' })).not.toHaveProperty('participantsCount')
  })

  it('returns participant ids as numbers', async () => {
    dbState.game_participants.push({
      id: '12',
      game_id: 1,
      podium: 2,
      display_name: 'Hugo',
      email: null,
      consent_at: null,
      score: '50',
    })

    expect(await findGameParticipants(1)).toEqual([
      expect.objectContaining({ id: 12, podium: 2, score: 50 }),
    ])
  })
})
