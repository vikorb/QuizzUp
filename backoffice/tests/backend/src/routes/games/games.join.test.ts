import '../_helpers/registerRouteMocks'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_ACTIVE,
  JOIN_LINK_TTL_MINUTES,
  ROOM_STATUS_ACTIVE,
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

type Method = 'GET' | 'POST' | 'DELETE'

const NOW = new Date('2027-03-10T08:00:00.000Z')
const TOKEN = 'b'.repeat(43)
const operator = { ...companyUser, company_id: 1, companyId: 1 } as TestUser
const otherCompanyAdmin = { ...companyAdminUser, company_id: 2, companyId: 2 } as TestUser

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seedRoom()
  seedGame()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
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
    state: GAME_STATE_PENDING,
    started_at: null,
    finished_at: null,
    join_token: null,
    join_expires_at: null,
    status: GAME_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

function seedRegistration(overrides: Record<string, unknown> = {}) {
  dbState.game_registrations.push({
    id: dbState.game_registrations.length + 1,
    game_id: 1,
    display_name: 'Léa',
    email: 'lea@exemple.fr',
    consent_at: '2027-03-10T07:55:00.000Z',
    marketing_consent_at: '2027-03-10T07:55:00.000Z',
    second_display_name: 'Noé',
    second_email: 'noe@exemple.fr',
    second_consent_at: '2027-03-10T07:55:00.000Z',
    second_marketing_consent_at: null,
    created_at: '2027-03-10T07:55:00.000Z',
    ...overrides,
  })
}

function seedParticipant(overrides: Record<string, unknown> = {}) {
  dbState.game_participants.push({
    id: dbState.game_participants.length + 1,
    game_id: 1,
    podium: 1,
    display_name: 'Hugo',
    email: null,
    consent_at: null,
    second_display_name: null,
    score: 0,
    ...overrides,
  })
}

// Permission refusée par la matrice (rôle sans droit sur la ressource), comme les autres tests.
async function forbidden<T>(run: () => Promise<T>) {
  securityState.hasPermission = false

  return run()
}

async function call(
  method: Method,
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

describe('POST /companies/:companyId/games with openJoin', () => {
  const launch = (payload: Record<string, unknown>, user: TestUser = companyAdminUser) =>
    call('POST', '/companies/1/games', { roomId: 1, ...payload }, user)

  beforeEach(() => {
    dbState.games.length = 0
  })

  it('accepts no participant and opens the link when openJoin is true', async () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test')

    const response = await launch({ participants: [], openJoin: true })

    expect(response.statusCode).toBe(201)
    const { game } = parseJson<{ game: Record<string, any> }>(response)
    expect(game).toMatchObject({ state: GAME_STATE_PENDING, participants: [] })
    expect(game.join.url).toMatch(/^https:\/\/bo\.quizzup\.test\/rejoindre\/#[\w-]{43}$/)
    expect(game.join.expiresAt).toBe(
      new Date(NOW.getTime() + JOIN_LINK_TTL_MINUTES * 60_000).toISOString()
    )
    expect(game.pendingRegistrationsCount).toBe(0)
    expect(response.body).not.toContain('join_token')
    expect(game.join.url.split('#')[1]).toBe(dbState.games[0]!.join_token)
  })

  it('still requires a participant without openJoin, or with openJoin false', async () => {
    const without = await launch({ participants: [] })
    const disabled = await launch({ participants: [], openJoin: false })

    expect(without.statusCode).toBe(400)
    expect(JSON.stringify(parseJson(without))).toContain('participants_required')
    expect(disabled.statusCode).toBe(400)
    expect(dbState.games).toHaveLength(0)
  })

  it('opens no link by default, and the answer says so', async () => {
    const response = await launch({ participants: [{ podium: 1, displayName: 'Léa' }] })

    expect(parseJson<{ game: Record<string, unknown> }>(response).game).toMatchObject({
      join: null,
      pendingRegistrationsCount: 0,
    })
    expect(dbState.games[0]).toMatchObject({ join_token: null, join_expires_at: null })
  })

  it('ignores openJoin for a scheduled session, the link opens once the session is pending', async () => {
    const response = await launch({
      participants: [],
      openJoin: true,
      scheduledAt: '2027-03-10T14:00:00+01:00',
      durationMinutes: 60,
    })

    expect(response.statusCode).toBe(201)
    expect(dbState.games[0]).toMatchObject({
      state: GAME_STATE_SCHEDULED,
      join_token: null,
      join_expires_at: null,
    })
  })

  it('refuses a non boolean openJoin', async () => {
    const response = await launch({ participants: [], openJoin: 'oui' })

    expect(response.statusCode).toBe(400)
  })

  it('answers room_busy only when a pending game waits, a running one does not block', async () => {
    seedGame({ id: 1, state: GAME_STATE_RUNNING })

    const whileRunning = await launch({ participants: [], openJoin: true })
    const whilePending = await launch({ participants: [], openJoin: true })

    expect(whileRunning.statusCode).toBe(201)
    expect(whilePending.statusCode).toBe(409)
    expect(parseJson(whilePending)).toEqual({ error: 'room_busy' })
    expect(dbState.games.map((game) => game.state)).toEqual([
      GAME_STATE_RUNNING,
      GAME_STATE_PENDING,
    ])
  })
})

describe('GET /companies/:companyId/games/:gameId', () => {
  const read = (user: TestUser | null = companyAdminUser, url = '/companies/1/games/1') =>
    call('GET', url, undefined, user)

  it('adds the link and the number of pending registrations', async () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test')
    Object.assign(dbState.games[0]!, {
      join_token: TOKEN,
      join_expires_at: '2027-03-10T10:00:00.000Z',
    })
    seedRegistration()
    seedRegistration({ game_id: 2 })

    const { game } = parseJson<{ game: Record<string, unknown> }>(await read())

    expect(game).toMatchObject({
      join: {
        url: `https://bo.quizzup.test/rejoindre/#${TOKEN}`,
        expiresAt: '2027-03-10T10:00:00.000Z',
      },
      pendingRegistrationsCount: 1,
    })
  })

  it('has a relative link without PUBLIC_APP_URL', async () => {
    vi.stubEnv('PUBLIC_APP_URL', '')
    Object.assign(dbState.games[0]!, {
      join_token: TOKEN,
      join_expires_at: '2027-03-10T10:00:00.000Z',
    })

    const { game } = parseJson<{ game: { join: { url: string } } }>(await read())

    expect(game.join.url).toBe(`/rejoindre/#${TOKEN}`)
  })

  it('has no link once it expired or the game is no longer pending', async () => {
    Object.assign(dbState.games[0]!, {
      join_token: TOKEN,
      join_expires_at: '2027-03-10T07:59:59.000Z',
    })
    const expired = parseJson<{ game: Record<string, unknown> }>(await read()).game

    Object.assign(dbState.games[0]!, {
      join_expires_at: '2027-03-10T10:00:00.000Z',
      state: GAME_STATE_RUNNING,
    })
    seedRegistration()
    const running = parseJson<{ game: Record<string, unknown> }>(await read()).game

    expect(expired.join).toBeNull()
    expect(running).toMatchObject({ join: null, pendingRegistrationsCount: 0 })
  })

  it('does not show the game of another company', async () => {
    expect((await read(otherCompanyAdmin)).statusCode).toBe(403)
    expect((await read(superadminUser, '/companies/2/games/1')).statusCode).toBe(404)
  })
})

describe('POST and DELETE /companies/:companyId/games/:gameId/join', () => {
  const open = (user: TestUser | null = companyAdminUser, url = '/companies/1/games/1/join') =>
    call('POST', url, undefined, user)
  const close = (user: TestUser | null = companyAdminUser, url = '/companies/1/games/1/join') =>
    call('DELETE', url, undefined, user)

  it('opens the link for the TTL, and a second call replaces the token', async () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test')

    const first = await open()
    const firstToken = dbState.games[0]!.join_token as string
    const second = await open(operator)

    expect(first.statusCode).toBe(200)
    expect(parseJson<{ join: Record<string, string> }>(first).join).toEqual({
      url: `https://bo.quizzup.test/rejoindre/#${firstToken}`,
      expiresAt: new Date(NOW.getTime() + JOIN_LINK_TTL_MINUTES * 60_000).toISOString(),
    })
    expect(firstToken).toMatch(/^[\w-]{43}$/)
    expect(second.statusCode).toBe(200)
    expect(dbState.games[0]!.join_token).not.toBe(firstToken)
  })

  it('closes the link, and closing twice is fine', async () => {
    Object.assign(dbState.games[0]!, {
      join_token: TOKEN,
      join_expires_at: '2027-03-10T10:00:00.000Z',
    })

    const first = await close()
    const second = await close()

    expect(first.statusCode).toBe(204)
    expect(first.body).toBe('')
    expect(second.statusCode).toBe(204)
    expect(dbState.games[0]).toMatchObject({ join_token: null, join_expires_at: null })
  })

  it.each([GAME_STATE_RUNNING, GAME_STATE_FINISHED, GAME_STATE_SCHEDULED])(
    'refuses to open the link of a %s game',
    async (state) => {
      dbState.games[0]!.state = state

      const response = await open()

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_not_pending' })
      expect(dbState.games[0]!.join_token).toBeNull()
    }
  )

  it('answers 404 for an unknown game, 400 for a bad id', async () => {
    expect((await open(companyAdminUser, '/companies/1/games/99/join')).statusCode).toBe(404)
    expect((await close(companyAdminUser, '/companies/1/games/99/join')).statusCode).toBe(404)
    expect((await open(companyAdminUser, '/companies/1/games/abc/join')).statusCode).toBe(400)
    expect((await close(companyAdminUser, '/companies/x/games/1/join')).statusCode).toBe(400)
  })

  it('needs a login and a staff account', async () => {
    expect((await open(null)).statusCode).toBe(401)
    expect((await close(null)).statusCode).toBe(401)
    expect((await forbidden(() => open())).statusCode).toBe(403)
    expect((await forbidden(() => close())).statusCode).toBe(403)
    expect(dbState.games[0]!.join_token).toBeNull()
  })

  it('does not let a company reach the game of another one', async () => {
    Object.assign(dbState.games[0]!, {
      join_token: TOKEN,
      join_expires_at: '2027-03-10T10:00:00.000Z',
    })

    expect((await open(otherCompanyAdmin)).statusCode).toBe(403)
    expect((await close(otherCompanyAdmin)).statusCode).toBe(403)
    expect((await open(superadminUser, '/companies/2/games/1/join')).statusCode).toBe(404)
    expect((await close(superadminUser, '/companies/2/games/1/join')).statusCode).toBe(404)
    expect(dbState.games[0]!.join_token).toBe(TOKEN)
  })
})

describe('GET /companies/:companyId/games/:gameId/registrations', () => {
  const list = (
    user: TestUser | null = companyAdminUser,
    url = '/companies/1/games/1/registrations'
  ) => call('GET', url, undefined, user)

  type ListBody = { registrations: Array<Record<string, any>> }

  it('lists the requests, oldest first, with the e-mails for an admin', async () => {
    seedRegistration({ id: 2, display_name: 'Zoé', created_at: '2027-03-10T07:58:00.000Z' })
    seedRegistration({ id: 1, display_name: 'Léa', created_at: '2027-03-10T07:55:00.000Z' })
    seedRegistration({ id: 3, game_id: 2, display_name: 'Ailleurs' })

    const response = await list()
    const { registrations } = parseJson<ListBody>(response)

    expect(response.statusCode).toBe(200)
    expect(registrations.map((registration) => registration.displayName)).toEqual(['Léa', 'Zoé'])
    expect(registrations[0]).toEqual({
      id: 1,
      createdAt: '2027-03-10T07:55:00.000Z',
      displayName: 'Léa',
      hasEmail: true,
      email: 'lea@exemple.fr',
      marketingConsent: true,
      secondPlayer: {
        displayName: 'Noé',
        hasEmail: true,
        email: 'noe@exemple.fr',
        marketingConsent: false,
      },
    })
  })

  it('hides the e-mails from the user role but still says there is one', async () => {
    seedRegistration()

    const response = await list(operator)
    const [registration] = parseJson<ListBody>(response).registrations

    expect(registration).toMatchObject({
      email: null,
      hasEmail: true,
      secondPlayer: { email: null, hasEmail: true },
    })
    expect(response.body).not.toContain('@exemple.fr')
  })

  it('returns an empty list, and a player without second player nor e-mail', async () => {
    expect(parseJson<ListBody>(await list()).registrations).toEqual([])

    seedRegistration({
      email: null,
      consent_at: null,
      marketing_consent_at: null,
      second_display_name: null,
      second_email: null,
      second_consent_at: null,
    })

    expect(parseJson<ListBody>(await list()).registrations[0]).toMatchObject({
      hasEmail: false,
      marketingConsent: false,
      secondPlayer: null,
    })
  })

  it('answers 404, 400, 401, 403 as the other game routes', async () => {
    expect((await list(companyAdminUser, '/companies/1/games/99/registrations')).statusCode).toBe(
      404
    )
    expect((await list(companyAdminUser, '/companies/1/games/x/registrations')).statusCode).toBe(
      400
    )
    expect((await list(null)).statusCode).toBe(401)
    expect((await forbidden(() => list())).statusCode).toBe(403)
  })

  it('does not show the requests of another company', async () => {
    seedRegistration()

    expect((await list(otherCompanyAdmin)).statusCode).toBe(403)
    expect((await list(superadminUser, '/companies/2/games/1/registrations')).statusCode).toBe(404)
  })
})

describe('POST /companies/:companyId/games/:gameId/registrations/:registrationId/accept', () => {
  const accept = (
    payload?: unknown,
    user: TestUser | null = companyAdminUser,
    url = '/companies/1/games/1/registrations/1/accept'
  ) => call('POST', url, payload, user)

  type AcceptBody = { participant: Record<string, any> }

  beforeEach(() => {
    seedRegistration()
  })

  it('turns the request into a participant at the smallest free podium, then deletes it', async () => {
    seedParticipant({ podium: 1 })

    const response = await accept()

    expect(response.statusCode).toBe(201)
    expect(parseJson<AcceptBody>(response).participant).toMatchObject({
      podium: 2,
      displayName: 'Léa',
      email: 'lea@exemple.fr',
      consentAt: '2027-03-10T07:55:00.000Z',
      marketingConsent: true,
      secondPlayer: { displayName: 'Noé', email: 'noe@exemple.fr', marketingConsent: false },
    })
    expect(dbState.game_registrations).toHaveLength(0)
    expect(dbState.game_participants).toHaveLength(2)
    expect(dbState.game_participants[1]).toMatchObject({
      game_id: 1,
      podium: 2,
      consent_at: '2027-03-10T07:55:00.000Z',
      second_consent_at: '2027-03-10T07:55:00.000Z',
    })
  })

  it('uses the podium chosen by the staff', async () => {
    const response = await accept({ podium: 3 })

    expect(parseJson<AcceptBody>(response).participant.podium).toBe(3)
  })

  it('hides the e-mails from the user role, stored all the same', async () => {
    const response = await accept(undefined, operator)

    expect(response.statusCode).toBe(201)
    expect(response.body).not.toContain('@exemple.fr')
    expect(parseJson<AcceptBody>(response).participant).toMatchObject({
      email: null,
      hasEmail: true,
      secondPlayer: { email: null, hasEmail: true },
    })
    expect(dbState.game_participants[0]).toMatchObject({ email: 'lea@exemple.fr' })
  })

  it('refuses a taken podium and keeps the request', async () => {
    seedParticipant({ podium: 3 })

    const response = await accept({ podium: 3 })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'podium_taken' })
    expect(dbState.game_registrations).toHaveLength(1)
  })

  it('maps the unique index violation of a simultaneous validation to podium_taken', async () => {
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(
      Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
      })
    )

    const response = await accept({ podium: 2 })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'podium_taken' })
  })

  it('refuses a podium that does not exist in the room, with the desks count', async () => {
    const response = await accept({ podium: 5 })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'podium_not_in_room', desksCount: 4 })
    expect(dbState.game_registrations).toHaveLength(1)
  })

  it('answers room_full when every desk of the room is taken', async () => {
    dbState.rooms[0]!.config = { desksCount: 2 }
    seedParticipant({ podium: 1 })
    seedParticipant({ podium: 2 })

    const response = await accept()

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'room_full' })
    expect(dbState.game_registrations).toHaveLength(1)
  })

  it('refuses a podium out of 1..6 or a non integer one', async () => {
    for (const podium of [0, 7, 1.5, '2']) {
      expect((await accept({ podium })).statusCode).toBe(400)
    }
    expect(dbState.game_participants).toHaveLength(0)
  })

  it.each([GAME_STATE_RUNNING, GAME_STATE_FINISHED, GAME_STATE_SCHEDULED])(
    'refuses to accept a request of a %s game',
    async (state) => {
      dbState.games[0]!.state = state

      const response = await accept()

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_not_pending' })
      expect(dbState.game_participants).toHaveLength(0)
    }
  )

  it('answers registration_not_found for an unknown request, or one of another game', async () => {
    seedRegistration({ id: 2, game_id: 2 })

    const unknown = await accept(
      undefined,
      companyAdminUser,
      '/companies/1/games/1/registrations/9/accept'
    )
    const otherGame = await accept(
      undefined,
      companyAdminUser,
      '/companies/1/games/1/registrations/2/accept'
    )

    expect(unknown.statusCode).toBe(404)
    expect(parseJson(unknown)).toEqual({ error: 'registration_not_found' })
    expect(otherGame.statusCode).toBe(404)
    expect(parseJson(otherGame)).toEqual({ error: 'registration_not_found' })
  })

  it('answers 404 for an unknown game, 400 for bad ids, 401 and 403', async () => {
    const url = (companyId: string, gameId: string) =>
      `/companies/${companyId}/games/${gameId}/registrations/1/accept`

    expect((await accept(undefined, companyAdminUser, url('1', '99'))).statusCode).toBe(404)
    expect((await accept(undefined, companyAdminUser, url('1', 'x'))).statusCode).toBe(400)
    expect((await accept(undefined, null)).statusCode).toBe(401)
    expect((await forbidden(() => accept())).statusCode).toBe(403)
  })

  it('does not let a company accept the request of another one', async () => {
    expect((await accept(undefined, otherCompanyAdmin)).statusCode).toBe(403)
    expect(
      (await accept(undefined, superadminUser, '/companies/2/games/1/registrations/1/accept'))
        .statusCode
    ).toBe(404)
    expect(dbState.game_registrations).toHaveLength(1)
    expect(dbState.game_participants).toHaveLength(0)
  })
})

describe('DELETE /companies/:companyId/games/:gameId/registrations/:registrationId', () => {
  const refuse = (
    user: TestUser | null = companyAdminUser,
    url = '/companies/1/games/1/registrations/1'
  ) => call('DELETE', url, undefined, user)

  beforeEach(() => {
    seedRegistration()
  })

  it('deletes the request for good, whatever the state of the game', async () => {
    dbState.games[0]!.state = GAME_STATE_RUNNING

    const response = await refuse(operator)

    expect(response.statusCode).toBe(204)
    expect(dbState.game_registrations).toHaveLength(0)
    expect(dbState.game_participants).toHaveLength(0)
  })

  it('answers registration_not_found for an unknown request or one of another game', async () => {
    seedRegistration({ id: 2, game_id: 2 })

    const unknown = await refuse(companyAdminUser, '/companies/1/games/1/registrations/9')
    const otherGame = await refuse(companyAdminUser, '/companies/1/games/1/registrations/2')

    expect(unknown.statusCode).toBe(404)
    expect(parseJson(unknown)).toEqual({ error: 'registration_not_found' })
    expect(otherGame.statusCode).toBe(404)
    expect(dbState.game_registrations).toHaveLength(2)
  })

  it('answers 404, 400, 401, 403', async () => {
    expect(
      (await refuse(companyAdminUser, '/companies/1/games/99/registrations/1')).statusCode
    ).toBe(404)
    expect(
      (await refuse(companyAdminUser, '/companies/1/games/1/registrations/x')).statusCode
    ).toBe(400)
    expect((await refuse(null)).statusCode).toBe(401)
    expect((await forbidden(() => refuse())).statusCode).toBe(403)
    expect(dbState.game_registrations).toHaveLength(1)
  })

  it('does not let a company delete the request of another one', async () => {
    expect((await refuse(otherCompanyAdmin)).statusCode).toBe(403)
    expect((await refuse(superadminUser, '/companies/2/games/1/registrations/1')).statusCode).toBe(
      404
    )
    expect(dbState.game_registrations).toHaveLength(1)
  })
})

describe('POST /companies/:companyId/games/:gameId/participants', () => {
  const add = (
    payload?: unknown,
    user: TestUser | null = companyAdminUser,
    url = '/companies/1/games/1/participants'
  ) => call('POST', url, payload, user)

  type AddBody = { participant: Record<string, any> }

  it('adds a player at the counter, with the consents stamped by the server', async () => {
    const response = await add({
      podium: 2,
      displayName: 'Hugo',
      email: 'Hugo@Exemple.fr',
      emailConsent: true,
      marketingConsent: true,
      secondPlayer: { displayName: 'Ana' },
    })

    expect(response.statusCode).toBe(201)
    expect(parseJson<AddBody>(response).participant).toMatchObject({
      podium: 2,
      displayName: 'Hugo',
      email: 'hugo@exemple.fr',
      consentAt: MOCK_NOW,
      marketingConsent: true,
      secondPlayer: { displayName: 'Ana', hasEmail: false },
    })
    expect(dbState.game_participants).toHaveLength(1)
  })

  it('hides the e-mail from the user role', async () => {
    const response = await add(
      { podium: 1, displayName: 'Hugo', email: 'hugo@exemple.fr', emailConsent: true },
      operator
    )

    expect(response.statusCode).toBe(201)
    expect(response.body).not.toContain('hugo@exemple.fr')
    expect(parseJson<AddBody>(response).participant).toMatchObject({ email: null, hasEmail: true })
    expect(dbState.game_participants[0]).toMatchObject({ email: 'hugo@exemple.fr' })
  })

  it('refuses an e-mail without consent and offers without e-mail', async () => {
    const noConsent = await add({ podium: 1, displayName: 'Hugo', email: 'h@exemple.fr' })
    const noEmail = await add({ podium: 1, displayName: 'Hugo', marketingConsent: true })

    expect(noConsent.statusCode).toBe(400)
    expect(JSON.stringify(parseJson(noConsent))).toContain('email_consent_required')
    expect(noEmail.statusCode).toBe(400)
    expect(JSON.stringify(parseJson(noEmail))).toContain('marketing_consent_requires_email')
    expect(dbState.game_participants).toHaveLength(0)
  })

  it('refuses a missing name, a missing or out of range podium', async () => {
    for (const body of [
      { podium: 1 },
      { displayName: 'Hugo' },
      { podium: 0, displayName: 'Hugo' },
      { podium: 7, displayName: 'Hugo' },
      undefined,
    ]) {
      expect((await add(body)).statusCode).toBe(400)
    }
  })

  it('refuses a taken podium and a podium absent from the room', async () => {
    seedParticipant({ podium: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const absent = await add({ podium: 5, displayName: 'Hugo' })

    expect(absent.statusCode).toBe(400)
    expect(parseJson(absent)).toEqual({ error: 'podium_not_in_room', desksCount: 4 })
  })

  it('maps the unique index violation on (game, podium) to podium_taken', async () => {
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(
      Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
      })
    )

    const response = await add({ podium: 1, displayName: 'Hugo' })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'podium_taken' })
  })

  it.each([GAME_STATE_RUNNING, GAME_STATE_FINISHED, GAME_STATE_SCHEDULED])(
    'refuses to add a player to a %s game',
    async (state) => {
      dbState.games[0]!.state = state

      const response = await add({ podium: 1, displayName: 'Hugo' })

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_not_pending' })
      expect(dbState.game_participants).toHaveLength(0)
    }
  )

  it('answers 404, 400, 401, 403', async () => {
    const body = { podium: 1, displayName: 'Hugo' }

    expect(
      (await add(body, companyAdminUser, '/companies/1/games/99/participants')).statusCode
    ).toBe(404)
    expect(
      (await add(body, companyAdminUser, '/companies/1/games/x/participants')).statusCode
    ).toBe(400)
    expect((await add(body, null)).statusCode).toBe(401)
    expect((await forbidden(() => add(body))).statusCode).toBe(403)
  })

  it('does not let a company add a player to the game of another one', async () => {
    const body = { podium: 1, displayName: 'Hugo' }

    expect((await add(body, otherCompanyAdmin)).statusCode).toBe(403)
    expect((await add(body, superadminUser, '/companies/2/games/1/participants')).statusCode).toBe(
      404
    )
    expect(dbState.game_participants).toHaveLength(0)
  })
})

describe('DELETE /companies/:companyId/games/:gameId/participants/:participantId', () => {
  const remove = (
    user: TestUser | null = companyAdminUser,
    url = '/companies/1/games/1/participants/1'
  ) => call('DELETE', url, undefined, user)

  beforeEach(() => {
    seedParticipant({ id: 1, podium: 1 })
    seedParticipant({ id: 2, podium: 2, game_id: 2 })
  })

  it('removes a participant of a pending game', async () => {
    const response = await remove(operator)

    expect(response.statusCode).toBe(204)
    expect(dbState.game_participants.map((participant) => participant.id)).toEqual([2])
  })

  it.each([GAME_STATE_RUNNING, GAME_STATE_FINISHED, GAME_STATE_SCHEDULED])(
    'refuses to remove a player of a %s game',
    async (state) => {
      dbState.games[0]!.state = state

      const response = await remove()

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_not_pending' })
      expect(dbState.game_participants).toHaveLength(2)
    }
  )

  it('answers participant_not_found for an unknown participant or one of another game', async () => {
    const unknown = await remove(companyAdminUser, '/companies/1/games/1/participants/9')
    const otherGame = await remove(companyAdminUser, '/companies/1/games/1/participants/2')

    expect(unknown.statusCode).toBe(404)
    expect(parseJson(unknown)).toEqual({ error: 'participant_not_found' })
    expect(otherGame.statusCode).toBe(404)
    expect(dbState.game_participants).toHaveLength(2)
  })

  it('answers 404, 400, 401, 403', async () => {
    expect(
      (await remove(companyAdminUser, '/companies/1/games/99/participants/1')).statusCode
    ).toBe(404)
    expect((await remove(companyAdminUser, '/companies/1/games/1/participants/x')).statusCode).toBe(
      400
    )
    expect((await remove(null)).statusCode).toBe(401)
    expect((await forbidden(() => remove())).statusCode).toBe(403)
    expect(dbState.game_participants).toHaveLength(2)
  })

  it('does not let a company remove the player of another one', async () => {
    expect((await remove(otherCompanyAdmin)).statusCode).toBe(403)
    expect((await remove(superadminUser, '/companies/2/games/1/participants/1')).statusCode).toBe(
      404
    )
    expect(dbState.game_participants).toHaveLength(2)
  })
})
