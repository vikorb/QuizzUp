import '../_helpers/registerDbMock'

import { Writable } from 'node:stream'

import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATUS_ACTIVE,
  GAME_STATUS_DELETED,
  JOIN_DISPLAY_NAME_MAX_LENGTH,
  JOIN_MAX_PENDING_REGISTRATIONS,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'
import publicRoutes from '@backend/routes/public'
import { PUBLIC_API_PREFIX } from '@backend/routes/public/_shared'
import { JOIN_BODY_LIMIT, JOIN_REGISTRATION_RATE_LIMIT_MAX } from '@backend/routes/public/join'
import { db, dbState, resetDb } from '../_helpers/mockDb'

const LOOKUP = `${PUBLIC_API_PREFIX}/join/lookup`
const REGISTRATIONS = `${PUBLIC_API_PREFIX}/join/registrations`

const NOW = new Date('2027-03-10T08:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
// 43 caractères base64url : la forme d'un vrai jeton (32 octets).
const TOKEN = 'a'.repeat(43)
const OTHER_TOKEN = 'b'.repeat(43)
const UNKNOWN_TOKEN = 'c'.repeat(43)
const PAST = new Date(NOW.getTime() - 1000).toISOString()

async function createApp(logStream?: Writable) {
  const app = fastify({ logger: logStream ? { level: 'info', stream: logStream } : false })

  // Le projet de tests ne charge pas les augmentations de types (jwt, authenticate) du backend.
  await app.register(publicRoutes as never, { prefix: PUBLIC_API_PREFIX })
  await app.ready()

  return app
}

type App = Awaited<ReturnType<typeof createApp>>

let app: App

const post = (url: string, body: unknown, remoteAddress = '203.0.113.10') =>
  app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
    remoteAddress,
  })

const lookup = (token: string, remoteAddress?: string) => post(LOOKUP, { token }, remoteAddress)

const register = (body: Record<string, unknown>, remoteAddress?: string) =>
  post(REGISTRATIONS, { token: TOKEN, displayName: 'Camille', ...body }, remoteAddress)

function seedGame(overrides: Record<string, unknown> = {}) {
  dbState.games.push({
    id: 1,
    company_id: 1,
    room_id: 1,
    state: GAME_STATE_PENDING,
    status: GAME_STATUS_ACTIVE,
    join_token: TOKEN,
    join_expires_at: new Date(NOW.getTime() + HOUR_MS).toISOString(),
    ...overrides,
  })
}

function seedRoom(overrides: Record<string, unknown> = {}) {
  dbState.rooms.push({
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    status: ROOM_STATUS_ACTIVE,
    ...overrides,
  })
}

function seedRegistrations(count: number, gameId = 1) {
  for (let index = 0; index < count; index += 1) {
    dbState.game_registrations.push({ game_id: gameId, display_name: `Joueur ${index}` })
  }
}

const registrationsOf = (gameId: number) =>
  dbState.game_registrations.filter((row) => row.game_id === gameId)

beforeEach(async () => {
  resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seedRoom()
  seedGame()
  app = await createApp()
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

describe('routes/public/join — POST /public/v1/join/lookup', () => {
  it('tells a phone which centre and room the link opens, without authentication', async () => {
    const response = await lookup(TOKEN)

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.json()).toEqual({
      companyName: dbState.companies[0]!.name,
      roomName: 'Salle Néon',
      logoUrl: null,
      expiresAt: new Date(NOW.getTime() + HOUR_MS).toISOString(),
    })
  })

  it('gives the logo url of a company that has one', async () => {
    dbState.companies[0]!.logo_key = 'logos/11111111-1111-4111-8111-111111111111.png'

    const { logoUrl } = (await lookup(TOKEN)).json()

    expect(logoUrl).toBe(`${PUBLIC_API_PREFIX}/logos/11111111-1111-4111-8111-111111111111.png`)
  })

  it('leaks no name, e-mail, token or id, even when requests are waiting', async () => {
    dbState.game_registrations.push({
      game_id: 1,
      display_name: 'Prénom injurieux',
      email: 'joueur@example.test',
      second_display_name: 'Autre prénom',
    })

    const response = await lookup(TOKEN)

    for (const secret of [
      'Prénom injurieux',
      'Autre prénom',
      'joueur@example.test',
      TOKEN,
      'company_id',
      'game_id',
      'room_id',
    ]) {
      expect(response.body).not.toContain(secret)
    }
    expect(Object.keys(response.json()).sort()).toEqual([
      'companyName',
      'expiresAt',
      'logoUrl',
      'roomName',
    ])
  })

  it('answers the same 404 for a malformed token, an unknown token and a token never issued', async () => {
    seedGame({ id: 2, join_token: OTHER_TOKEN })

    const responses = await Promise.all(
      ['', 'trop-court', 'a'.repeat(44), `${'a'.repeat(42)}=`, UNKNOWN_TOKEN].map((token) =>
        lookup(token)
      )
    )

    expect(responses.map((response) => response.statusCode)).toEqual([404, 404, 404, 404, 404])
    expect(new Set(responses.map((response) => response.body))).toEqual(
      new Set([JSON.stringify({ error: 'join_link_invalid' })])
    )
  })

  it('keeps two open games apart: each token shows its own centre and room, and only its own requests count', async () => {
    // Une seconde partie ouverte, dans une autre compagnie et une autre salle, avec ses demandes.
    Object.assign(dbState.companies[1]!, { status: COMPANY_STATUS_ACTIVE })
    seedRoom({ id: 2, company_id: 2, name: 'Salle Rivale' })
    seedGame({ id: 2, company_id: 2, room_id: 2, join_token: OTHER_TOKEN })
    seedRegistrations(JOIN_MAX_PENDING_REGISTRATIONS, 2)

    const first = await lookup(TOKEN)

    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ companyName: 'QuizzUp', roomName: 'Salle Néon' })
    for (const foreign of ['Client Deux', 'Salle Rivale', 'Joueur 0']) {
      expect(first.body).not.toContain(foreign)
    }

    // Contrôle : l'autre jeton, lui, montre bien l'autre partie.
    expect((await lookup(OTHER_TOKEN)).json()).toMatchObject({
      companyName: 'Client Deux',
      roomName: 'Salle Rivale',
    })

    // La partie 2 est pleine, pas la partie 1 : l'inscription par le premier jeton va dans la 1.
    expect((await register({})).statusCode).toBe(201)
    expect(registrationsOf(1)).toHaveLength(1)
    expect(registrationsOf(2)).toHaveLength(JOIN_MAX_PENDING_REGISTRATIONS)
  })

  it.each([
    ['expired', () => Object.assign(dbState.games[0]!, { join_expires_at: PAST })],
    ['running', () => Object.assign(dbState.games[0]!, { state: GAME_STATE_RUNNING })],
    ['finished', () => Object.assign(dbState.games[0]!, { state: GAME_STATE_FINISHED })],
    ['deleted', () => Object.assign(dbState.games[0]!, { status: GAME_STATUS_DELETED })],
    [
      'in a room that is inactive',
      () => Object.assign(dbState.rooms[0]!, { status: ROOM_STATUS_INACTIVE }),
    ],
    [
      'of a company that is inactive',
      () => Object.assign(dbState.companies[0]!, { status: COMPANY_STATUS_INACTIVE }),
    ],
    [
      'of a company that is deleted',
      () => Object.assign(dbState.companies[0]!, { status: COMPANY_STATUS_DELETED }),
    ],
  ])('answers 410 join_link_closed for a known token whose game is %s', async (_label, change) => {
    change()

    const response = await lookup(TOKEN)

    expect(response.statusCode).toBe(410)
    expect(response.json()).toEqual({ error: 'join_link_closed' })
  })

  it('refuses a body without token or with an unknown field', async () => {
    expect((await post(LOOKUP, {})).statusCode).toBe(400)
    expect((await post(LOOKUP, { token: 42 })).statusCode).toBe(400)
    expect((await post(LOOKUP, { token: TOKEN, gameId: 1 })).statusCode).toBe(400)
  })

  it('does not read the token from the address: GET with a query is not a route', async () => {
    const response = await app.inject({ method: 'GET', url: `${LOOKUP}?token=${TOKEN}` })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
  })
})

describe('routes/public/join — POST /public/v1/join/registrations', () => {
  it('stores a request for the game of the token and answers nothing else than ok', async () => {
    const response = await register({})

    expect(response.statusCode).toBe(201)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.json()).toEqual({ ok: true })
    expect(registrationsOf(1)).toHaveLength(1)
    expect(registrationsOf(1)[0]).toMatchObject({
      game_id: 1,
      display_name: 'Camille',
      email: null,
      consent_at: null,
      marketing_consent_at: null,
      second_display_name: null,
    })
    expect(dbState.game_participants).toHaveLength(0)
  })

  it('keeps the e-mail, its consents (stamped by the server) and the second player', async () => {
    const response = await register({
      displayName: '  Camille  ',
      email: 'Camille@Example.Test',
      emailConsent: true,
      marketingConsent: true,
      ageConfirmed: true,
      secondPlayer: {
        displayName: 'Léa',
        email: 'lea@example.test',
        emailConsent: true,
        ageConfirmed: true,
      },
    })

    expect(response.statusCode).toBe(201)

    const row = registrationsOf(1)[0]!

    expect(row).toMatchObject({
      display_name: 'Camille',
      email: 'camille@example.test',
      second_display_name: 'Léa',
      second_email: 'lea@example.test',
    })
    expect(row.consent_at).not.toBeNull()
    expect(row.marketing_consent_at).not.toBeNull()
    expect(row.second_consent_at).not.toBeNull()
    expect(row.second_marketing_consent_at).toBeNull()
  })

  it('answers the same for a known and an unknown e-mail (no "welcome back")', async () => {
    const body = { email: 'known@example.test', emailConsent: true, ageConfirmed: true }
    dbState.game_participants.push({
      game_id: 9,
      podium: 1,
      display_name: 'Ancien',
      email: body.email,
    })

    const first = await register(body)
    const second = await register({ ...body, email: 'new@example.test' })

    expect(first.statusCode).toBe(second.statusCode)
    expect(first.body).toBe(second.body)
  })

  it('writes the request only to the game of its own token', async () => {
    seedGame({ id: 2, join_token: OTHER_TOKEN })

    await register({ displayName: 'Pour la une' })
    await post(REGISTRATIONS, { token: OTHER_TOKEN, displayName: 'Pour la deux' })

    expect(registrationsOf(1).map((row) => row.display_name)).toEqual(['Pour la une'])
    expect(registrationsOf(2).map((row) => row.display_name)).toEqual(['Pour la deux'])
  })

  it('answers the same 404 for a malformed, unknown or never issued token and stores nothing', async () => {
    const responses = await Promise.all(
      ['', 'trop-court', UNKNOWN_TOKEN].map((token) =>
        post(REGISTRATIONS, { token, displayName: 'Camille' })
      )
    )

    expect(responses.map((response) => response.statusCode)).toEqual([404, 404, 404])
    expect(new Set(responses.map((response) => response.body))).toEqual(
      new Set([JSON.stringify({ error: 'join_link_invalid' })])
    )
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it.each([
    ['expired', { join_expires_at: PAST }],
    ['running', { state: GAME_STATE_RUNNING }],
  ])('answers 410 and stores nothing when the game is %s', async (_label, change) => {
    Object.assign(dbState.games[0]!, change)

    const response = await register({})

    expect(response.statusCode).toBe(410)
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it('answers 404 once the staff closed or regenerated the link (old token)', async () => {
    Object.assign(dbState.games[0]!, { join_token: OTHER_TOKEN })

    const response = await register({})

    expect(response.statusCode).toBe(404)
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it('answers 410 when the room is inactive', async () => {
    Object.assign(dbState.rooms[0]!, { status: ROOM_STATUS_INACTIVE })

    const response = await register({})

    expect(response.statusCode).toBe(410)
    expect(response.json()).toEqual({ error: 'join_link_closed' })
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it('locks the game before counting, so two phones cannot pass the cap together', async () => {
    const { lockedTables } = await import('../_helpers/mockDb')

    await register({})

    expect(lockedTables).toContain('games')
  })

  it(`accepts up to ${JOIN_MAX_PENDING_REGISTRATIONS} waiting requests, then answers 409 join_full`, async () => {
    seedRegistrations(JOIN_MAX_PENDING_REGISTRATIONS - 1)

    expect((await register({ displayName: 'Le douzième' })).statusCode).toBe(201)

    const full = await register({ displayName: 'Le treizième' })

    expect(full.statusCode).toBe(409)
    expect(full.json()).toEqual({ error: 'join_full' })
    expect(registrationsOf(1)).toHaveLength(JOIN_MAX_PENDING_REGISTRATIONS)
    expect(registrationsOf(1).map((row) => row.display_name)).not.toContain('Le treizième')
  })

  it('counts the waiting requests of each game apart', async () => {
    seedGame({ id: 2, join_token: OTHER_TOKEN })
    seedRegistrations(JOIN_MAX_PENDING_REGISTRATIONS, 2)

    expect((await register({})).statusCode).toBe(201)
  })

  it.each([
    ['no name', { displayName: '' }, 'displayName'],
    ['a blank name', { displayName: '   ' }, 'displayName'],
    [
      'a name over the limit',
      { displayName: 'x'.repeat(JOIN_DISPLAY_NAME_MAX_LENGTH + 1) },
      'displayName',
    ],
    [
      'an invalid e-mail',
      { email: 'pas-un-email', emailConsent: true, ageConfirmed: true },
      'email',
    ],
    ['an empty e-mail', { email: '', emailConsent: true, ageConfirmed: true }, 'email'],
  ])('refuses %s with 400 invalid_body', async (_label, body, field) => {
    const response = await register(body)

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_body')
    expect(Object.keys(response.json().details.fieldErrors)).toContain(field)
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it('accepts a name of exactly the maximal length', async () => {
    const response = await register({ displayName: 'x'.repeat(JOIN_DISPLAY_NAME_MAX_LENGTH) })

    expect(response.statusCode).toBe(201)
  })

  it.each([
    ['email_consent_required', { email: 'a@example.test', ageConfirmed: true }],
    ['marketing_consent_requires_email', { marketingConsent: true }],
    ['age_confirmation_required', { email: 'a@example.test', emailConsent: true }],
    [
      'age_confirmation_required',
      { email: 'a@example.test', emailConsent: true, ageConfirmed: false },
    ],
  ])('names %s when the consents are missing', async (code, body) => {
    const response = await register(body)

    expect(response.statusCode).toBe(400)
    expect(JSON.stringify(response.json().details.fieldErrors)).toContain(code)
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it('applies the same consent rules to the second player', async () => {
    const response = await register({
      secondPlayer: { displayName: 'Léa', email: 'lea@example.test' },
    })

    expect(response.statusCode).toBe(400)

    // Le chemin complet nomme le joueur et le champ : la page place chaque erreur au bon endroit.
    expect(response.json().details.fieldErrors).toEqual({
      'secondPlayer.emailConsent': ['email_consent_required'],
      'secondPlayer.ageConfirmed': ['age_confirmation_required'],
    })
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it('names the refused field of the second player by its full path', async () => {
    const response = await register({ secondPlayer: { displayName: '   ' } })

    expect(response.statusCode).toBe(400)
    expect(Object.keys(response.json().details.fieldErrors)).toEqual(['secondPlayer.displayName'])
  })

  it.each([
    ['a control character', '\u0000x'],
    ['a right-to-left override', '\u202Eabc'],
    ['only a zero-width space', '\u200B'],
  ])('refuses a first name with %s, for either player', async (_label, displayName) => {
    const first = await register({ displayName })

    expect(first.statusCode).toBe(400)
    expect(first.json().details.fieldErrors).toEqual({ displayName: ['display_name_invalid'] })

    const second = await register({ secondPlayer: { displayName } })

    expect(second.statusCode).toBe(400)
    expect(second.json().details.fieldErrors).toEqual({
      'secondPlayer.displayName': ['display_name_invalid'],
    })
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it('keeps accepting accented, hyphenated and non-latin first names', async () => {
    for (const displayName of ['Anne-Sophie', 'Zoë', 'José', '李雷', 'D’Artagnan']) {
      expect((await register({ displayName })).statusCode).toBe(201)
    }
  })

  it.each([
    ['an unknown field', { gameId: 1 }],
    ['a podium', { podium: 1 }],
    ['an unknown field on the second player', { secondPlayer: { displayName: 'Léa', podium: 2 } }],
  ])('refuses %s (strict body)', async (_label, body) => {
    const response = await register(body)

    expect(response.statusCode).toBe(400)
    expect(dbState.game_registrations).toHaveLength(0)
  })

  it('refuses a body over 4 KB with 413', async () => {
    const response = await register({ displayName: 'x'.repeat(JOIN_BODY_LIMIT) })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({ error: 'payload_too_large' })
  })

  it(`answers 429 too_many_requests after ${JOIN_REGISTRATION_RATE_LIMIT_MAX} requests from one address`, async () => {
    for (let index = 0; index < JOIN_REGISTRATION_RATE_LIMIT_MAX; index += 1) {
      // Même invalides, les envois comptent : sonder la route ne coûte pas moins.
      expect((await register({ displayName: '' })).statusCode).toBe(400)
    }

    const limited = await register({})

    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toEqual({ error: 'too_many_requests' })
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    expect(dbState.game_registrations).toHaveLength(0)

    // Une autre adresse n'est pas touchée, et la lecture du lien reste ouverte pour la première.
    expect((await register({}, '203.0.113.77')).statusCode).toBe(201)
    expect((await lookup(TOKEN)).statusCode).toBe(200)
  })

  it('does not put the token or any player data in the logs', async () => {
    const lines: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk))
        callback()
      },
    })
    await app.close()
    app = await createApp(stream)

    await register({
      displayName: 'Prénom secret',
      email: 'secret@example.test',
      emailConsent: true,
      ageConfirmed: true,
    })
    await lookup(TOKEN)
    await register({ displayName: '' })

    const logs = lines.join('')

    expect(logs).not.toBe('')
    for (const secret of [TOKEN, 'Prénom secret', 'secret@example.test']) {
      expect(logs).not.toContain(secret)
    }
  })

  it('logs a failed registration without the row values PostgreSQL puts in the error detail', async () => {
    const lines: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk))
        callback()
      },
    })
    await app.close()
    app = await createApp(stream)
    // Une erreur PostgreSQL réelle : `detail` recopie la ligne refusée, e-mail compris.
    vi.spyOn(db, 'transaction').mockRejectedValueOnce(
      Object.assign(new Error('insert into "game_registrations" (...) values ($1, $2) - boom'), {
        code: '23514',
        detail: 'Failing row contains (secret@example.test, Prénom secret).',
      })
    )

    const response = await register({
      displayName: 'Prénom secret',
      email: 'secret@example.test',
      emailConsent: true,
      ageConfirmed: true,
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'server_error' })

    const logs = lines.join('')

    // L'incident reste diagnostiquable : message, code PostgreSQL et pile y sont.
    expect(logs).toContain('public API error')
    expect(logs).toContain('23514')
    expect(logs).toContain('boom')
    for (const secret of [TOKEN, 'Prénom secret', 'secret@example.test', 'Failing row']) {
      expect(logs).not.toContain(secret)
    }
  })
})
