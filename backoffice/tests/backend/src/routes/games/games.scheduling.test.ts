import '../_helpers/registerRouteMocks'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMPANY_STATUS_INACTIVE,
  GAME_MAX_PLAYERS,
  GAME_STATE_CANCELLED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_ACTIVE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAMES,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_INACTIVE,
  SESSION_DEFAULT_MINUTES,
  SESSION_HORIZON_DAYS,
  SESSION_OPEN_EARLY_MINUTES,
} from '@quizzup/shared'
import gamesRoutes from '@backend/routes/games'
import { db, dbState, MOCK_NOW } from '../_helpers/mockDb'
import { securityState } from '../_helpers/mockSecurity'
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

const NOW = new Date('2027-03-10T08:00:00.000Z')
const operator = { ...companyUser, company_id: 1, companyId: 1 } as TestUser
const otherCompanyAdmin = { ...companyAdminUser, company_id: 2, companyId: 2 } as TestUser

/** 14:00 à Paris, 13:00 UTC : une heure avant, l'ouverture est possible à partir de 12:00 UTC. */
const STARTS_AT = '2027-03-10T14:00:00+01:00'
const STARTS_AT_UTC = '2027-03-10T13:00:00.000Z'
const ENDS_AT_UTC = '2027-03-10T14:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

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
    mini_games: null,
    seed: 42,
    state: GAME_STATE_SCHEDULED,
    started_at: null,
    finished_at: null,
    scheduled_at: STARTS_AT_UTC,
    scheduled_end_at: ENDS_AT_UTC,
    cancelled_at: null,
    players_count: null,
    external_ref: null,
    locale: null,
    status: GAME_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

function seedParticipant(overrides: Record<string, unknown> = {}) {
  dbState.game_participants.push({
    id: dbState.game_participants.length + 1,
    game_id: 1,
    podium: 1,
    display_name: 'Léa',
    email: 'lea@exemple.fr',
    consent_at: MOCK_NOW,
    marketing_consent_at: MOCK_NOW,
    second_display_name: 'Noé',
    second_email: 'noe@exemple.fr',
    second_consent_at: MOCK_NOW,
    second_marketing_consent_at: MOCK_NOW,
    score: 0,
    ...overrides,
  })
}

async function call(
  method: 'POST' | 'PATCH',
  url: string,
  payload?: unknown,
  user: TestUser | null = companyAdminUser
) {
  const app = await createRouteApp(gamesRoutes)
  const response = await app.inject({
    method,
    url,
    ...(user ? { headers: authHeaders(user) } : {}),
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  })

  await app.close()

  return response
}

/** Simule une autre requête qui change l'état de la partie entre la lecture et l'écriture. */
function changeStateBeforeWrite(state: string) {
  vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback) => {
    dbState.games[0]!.state = state

    return callback(db)
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

describe('POST /companies/:companyId/games avec scheduledAt', () => {
  const create = (extra: Record<string, unknown> = {}, user: TestUser | null = companyAdminUser) =>
    call('POST', '/companies/1/games', { roomId: 1, scheduledAt: STARTS_AT, ...extra }, user)

  it('creates a scheduled session without players, one hour long by default', async () => {
    seedRoom()
    // Une partie en attente dans la salle ne bloque pas une session programmée.
    seedGame({ id: 9, state: GAME_STATE_PENDING, scheduled_at: null, scheduled_end_at: null })

    const response = await create()

    expect(response.statusCode).toBe(201)
    const { game } = parseJson<GameBody>(response)
    expect(game).toMatchObject({
      state: GAME_STATE_SCHEDULED,
      scheduledAt: STARTS_AT_UTC,
      scheduledEndAt: ENDS_AT_UTC,
      cancelledAt: null,
      playersCount: null,
      externalRef: null,
      locale: null,
      participants: [],
    })
    expect(SESSION_DEFAULT_MINUTES).toBe(60)
    expect(dbState.games[1]).toMatchObject({ state: GAME_STATE_SCHEDULED, status: 1 })
    expect(dbState.game_participants).toHaveLength(0)
  })

  it('stores the booking fields, a custom duration and the named players', async () => {
    seedRoom()

    const response = await create({
      durationMinutes: 90,
      playersCount: 5,
      externalRef: '  RES-42 ',
      locale: 'en',
      participants: [
        { podium: 1, displayName: 'Léa', email: 'LEA@exemple.fr', emailConsent: true },
        { podium: 2, displayName: 'Hugo' },
      ],
    })

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      scheduledAt: STARTS_AT_UTC,
      scheduledEndAt: '2027-03-10T14:30:00.000Z',
      playersCount: 5,
      externalRef: 'RES-42',
      locale: 'en',
    })
    expect(dbState.game_participants).toHaveLength(2)
    expect(dbState.game_participants[0]).toMatchObject({
      email: 'lea@exemple.fr',
      consent_at: MOCK_NOW,
    })
  })

  it('takes the slot length set on the room when no duration is sent', async () => {
    seedRoom({ schedule: { slotMinutes: 45 } })

    const response = await create()

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game.scheduledEndAt).toBe('2027-03-10T13:45:00.000Z')
  })

  it('keeps the immediate launch unchanged without scheduledAt', async () => {
    seedRoom()

    const response = await call('POST', '/companies/1/games', {
      roomId: 1,
      participants: [{ podium: 1, displayName: 'Léa' }],
    })

    expect(response.statusCode).toBe(201)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      state: GAME_STATE_PENDING,
      scheduledAt: null,
      scheduledEndAt: null,
    })
    expect(dbState.games[0]).toMatchObject({ scheduled_at: null, scheduled_end_at: null })
  })

  it.each<[string, Record<string, unknown>]>([
    ['seconds in scheduledAt', { scheduledAt: '2027-03-10T14:00:30+01:00' }],
    ['milliseconds in scheduledAt', { scheduledAt: '2027-03-10T14:00:00.500+01:00' }],
    ['scheduledAt without offset', { scheduledAt: '2027-03-10T14:00:00' }],
    ['scheduledAt that is not a date', { scheduledAt: 'demain' }],
    ['a duration below the minimum', { durationMinutes: 5 }],
    ['a duration above the maximum', { durationMinutes: 241 }],
    ['a fractional duration', { durationMinutes: 30.5 }],
    ['more players than desks allow', { playersCount: GAME_MAX_PLAYERS + 1 }],
    ['zero players', { playersCount: 0 }],
    ['an empty reference', { externalRef: '   ' }],
    ['a reference that is too long', { externalRef: 'x'.repeat(101) }],
    ['an unknown locale', { locale: 'de' }],
    [
      'a duplicated podium',
      {
        participants: [
          { podium: 1, displayName: 'A' },
          { podium: 1, displayName: 'B' },
        ],
      },
    ],
    [
      'seven participants',
      {
        participants: Array.from({ length: 7 }, (_item, index) => ({
          podium: index + 1,
          displayName: `J${index}`,
        })),
      },
    ],
  ])('rejects %s and creates nothing', async (_label, extra) => {
    seedRoom()

    const response = await create(extra)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    expect(dbState.games).toHaveLength(0)
  })

  it('refuses a duration without scheduledAt', async () => {
    seedRoom()

    const response = await call('POST', '/companies/1/games', {
      roomId: 1,
      durationMinutes: 60,
      participants: [{ podium: 1, displayName: 'Léa' }],
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.stringify(parseJson(response))).toContain('duration_requires_scheduled_at')
  })

  it('still needs a player for an immediate launch', async () => {
    seedRoom()

    const response = await call('POST', '/companies/1/games', { roomId: 1 })

    expect(response.statusCode).toBe(400)
    expect(JSON.stringify(parseJson(response))).toContain('participants_required')
  })

  it('refuses a session that is already over, accepts one in progress', async () => {
    seedRoom()

    const over = await create({ scheduledAt: '2027-03-10T07:30:00Z', durationMinutes: 30 })
    const inProgress = await create({ scheduledAt: '2027-03-10T07:30:00Z', durationMinutes: 60 })

    expect(over.statusCode).toBe(400)
    expect(parseJson(over)).toEqual({ error: 'session_in_past' })
    expect(inProgress.statusCode).toBe(201)
    expect(dbState.games).toHaveLength(1)
  })

  it('refuses a session that starts beyond the booking horizon', async () => {
    seedRoom()
    const atHorizon = new Date(NOW.getTime() + SESSION_HORIZON_DAYS * 86_400_000)
    const beyond = new Date(atHorizon.getTime() + 60_000)

    const accepted = await create({ scheduledAt: atHorizon.toISOString() })
    const refused = await create({ scheduledAt: beyond.toISOString() })

    expect(accepted.statusCode).toBe(201)
    expect(refused.statusCode).toBe(400)
    expect(parseJson(refused)).toEqual({ error: 'session_too_far' })
  })

  it('answers slot_taken when the database refuses an overlapping session (23P01)', async () => {
    seedRoom()
    failWithOverlap()

    const response = await create()

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'slot_taken' })
    expect(dbState.games).toHaveLength(0)
  })

  it('lets any other database error surface as a 500', async () => {
    seedRoom()
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('boom'))

    const response = await create()

    expect(response.statusCode).toBe(500)
  })

  it('needs an active room of the company', async () => {
    seedRoom({ id: 2, status: ROOM_STATUS_INACTIVE, name: 'Fermée' })
    seedRoom({ id: 3, company_id: 2, name: 'Ailleurs' })

    expect((await create({ roomId: 2 })).statusCode).toBe(409)
    expect((await create({ roomId: 3 })).statusCode).toBe(404)
    expect((await create({ roomId: 99 })).statusCode).toBe(404)
  })

  it('refuses a podium the room does not have', async () => {
    seedRoom()

    const response = await create({ participants: [{ podium: 5, displayName: 'Léa' }] })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'podium_not_in_room', desksCount: 4 })
  })

  it('lets staff of the company create, but not anybody else', async () => {
    seedRoom()

    const asStaff = await create({}, operator)
    const asSuperadmin = await create({ scheduledAt: '2027-03-10T16:00:00Z' }, superadminUser)
    const otherCompany = await create({}, otherCompanyAdmin)
    const anonymous = await create({}, null)
    securityState.hasPermission = false
    const forbidden = await create({ scheduledAt: '2027-03-10T18:00:00Z' })

    expect(asStaff.statusCode).toBe(201)
    expect(asSuperadmin.statusCode).toBe(201)
    expect(otherCompany.statusCode).toBe(403)
    expect(anonymous.statusCode).toBe(401)
    expect(forbidden.statusCode).toBe(403)
    expect(dbState.games).toHaveLength(2)
  })
})

describe('PATCH /companies/:companyId/games/:gameId', () => {
  const patch = (payload: unknown, user: TestUser | null = companyAdminUser, gameId = 1) =>
    call('PATCH', `/companies/1/games/${gameId}`, payload, user)

  beforeEach(() => {
    seedRoom()
    seedGame({ players_count: 4, external_ref: 'OLD', locale: 'fr' })
    seedParticipant()
  })

  it('changes only the fields sent and keeps the rest', async () => {
    const response = await patch({ externalRef: 'NEW' })

    expect(response.statusCode).toBe(200)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      externalRef: 'NEW',
      playersCount: 4,
      locale: 'fr',
      scheduledAt: STARTS_AT_UTC,
      scheduledEndAt: ENDS_AT_UTC,
      roundsCount: 10,
    })
    expect(dbState.game_participants).toHaveLength(1)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)
  })

  it('moves the session and keeps its duration, or changes the duration alone', async () => {
    const moved = await patch({ scheduledAt: '2027-03-10T17:00:00+01:00' })
    const longer = await patch({ durationMinutes: 120 })

    expect(parseJson<GameBody>(moved).game).toMatchObject({
      scheduledAt: '2027-03-10T16:00:00.000Z',
      scheduledEndAt: '2027-03-10T17:00:00.000Z',
    })
    expect(parseJson<GameBody>(longer).game).toMatchObject({
      scheduledAt: '2027-03-10T16:00:00.000Z',
      scheduledEndAt: '2027-03-10T18:00:00.000Z',
    })
  })

  it('changes the format, the mini-games and the booking fields', async () => {
    const response = await patch({
      roundsCount: 5,
      questionsPerRound: 8,
      miniGames: [MINI_GAME_FIRST_BUZZ, MINI_GAME_QUICK_ANSWER],
      playersCount: 6,
      locale: 'en',
    })

    expect(response.statusCode).toBe(200)
    expect(dbState.games[0]).toMatchObject({
      rounds_count: 5,
      questions_per_round: 8,
      mini_games: JSON.stringify([MINI_GAME_FIRST_BUZZ, MINI_GAME_QUICK_ANSWER]),
      players_count: 6,
      locale: 'en',
    })
  })

  it('clears the optional fields with null, and the full mini-games list with it', async () => {
    dbState.games[0]!.mini_games = JSON.stringify([MINI_GAME_FIRST_BUZZ])

    const response = await patch({
      playersCount: null,
      externalRef: null,
      locale: null,
      miniGames: [...MINI_GAMES].reverse(),
    })

    expect(response.statusCode).toBe(200)
    expect(dbState.games[0]).toMatchObject({
      players_count: null,
      external_ref: null,
      locale: null,
      mini_games: null,
    })
  })

  it('replaces the whole list of players, including with an empty list', async () => {
    const replaced = await patch({
      participants: [
        { podium: 2, displayName: 'Hugo', email: 'HUGO@exemple.fr', emailConsent: true },
      ],
    })

    expect(replaced.statusCode).toBe(200)
    expect(dbState.game_participants).toHaveLength(1)
    expect(dbState.game_participants[0]).toMatchObject({
      game_id: 1,
      podium: 2,
      display_name: 'Hugo',
      email: 'hugo@exemple.fr',
      consent_at: MOCK_NOW,
    })

    const emptied = await patch({ participants: [] })

    expect(emptied.statusCode).toBe(200)
    expect(dbState.game_participants).toHaveLength(0)
  })

  it('moves the session to another active room of the company', async () => {
    seedRoom({ id: 2, name: 'Salle Vert' })

    const response = await patch({ roomId: 2 })

    expect(response.statusCode).toBe(200)
    expect(dbState.games[0]!.room_id).toBe(2)
  })

  it('refuses a room that is inactive, unknown or from another company', async () => {
    seedRoom({ id: 2, status: ROOM_STATUS_INACTIVE, name: 'Fermée' })
    seedRoom({ id: 3, company_id: 2, name: 'Ailleurs' })

    const inactive = await patch({ roomId: 2 })
    const foreign = await patch({ roomId: 3 })
    const unknown = await patch({ roomId: 99 })

    expect(inactive.statusCode).toBe(409)
    expect(parseJson(inactive)).toEqual({ error: 'room_inactive' })
    expect(foreign.statusCode).toBe(404)
    expect(parseJson(foreign)).toEqual({ error: 'room_not_found' })
    expect(unknown.statusCode).toBe(404)
    expect(dbState.games[0]!.room_id).toBe(1)
  })

  it('refuses a podium the target room does not have', async () => {
    seedRoom({ id: 2, name: 'Petite', config: { desksCount: 2 } })
    dbState.game_participants[0]!.podium = 3

    const moved = await patch({ roomId: 2 })
    const replaced = await patch({ participants: [{ podium: 5, displayName: 'Hugo' }] })

    expect(moved.statusCode).toBe(400)
    expect(parseJson(moved)).toEqual({ error: 'podium_not_in_room', desksCount: 2 })
    expect(replaced.statusCode).toBe(400)
    expect(parseJson(replaced)).toEqual({ error: 'podium_not_in_room', desksCount: 4 })
    expect(dbState.games[0]!.room_id).toBe(1)
    expect(dbState.game_participants[0]!.display_name).toBe('Léa')
  })

  it('refuses a new time that is over or too far, but not an unrelated edit of a past session', async () => {
    const past = await patch({ scheduledAt: '2027-03-10T06:00:00Z' })
    dbState.games[0]!.scheduled_at = '2027-03-09T13:00:00.000Z'
    dbState.games[0]!.scheduled_end_at = '2027-03-09T14:00:00.000Z'
    const farAway = await patch({ scheduledAt: '2029-03-10T13:00:00Z' })
    const unrelated = await patch({ externalRef: 'late' })

    expect(parseJson(past)).toEqual({ error: 'session_in_past' })
    expect(parseJson(farAway)).toEqual({ error: 'session_too_far' })
    expect(unrelated.statusCode).toBe(200)
  })

  it('answers slot_taken when the database refuses the new slot (23P01)', async () => {
    failWithOverlap()

    const response = await patch({ scheduledAt: '2027-03-10T17:00:00Z' })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'slot_taken' })
  })

  it.each([GAME_STATE_PENDING, GAME_STATE_RUNNING, GAME_STATE_FINISHED, GAME_STATE_CANCELLED])(
    'refuses to edit a %s game',
    async (state) => {
      dbState.games[0]!.state = state

      const response = await patch({ externalRef: 'NEW' })

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_not_scheduled' })
      expect(dbState.games[0]!.external_ref).toBe('OLD')
    }
  )

  it('writes nothing when the session is opened by someone else meanwhile', async () => {
    changeStateBeforeWrite(GAME_STATE_PENDING)

    const response = await patch({
      externalRef: 'NEW',
      participants: [{ podium: 2, displayName: 'Hugo' }],
    })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'game_not_scheduled' })
    expect(dbState.games[0]!.external_ref).toBe('OLD')
    expect(dbState.game_participants[0]!.display_name).toBe('Léa')
  })

  it.each<[string, unknown]>([
    ['an empty body', {}],
    ['only unknown fields', { state: GAME_STATE_PENDING }],
    ['a duration out of range', { durationMinutes: 5 }],
    ['seconds in scheduledAt', { scheduledAt: '2027-03-10T14:00:30Z' }],
    ['a locale out of range', { locale: 'de' }],
    ['too many rounds', { roundsCount: 99 }],
    ['an unknown mini-game', { miniGames: ['nope'] }],
    [
      'a duplicated podium',
      {
        participants: [
          { podium: 1, displayName: 'A' },
          { podium: 1, displayName: 'B' },
        ],
      },
    ],
  ])('rejects %s', async (_label, payload) => {
    const response = await patch(payload)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    expect(dbState.games[0]).toMatchObject({ external_ref: 'OLD', state: GAME_STATE_SCHEDULED })
  })

  it('answers 404 for an unknown game and 400 for a bad id', async () => {
    expect((await patch({ locale: 'en' }, companyAdminUser, 99)).statusCode).toBe(404)
    expect((await call('PATCH', '/companies/1/games/abc', { locale: 'en' })).statusCode).toBe(400)
  })

  it('hides the emails from the staff in the answer', async () => {
    const response = await patch({ externalRef: 'NEW' }, operator)

    expect(response.statusCode).toBe(200)
    expect(parseJson<GameBody>(response).game.participants[0]).toMatchObject({
      email: null,
      hasEmail: true,
    })
    expect(response.body).not.toContain('@exemple.fr')
  })

  it('refuses another company, anonymous calls and forbidden roles', async () => {
    const otherCompany = await patch({ externalRef: 'HACK' }, otherCompanyAdmin)
    const anonymous = await patch({ externalRef: 'HACK' }, null)
    securityState.hasPermission = false
    const forbidden = await patch({ externalRef: 'HACK' })

    expect(otherCompany.statusCode).toBe(403)
    expect(anonymous.statusCode).toBe(401)
    expect(forbidden.statusCode).toBe(403)
    expect(dbState.games[0]!.external_ref).toBe('OLD')
  })

  it('does not reach a game of another company through the id of the first one', async () => {
    seedGame({ id: 2, company_id: 2, room_id: 3, external_ref: 'OTHER' })

    const response = await patch({ externalRef: 'HACK' }, companyAdminUser, 2)

    expect(response.statusCode).toBe(404)
    expect(dbState.games[1]!.external_ref).toBe('OTHER')
  })
})

describe('POST /companies/:companyId/games/:gameId/open', () => {
  const open = (user: TestUser | null = companyAdminUser, gameId = 1) =>
    call('POST', `/companies/1/games/${gameId}/open`, undefined, user)

  beforeEach(() => {
    seedRoom()
    seedGame()
    seedParticipant()
  })

  it('opens the session an hour before it starts, hiding emails from the staff', async () => {
    vi.setSystemTime(new Date('2027-03-10T12:00:00.000Z'))

    const response = await open(operator)

    expect(response.statusCode).toBe(200)
    expect(SESSION_OPEN_EARLY_MINUTES).toBe(60)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      state: GAME_STATE_PENDING,
      scheduledAt: STARTS_AT_UTC,
    })
    expect(response.body).not.toContain('@exemple.fr')
    expect(dbState.games[0]).toMatchObject({ state: GAME_STATE_PENDING, updated_at: MOCK_NOW })
    expect(dbState.game_participants).toHaveLength(1)
  })

  it('refuses to open more than an hour before the start', async () => {
    vi.setSystemTime(new Date('2027-03-10T11:59:00.000Z'))

    const response = await open()

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'session_not_open_yet' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)
  })

  it('still opens a session long after its slot, nothing expires', async () => {
    vi.setSystemTime(new Date('2027-03-10T20:00:00.000Z'))

    const response = await open()

    expect(response.statusCode).toBe(200)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_PENDING)
  })

  it.each([GAME_STATE_PENDING, GAME_STATE_RUNNING, GAME_STATE_FINISHED, GAME_STATE_CANCELLED])(
    'refuses to open a %s game',
    async (state) => {
      dbState.games[0]!.state = state
      vi.setSystemTime(new Date('2027-03-10T13:00:00.000Z'))

      const response = await open()

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_not_scheduled' })
      expect(dbState.games[0]!.state).toBe(state)
    }
  )

  it('answers room_busy while another game waits in the room, not while one is running', async () => {
    vi.setSystemTime(new Date('2027-03-10T13:00:00.000Z'))
    seedGame({ id: 2, state: GAME_STATE_RUNNING, scheduled_at: null, scheduled_end_at: null })

    const whileRunning = await open()
    dbState.games[0]!.state = GAME_STATE_SCHEDULED
    dbState.games[1]!.state = GAME_STATE_PENDING
    const whilePending = await open()

    expect(whileRunning.statusCode).toBe(200)
    expect(whilePending.statusCode).toBe(409)
    expect(parseJson(whilePending)).toEqual({ error: 'room_busy' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)
  })

  it('ignores a pending game of another room and a deleted one', async () => {
    vi.setSystemTime(new Date('2027-03-10T13:00:00.000Z'))
    seedRoom({ id: 2, name: 'Autre' })
    seedGame({
      id: 2,
      room_id: 2,
      state: GAME_STATE_PENDING,
      scheduled_at: null,
      scheduled_end_at: null,
    })
    seedGame({
      id: 3,
      state: GAME_STATE_PENDING,
      status: 2,
      scheduled_at: null,
      scheduled_end_at: null,
    })

    const response = await open()

    expect(response.statusCode).toBe(200)
  })

  it('refuses an inactive room or an inactive company', async () => {
    vi.setSystemTime(new Date('2027-03-10T13:00:00.000Z'))
    dbState.rooms[0]!.status = ROOM_STATUS_INACTIVE

    const inactiveRoom = await open()
    dbState.rooms[0]!.status = ROOM_STATUS_ACTIVE
    dbState.companies[0]!.status = COMPANY_STATUS_INACTIVE
    const inactiveCompany = await open()

    expect(parseJson(inactiveRoom)).toEqual({ error: 'room_inactive' })
    expect(parseJson(inactiveCompany)).toEqual({ error: 'company_inactive' })
    expect(inactiveRoom.statusCode).toBe(409)
    expect(inactiveCompany.statusCode).toBe(409)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)
  })

  it('answers 404 for an unknown or deleted game and 400 for a bad id', async () => {
    dbState.games[0]!.status = 2

    expect((await open()).statusCode).toBe(404)
    expect((await open(companyAdminUser, 99)).statusCode).toBe(404)
    expect((await call('POST', '/companies/1/games/abc/open')).statusCode).toBe(400)
  })

  it('refuses another company, anonymous calls and forbidden roles', async () => {
    vi.setSystemTime(new Date('2027-03-10T13:00:00.000Z'))

    const otherCompany = await open(otherCompanyAdmin)
    const anonymous = await open(null)
    securityState.hasPermission = false
    const forbidden = await open()

    expect(otherCompany.statusCode).toBe(403)
    expect(anonymous.statusCode).toBe(401)
    expect(forbidden.statusCode).toBe(403)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_SCHEDULED)
  })

  it('does not open the game of another company through its id', async () => {
    vi.setSystemTime(new Date('2027-03-10T13:00:00.000Z'))
    seedGame({ id: 2, company_id: 2, room_id: 3 })

    const response = await open(companyAdminUser, 2)

    expect(response.statusCode).toBe(404)
    expect(dbState.games[1]!.state).toBe(GAME_STATE_SCHEDULED)
  })
})

describe('POST /companies/:companyId/games/:gameId/cancel', () => {
  const cancel = (user: TestUser | null = companyAdminUser, gameId = 1) =>
    call('POST', `/companies/1/games/${gameId}/cancel`, undefined, user)

  beforeEach(() => {
    seedRoom()
    seedGame()
    seedParticipant()
  })

  it('cancels the session and erases the emails and consents of its players at once', async () => {
    seedGame({ id: 2, room_id: 1 })
    seedParticipant({ game_id: 2, display_name: 'Autre', email: 'autre@exemple.fr' })

    const response = await cancel()

    expect(response.statusCode).toBe(200)
    expect(parseJson<GameBody>(response).game).toMatchObject({
      state: GAME_STATE_CANCELLED,
      cancelledAt: MOCK_NOW,
      status: GAME_STATUS_ACTIVE,
    })
    expect(dbState.games[0]).toMatchObject({
      state: GAME_STATE_CANCELLED,
      cancelled_at: MOCK_NOW,
      status: GAME_STATUS_ACTIVE,
      deleted_at: null,
    })
    expect(dbState.game_participants[0]).toMatchObject({
      display_name: 'Léa',
      second_display_name: 'Noé',
      email: null,
      consent_at: null,
      marketing_consent_at: null,
      second_email: null,
      second_consent_at: null,
      second_marketing_consent_at: null,
    })
    // Une autre session n'est pas touchée.
    expect(dbState.games[1]!.state).toBe(GAME_STATE_SCHEDULED)
    expect(dbState.game_participants[1]).toMatchObject({ email: 'autre@exemple.fr' })
  })

  it('answers 200 again when the session is already cancelled', async () => {
    await cancel()
    const again = await cancel(operator)

    expect(again.statusCode).toBe(200)
    expect(parseJson<GameBody>(again).game.state).toBe(GAME_STATE_CANCELLED)
    expect(dbState.games[0]!.cancelled_at).toBe(MOCK_NOW)
  })

  it.each([GAME_STATE_PENDING, GAME_STATE_RUNNING, GAME_STATE_FINISHED])(
    'refuses to cancel a %s game and keeps its data',
    async (state) => {
      dbState.games[0]!.state = state

      const response = await cancel()

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_not_scheduled' })
      expect(dbState.games[0]!.state).toBe(state)
      expect(dbState.game_participants[0]!.email).toBe('lea@exemple.fr')
    }
  )

  it('changes nothing when the session is opened by someone else meanwhile', async () => {
    changeStateBeforeWrite(GAME_STATE_PENDING)

    const response = await cancel()

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'game_not_scheduled' })
    expect(dbState.game_participants[0]!.email).toBe('lea@exemple.fr')
  })

  it('answers 404 for an unknown or deleted game and 400 for a bad id', async () => {
    expect((await cancel(companyAdminUser, 99)).statusCode).toBe(404)
    expect((await call('POST', '/companies/1/games/abc/cancel')).statusCode).toBe(400)
    dbState.games[0]!.status = 2
    expect((await cancel()).statusCode).toBe(404)
  })

  it('refuses another company, anonymous calls and forbidden roles', async () => {
    seedGame({ id: 2, company_id: 2, room_id: 3 })

    const otherCompany = await cancel(otherCompanyAdmin)
    const crossCompany = await cancel(companyAdminUser, 2)
    const anonymous = await cancel(null)
    securityState.hasPermission = false
    const forbidden = await cancel()

    expect(otherCompany.statusCode).toBe(403)
    expect(crossCompany.statusCode).toBe(404)
    expect(anonymous.statusCode).toBe(401)
    expect(forbidden.statusCode).toBe(403)
    expect(dbState.games.map((game) => game.state)).toEqual([
      GAME_STATE_SCHEDULED,
      GAME_STATE_SCHEDULED,
    ])
    expect(dbState.game_participants[0]!.email).toBe('lea@exemple.fr')
  })
})

describe('GET /companies/:companyId/games avec des sessions programmées', () => {
  type ListBody = { games: Array<Record<string, unknown>>; total: number }

  async function list(query: string) {
    const app = await createRouteApp(gamesRoutes)
    const response = await app.inject({
      method: 'GET',
      url: `/companies/1/games${query}`,
      headers: authHeaders(operator),
    })

    await app.close()

    return parseJson<ListBody>(response)
  }

  beforeEach(() => {
    seedRoom()
    // Créée en mai, mais prévue le 10 mars : c'est la date prévue qui compte pour les filtres.
    seedGame({ id: 1, players_count: 4, external_ref: 'RES-1', locale: 'fr' })
    seedGame({
      id: 2,
      state: GAME_STATE_CANCELLED,
      cancelled_at: MOCK_NOW,
      scheduled_at: '2027-03-11T13:00:00.000Z',
      scheduled_end_at: '2027-03-11T14:00:00.000Z',
    })
    seedGame({ id: 3, state: GAME_STATE_FINISHED, scheduled_at: null, scheduled_end_at: null })
  })

  it('returns the scheduling fields of every row', async () => {
    const { games } = await list('?state=scheduled')

    expect(games).toEqual([
      expect.objectContaining({
        id: 1,
        scheduledAt: STARTS_AT_UTC,
        scheduledEndAt: ENDS_AT_UTC,
        cancelledAt: null,
        playersCount: 4,
        externalRef: 'RES-1',
        locale: 'fr',
      }),
    ])
  })

  it('filters on the planned date first, then the start, then the creation', async () => {
    const onTheTenth = await list('?from=2027-03-10T00:00:00Z&to=2027-03-11T00:00:00Z')
    const createdInMay = await list('?from=2026-05-20T00:00:00Z&to=2026-05-21T00:00:00Z')

    expect(onTheTenth.games.map((game) => game.id)).toEqual([1])
    expect(createdInMay.games.map((game) => game.id)).toEqual([3])
  })

  it('filters on the new states', async () => {
    expect((await list('?state=cancelled')).games.map((game) => game.id)).toEqual([2])
  })
})
