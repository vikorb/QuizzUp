import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_LIST_DEFAULT_LIMIT,
  GAME_LIST_MAX_LIMIT,
  GAME_SEED_MAX,
  GAME_STATE_ABORTED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATES,
  GAME_STATUS_ACTIVE,
  GAME_STATUS_DELETED,
  LIVE_EVENT,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAMES,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_INACTIVE,
  type RoomStatusReport,
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
  liveHubOf,
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
            marketingConsent: false,
          },
        }),
        expect.objectContaining({
          podium: 2,
          secondPlayer: {
            displayName: 'Inès',
            email: null,
            hasEmail: false,
            consentAt: null,
            marketingConsent: false,
          },
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

    describe('consentement aux offres du centre', () => {
      const otherCompanyAdmin = { ...companyAdminUser, company_id: 2, companyId: 2 } as TestUser

      function launch(participants: unknown, user: TestUser = companyAdminUser) {
        return createRouteApp(gamesRoutes).then(async (app) => {
          const response = await app.inject({
            method: 'POST',
            url: '/companies/1/games',
            headers: authHeaders(user),
            payload: { roomId: 1, participants },
          })

          await app.close()
          return response
        })
      }

      it('stores the offers consent apart from the email retention, for each player', async () => {
        seedRoom()

        const response = await launch([
          {
            podium: 1,
            displayName: 'Léa',
            email: 'lea@exemple.fr',
            emailConsent: true,
            marketingConsent: true,
            secondPlayer: {
              displayName: 'Noé',
              email: 'noe@exemple.fr',
              emailConsent: true,
            },
          },
          {
            podium: 2,
            displayName: 'Hugo',
            email: 'hugo@exemple.fr',
            emailConsent: true,
            secondPlayer: {
              displayName: 'Inès',
              email: 'ines@exemple.fr',
              emailConsent: true,
              marketingConsent: true,
            },
          },
        ])

        expect(response.statusCode).toBe(201)
        expect(dbState.game_participants[0]).toMatchObject({
          consent_at: MOCK_NOW,
          marketing_consent_at: MOCK_NOW,
          second_consent_at: MOCK_NOW,
          second_marketing_consent_at: null,
        })
        expect(dbState.game_participants[1]).toMatchObject({
          consent_at: MOCK_NOW,
          marketing_consent_at: null,
          second_consent_at: MOCK_NOW,
          second_marketing_consent_at: MOCK_NOW,
        })
        expect(parseJson<GameBody>(response).game.participants).toEqual([
          expect.objectContaining({
            marketingConsent: true,
            secondPlayer: expect.objectContaining({ marketingConsent: false }),
          }),
          expect.objectContaining({
            marketingConsent: false,
            secondPlayer: expect.objectContaining({ marketingConsent: true }),
          }),
        ])
      })

      it('does not record an offers consent that is explicitly false', async () => {
        seedRoom()

        const response = await launch([
          {
            podium: 1,
            displayName: 'Léa',
            email: 'lea@exemple.fr',
            emailConsent: true,
            marketingConsent: false,
          },
          { podium: 2, displayName: 'Hugo', marketingConsent: false },
        ])

        expect(response.statusCode).toBe(201)
        expect(dbState.game_participants[0]).toMatchObject({ marketing_consent_at: null })
        expect(dbState.game_participants[1]).toMatchObject({ marketing_consent_at: null })
      })

      it('stamps the offers consent with the server clock, ignoring client dates', async () => {
        seedRoom()

        const response = await launch([
          {
            podium: 1,
            displayName: 'Léa',
            email: 'lea@exemple.fr',
            emailConsent: true,
            marketingConsent: true,
            marketingConsentAt: '2020-01-01T00:00:00Z',
            marketing_consent_at: '2020-01-01T00:00:00Z',
          },
        ])

        expect(response.statusCode).toBe(201)
        expect(dbState.game_participants[0].marketing_consent_at).toBe(MOCK_NOW)
      })

      it.each<[string, unknown]>([
        ['the first player', { podium: 1, displayName: 'Léa', marketingConsent: true }],
        [
          'the first player with a null email',
          { podium: 1, displayName: 'Léa', email: null, marketingConsent: true },
        ],
        [
          'the second player',
          {
            podium: 1,
            displayName: 'Léa',
            secondPlayer: { displayName: 'Noé', marketingConsent: true },
          },
        ],
      ])('refuses an offers consent without email (%s)', async (_label, participant) => {
        seedRoom()

        const response = await launch([participant])

        expect(response.statusCode).toBe(400)
        expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
        expect(JSON.stringify(parseJson(response))).toContain('marketing_consent_requires_email')
        expect(dbState.games).toHaveLength(0)
        expect(dbState.game_participants).toHaveLength(0)
      })

      it('shows the offers consent to the staff, who never see the email', async () => {
        seedRoom()

        const created = await launch(
          [
            {
              podium: 1,
              displayName: 'Léa',
              email: 'lea@exemple.fr',
              emailConsent: true,
              marketingConsent: true,
            },
          ],
          operator
        )
        const app = await createRouteApp(gamesRoutes)
        const read = await app.inject({
          method: 'GET',
          url: '/companies/1/games/1',
          headers: authHeaders(operator),
        })
        await app.close()

        for (const response of [created, read]) {
          expect(parseJson<GameBody>(response).game.participants[0]).toMatchObject({
            email: null,
            hasEmail: true,
            marketingConsent: true,
          })
          expect(response.body).not.toContain('@exemple.fr')
        }
      })

      it('lets another company admin neither create nor read anything', async () => {
        seedRoom()
        seedGame()
        dbState.game_participants.push({
          id: 1,
          game_id: 1,
          podium: 1,
          display_name: 'Léa',
          email: 'lea@exemple.fr',
          consent_at: MOCK_NOW,
          marketing_consent_at: MOCK_NOW,
          score: 0,
        })
        const app = await createRouteApp(gamesRoutes)

        const created = await launch(
          [
            {
              podium: 1,
              displayName: 'Hugo',
              email: 'hugo@exemple.fr',
              emailConsent: true,
              marketingConsent: true,
            },
          ],
          otherCompanyAdmin
        )
        const read = await app.inject({
          method: 'GET',
          url: '/companies/1/games/1',
          headers: authHeaders(otherCompanyAdmin),
        })
        await app.close()

        expect(created.statusCode).toBe(403)
        expect(read.statusCode).toBe(403)
        expect(read.body).not.toContain('lea@exemple.fr')
        expect(dbState.game_participants).toHaveLength(1)
      })
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
    type ListBody = { games: Array<Record<string, unknown>>; total: number }

    async function list(query = '', user: TestUser = operator, companyId = 1) {
      const app = await createRouteApp(gamesRoutes)
      const response = await app.inject({
        method: 'GET',
        url: `/companies/${companyId}/games${query}`,
        headers: authHeaders(user),
      })

      await app.close()

      return response
    }

    function ids(response: Awaited<ReturnType<typeof list>>): unknown[] {
      return parseJson<ListBody>(response).games.map((game) => game.id)
    }

    it('lists the games of the company, newest first, with the room name and the total', async () => {
      seedRoom()
      seedGame({ state: GAME_STATE_FINISHED })
      seedGame({ id: 2 })
      seedGame({ id: 3, company_id: 2 })

      const response = await list()
      const forbidden = await list('', companyUser)

      const body = parseJson<ListBody>(response)
      expect(body.games.map((game) => game.id)).toEqual([2, 1])
      expect(body.total).toBe(2)
      expect(body.games[0]).toMatchObject({ roomName: 'Salle Néon', state: GAME_STATE_PENDING })
      expect(forbidden.statusCode).toBe(403)
    })

    it('does not show the games of another company, nor accept its id', async () => {
      seedRoom()
      seedRoom({ id: 2, company_id: 2, name: 'Ailleurs' })
      seedGame({ id: 1 })
      seedGame({ id: 2, company_id: 2, room_id: 2 })

      // L'admin de la compagnie 1 filtre sur la salle de la compagnie 2 : rien.
      const otherRoom = await list('?roomId=2', companyAdminUser)
      const otherCompany = await list('', companyAdminUser, 2)

      expect(parseJson<ListBody>(otherRoom)).toMatchObject({ games: [], total: 0 })
      expect(otherCompany.statusCode).toBe(403)
    })

    it('lets a superadmin read one company at a time', async () => {
      seedRoom()
      seedRoom({ id: 2, company_id: 2, name: 'Ailleurs' })
      seedGame({ id: 1 })
      seedGame({ id: 2, company_id: 2, room_id: 2 })
      seedGame({ id: 3, company_id: 2, room_id: 2 })

      const body = parseJson<ListBody>(await list('', superadminUser, 2))

      expect(body.games.map((game) => game.id)).toEqual([3, 2])
      expect(body.total).toBe(2)
      // La salle de la compagnie 1 filtrée sur la compagnie 2 : rien, pas de fuite.
      expect(parseJson<ListBody>(await list('?roomId=1', superadminUser, 2))).toMatchObject({
        games: [],
        total: 0,
      })
    })

    it.each(GAME_STATES)('accepts the state filter %s', async (state) => {
      seedRoom()
      seedGame({ id: 1, state })
      seedGame({
        id: 2,
        state: state === GAME_STATE_FINISHED ? GAME_STATE_PENDING : GAME_STATE_FINISHED,
      })

      const response = await list(`?state=${state}`)

      expect(response.statusCode).toBe(200)
      expect(ids(response)).toEqual([1])
    })

    it('excludes deleted games from the list and from the total', async () => {
      seedRoom()
      seedGame({ id: 1 })
      seedGame({ id: 2, status: GAME_STATUS_DELETED })

      const body = parseJson<ListBody>(await list())

      expect(body.games.map((game) => game.id)).toEqual([1])
      expect(body.total).toBe(1)
    })

    it('filters by state and by room', async () => {
      seedRoom()
      seedRoom({ id: 2, name: 'Salle Laser' })
      seedGame({ id: 1, state: GAME_STATE_FINISHED })
      seedGame({ id: 2, state: GAME_STATE_PENDING, room_id: 2 })
      seedGame({ id: 3, state: GAME_STATE_FINISHED, room_id: 2 })

      expect(ids(await list('?state=finished'))).toEqual([3, 1])
      expect(ids(await list('?roomId=2'))).toEqual([3, 2])
      expect(ids(await list('?state=finished&roomId=2'))).toEqual([3])
      expect(parseJson<ListBody>(await list('?state=finished&roomId=2')).total).toBe(1)
    })

    it('filters by period on the start date, falling back on the creation date', async () => {
      seedRoom()
      seedGame({ id: 1, created_at: '2026-11-01T10:00:00.000Z' })
      // Lancée le 1er, démarrée le 5 : la date retenue est celle du démarrage.
      seedGame({
        id: 2,
        created_at: '2026-11-01T11:00:00.000Z',
        started_at: '2026-11-05T09:00:00.000Z',
      })
      seedGame({ id: 3, created_at: '2026-11-10T08:00:00.000Z' })

      expect(ids(await list('?from=2026-11-05T00:00:00.000Z'))).toEqual([3, 2])
      expect(ids(await list('?to=2026-11-05T09:00:00.001Z'))).toEqual([2, 1])
      expect(ids(await list('?from=2026-11-02T00:00:00.000Z&to=2026-11-09T00:00:00.000Z'))).toEqual(
        [2]
      )
      // Fuseau : 2026-11-05T10:00+01:00 = 09:00 UTC, borne basse incluse.
      expect(ids(await list('?from=2026-11-05T10:00:00%2B01:00'))).toEqual([3, 2])
    })

    it('includes `from` but excludes `to` (half-open period)', async () => {
      seedRoom()
      seedGame({ id: 1, created_at: '2026-11-05T09:00:00.000Z' })

      expect(ids(await list('?from=2026-11-05T09:00:00.000Z'))).toEqual([1])
      expect(ids(await list('?to=2026-11-05T09:00:00.000Z'))).toEqual([])
      // Deux jours consécutifs ne se recoupent pas : une partie à minuit pile n'est que dans le second.
      seedGame({ id: 2, created_at: '2026-11-06T00:00:00.000Z' })
      expect(ids(await list('?from=2026-11-05T00:00:00Z&to=2026-11-06T00:00:00Z'))).toEqual([1])
      expect(ids(await list('?from=2026-11-06T00:00:00Z&to=2026-11-07T00:00:00Z'))).toEqual([2])
    })

    it('puts no cap on the period', async () => {
      seedRoom()
      seedGame({ id: 1, created_at: '2020-01-01T00:00:00.000Z' })

      const response = await list('?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z')

      expect(response.statusCode).toBe(200)
      expect(ids(response)).toEqual([1])
    })

    describe('pagination', () => {
      function seedMany(count: number) {
        seedRoom()
        for (let id = 1; id <= count; id += 1) {
          seedGame({ id })
        }
      }

      it('returns 50 games by default, and the total of the whole filter', async () => {
        seedMany(60)

        const body = parseJson<ListBody>(await list())

        expect(body.games).toHaveLength(GAME_LIST_DEFAULT_LIMIT)
        expect(body.total).toBe(60)
        expect(body.games[0]!.id).toBe(60)
      })

      it('pages with limit and offset, without gap or overlap, and keeps the same total', async () => {
        seedMany(7)

        const first = await list('?limit=3&offset=0')
        const second = await list('?limit=3&offset=3')
        const last = await list('?limit=3&offset=6')
        const beyond = await list('?limit=3&offset=30')

        expect(ids(first)).toEqual([7, 6, 5])
        expect(ids(second)).toEqual([4, 3, 2])
        expect(ids(last)).toEqual([1])
        expect(ids(beyond)).toEqual([])
        for (const response of [first, second, last, beyond]) {
          expect(parseJson<ListBody>(response).total).toBe(7)
        }
      })

      it('orders games with the same date by id, so pages stay stable', async () => {
        seedRoom()
        for (let id = 1; id <= 4; id += 1) {
          seedGame({ id, created_at: MOCK_NOW })
        }

        const pages = [...ids(await list('?limit=2')), ...ids(await list('?limit=2&offset=2'))]

        expect(pages).toEqual([4, 3, 2, 1])
      })

      it('orders by game date first: an older id can be the most recent game', async () => {
        seedRoom()
        seedGame({ id: 1, created_at: '2026-11-03T10:00:00.000Z' })
        // Créée avant la 1, mais démarrée après : date retenue = démarrage.
        seedGame({
          id: 2,
          created_at: '2026-11-01T10:00:00.000Z',
          started_at: '2026-11-04T10:00:00.000Z',
        })
        seedGame({ id: 3, created_at: '2026-11-02T10:00:00.000Z' })

        expect(ids(await list())).toEqual([2, 1, 3])
      })

      it('caps limit at the maximum instead of failing', async () => {
        seedMany(GAME_LIST_MAX_LIMIT + 5)

        const body = parseJson<ListBody>(await list(`?limit=${GAME_LIST_MAX_LIMIT + 100}`))

        expect(body.games).toHaveLength(GAME_LIST_MAX_LIMIT)
        expect(body.total).toBe(GAME_LIST_MAX_LIMIT + 5)
      })

      it('accepts the bounds limit=1 and offset=0', async () => {
        seedMany(2)

        expect(ids(await list('?limit=1&offset=0'))).toEqual([2])
      })
    })

    it.each([
      'limit=0',
      'limit=-1',
      'limit=abc',
      'limit=1.5',
      'offset=-1',
      'offset=abc',
      'state=unknown',
      'roomId=0',
      'roomId=abc',
      'from=yesterday',
      'from=2026-11-05',
      'to=2026-13-45T00:00:00Z',
      // PostgreSQL refuse l'année 0 : sans garde, 500 avec le texte de la requête SQL.
      'from=0000-01-01T00:00:00Z',
      'to=0000-06-01T00:00:00%2B01:00',
      // Année 1 à +14:00 : année 0 une fois ramenée en UTC.
      'from=0001-01-01T00:00:00%2B14:00',
    ])('refuses the invalid query %s with a 400', async (query) => {
      seedRoom()
      seedGame()

      const response = await list(`?${query}`)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'invalid_params' })
    })

    it('adds the named players, the duration and the top score of a finished game', async () => {
      seedRoom()
      seedGame({
        id: 1,
        state: GAME_STATE_FINISHED,
        started_at: '2026-11-03T10:00:00.000Z',
        finished_at: '2026-11-03T10:42:07.000Z',
      })
      dbState.game_participants.push(
        {
          id: 1,
          game_id: 1,
          podium: 1,
          display_name: 'Léa',
          second_display_name: 'Max',
          score: 12,
        },
        {
          id: 2,
          game_id: 1,
          podium: 2,
          display_name: 'Hugo',
          second_display_name: null,
          score: 30,
        },
        { id: 3, game_id: 2, podium: 1, display_name: 'Autre partie', score: 99 }
      )

      const [game] = parseJson<ListBody>(await list()).games

      expect(game).toMatchObject({ participantsCount: 3, durationSeconds: 2527, topScore: 30 })
    })

    it('has no duration nor top score for a game that is not finished', async () => {
      seedRoom()
      seedGame({ id: 1, state: GAME_STATE_ABORTED, started_at: MOCK_NOW, finished_at: MOCK_NOW })
      seedGame({ id: 2, state: GAME_STATE_PENDING })
      dbState.game_participants.push(
        { id: 1, game_id: 1, podium: 1, display_name: 'Léa', score: 0 },
        { id: 2, game_id: 2, podium: 1, display_name: 'Hugo', score: 0 }
      )

      const { games } = parseJson<ListBody>(await list())

      expect(games).toEqual([
        expect.objectContaining({
          id: 2,
          participantsCount: 1,
          durationSeconds: null,
          topScore: null,
        }),
        expect.objectContaining({
          id: 1,
          participantsCount: 1,
          durationSeconds: null,
          topScore: null,
        }),
      ])
    })

    it('has no top score for a finished game without participant', async () => {
      seedRoom()
      seedGame({ id: 1, state: GAME_STATE_FINISHED })

      const [game] = parseJson<ListBody>(await list()).games

      expect(game).toMatchObject({ participantsCount: 0, durationSeconds: null, topScore: null })
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

    describe('relay of the abort to the room', () => {
      const liveReport: RoomStatusReport = {
        screen: 'play',
        gameId: 1,
        phase: 'question',
        round: 1,
        questionIndex: 2,
        miniGame: MINI_GAME_QUICK_ANSWER,
        paused: false,
        scores: [],
        audioReady: true,
      }

      function openRoomStream(app: Awaited<ReturnType<typeof createRouteApp>>, companyId = 1) {
        const events: Array<{ event: string; data: unknown }> = []

        liveHubOf(app).openRoomStream(1, companyId, {
          send: (event, data) => events.push({ event, data }),
          close: () => undefined,
        })
        liveHubOf(app).report(1, companyId, liveReport)

        return events
      }

      function abort(app: Awaited<ReturnType<typeof createRouteApp>>, gameId = 1) {
        return app.inject({
          method: 'POST',
          url: `/companies/1/games/${gameId}/abort`,
          headers: authHeaders(companyAdminUser),
        })
      }

      it('tells the room to abort its game once the game is aborted, and returns the command', async () => {
        seedRoom()
        seedGame()
        const app = await createRouteApp(gamesRoutes)
        const events = openRoomStream(app)

        const response = await abort(app)

        expect(response.statusCode).toBe(200)
        expect(parseJson<GameBody>(response).game).toMatchObject({ state: GAME_STATE_ABORTED })
        expect(events).toEqual([
          {
            event: LIVE_EVENT.COMMAND,
            data: {
              commandId: expect.stringMatching(/^[0-9a-f-]{36}$/),
              command: 'abort',
              gameId: 1,
            },
          },
        ])
        expect(parseJson<{ relay: unknown }>(response).relay).toEqual({
          commandId: (events[0]?.data as { commandId: string }).commandId,
        })

        await app.close()
      })

      it('aborts as before when the room is not controllable, and sends nothing (relay null)', async () => {
        seedRoom()
        seedGame()
        const app = await createRouteApp(gamesRoutes)

        const response = await abort(app)

        expect(response.statusCode).toBe(200)
        expect(parseJson<GameBody>(response).game).toMatchObject({
          state: GAME_STATE_ABORTED,
          finishedAt: MOCK_NOW,
        })
        expect(parseJson<{ relay: unknown }>(response).relay).toBeNull()
        expect(liveHubOf(app).pendingCommandCount()).toBe(0)

        await app.close()
      })

      it.each([
        ['another game', 99],
        ['no game (demo mode or idle screen)', null],
      ])('does not relay when the room reports %s', async (_label, reportedGameId) => {
        seedRoom()
        seedGame()
        const app = await createRouteApp(gamesRoutes)
        const events = openRoomStream(app)

        liveHubOf(app).report(1, 1, { ...liveReport, gameId: reportedGameId })

        const response = await abort(app)

        expect(response.statusCode).toBe(200)
        expect(parseJson<GameBody>(response).game).toMatchObject({ state: GAME_STATE_ABORTED })
        expect(parseJson<{ relay: unknown }>(response).relay).toBeNull()
        expect(events).toEqual([])

        await app.close()
      })

      it('does not relay when the abort changed no row (game finished in the meantime)', async () => {
        seedRoom()
        seedGame()
        const app = await createRouteApp(gamesRoutes)
        const events = openRoomStream(app)
        const game = dbState.games[0]
        const participants = dbState.game_participants

        // La partie se termine entre la lecture de l'arrêt et son écriture.
        Object.defineProperty(dbState, 'game_participants', {
          configurable: true,
          get: () => {
            Object.defineProperty(dbState, 'game_participants', {
              configurable: true,
              writable: true,
              value: participants,
            })
            if (game) game.state = GAME_STATE_FINISHED

            return participants
          },
        })

        const response = await abort(app)

        expect(response.statusCode).toBe(200)
        expect(parseJson<GameBody>(response).game).toMatchObject({ state: GAME_STATE_FINISHED })
        expect(parseJson<{ relay: unknown }>(response).relay).toBeNull()
        expect(events).toEqual([])

        await app.close()
      })

      it('does not relay anything when the game was already over (409)', async () => {
        seedRoom()
        seedGame({ state: GAME_STATE_FINISHED })
        const app = await createRouteApp(gamesRoutes)
        const events = openRoomStream(app)

        const response = await abort(app)

        expect(response.statusCode).toBe(409)
        expect(events).toEqual([])

        await app.close()
      })

      it('does not relay anything for an unknown game (404)', async () => {
        seedRoom()
        const app = await createRouteApp(gamesRoutes)
        const events = openRoomStream(app)

        expect((await abort(app, 9)).statusCode).toBe(404)
        expect(events).toEqual([])

        await app.close()
      })

      it('does not relay to a room of another company', async () => {
        seedRoom()
        seedGame()
        const app = await createRouteApp(gamesRoutes)
        const events = openRoomStream(app, 2)

        const response = await abort(app)

        expect(response.statusCode).toBe(200)
        expect(events).toEqual([])

        await app.close()
      })
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
