import '../_helpers/registerRouteMocks'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GAME_STATE_PENDING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import gamesRoutes from '@backend/routes/games'
import { dbState, MOCK_NOW } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { authHeaders, companyAdminUser, createRouteApp, parseJson } from '../_helpers/testApp'

resetRouteMocksBeforeEach()

// Mode enfants (Q5) : aucun e-mail de joueur n'est gardé, quel que soit le chemin d'écriture,
// sans erreur renvoyée. Hors mode enfants, l'e-mail est gardé.

const NOW = new Date('2027-03-10T08:00:00.000Z')
const WITH_EMAILS = {
  podium: 1,
  displayName: 'Léa',
  email: 'lea@exemple.fr',
  emailConsent: true,
  marketingConsent: true,
  secondPlayer: { displayName: 'Noé', email: 'noe@exemple.fr', emailConsent: true },
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
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
})

afterEach(() => {
  vi.useRealTimers()
})

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
    cancelled_at: null,
    kids_mode: false,
    join_token: null,
    join_expires_at: null,
    status: GAME_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: null,
    deleted_at: null,
    ...overrides,
  })
}

function seedScheduledGame(overrides: Record<string, unknown> = {}) {
  seedGame({
    state: GAME_STATE_SCHEDULED,
    scheduled_at: '2027-03-10T13:00:00.000Z',
    scheduled_end_at: '2027-03-10T14:00:00.000Z',
    ...overrides,
  })
}

function seedRegistration() {
  dbState.game_registrations.push({
    id: 1,
    game_id: 1,
    display_name: 'Léa',
    email: 'lea@exemple.fr',
    consent_at: '2027-03-10T07:55:00.000Z',
    marketing_consent_at: '2027-03-10T07:55:00.000Z',
    second_display_name: 'Noé',
    second_email: 'noe@exemple.fr',
    second_consent_at: '2027-03-10T07:55:00.000Z',
    second_marketing_consent_at: '2027-03-10T07:55:00.000Z',
    created_at: '2027-03-10T07:55:00.000Z',
  })
}

async function call(method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown>) {
  const app = await createRouteApp(gamesRoutes)
  const response = await app.inject({
    method,
    url,
    headers: authHeaders(companyAdminUser),
    payload,
  })

  await app.close()

  return response
}

const NO_PERSONAL_DATA = {
  email: null,
  consent_at: null,
  marketing_consent_at: null,
  second_email: null,
  second_consent_at: null,
  second_marketing_consent_at: null,
}

const KEPT_PERSONAL_DATA = { email: 'lea@exemple.fr', second_email: 'noe@exemple.fr' }

describe('mode enfants : création d une partie', () => {
  it('keeps no e-mail when the client sends some', async () => {
    const response = await call('POST', '/companies/1/games', {
      roomId: 1,
      kidsMode: true,
      participants: [WITH_EMAILS],
    })

    expect(response.statusCode).toBe(201)
    expect(dbState.game_participants).toHaveLength(1)
    expect(dbState.game_participants[0]).toMatchObject({
      display_name: 'Léa',
      second_display_name: 'Noé',
      ...NO_PERSONAL_DATA,
    })
    expect(response.body).not.toContain('exemple.fr')
  })

  it('keeps the e-mail outside kids mode', async () => {
    const response = await call('POST', '/companies/1/games', {
      roomId: 1,
      participants: [WITH_EMAILS],
    })

    expect(response.statusCode).toBe(201)
    expect(dbState.game_participants[0]).toMatchObject(KEPT_PERSONAL_DATA)
  })
})

describe('mode enfants : ajout d un participant', () => {
  it('keeps no e-mail on a kids game', async () => {
    seedGame({ kids_mode: true })

    const response = await call('POST', '/companies/1/games/1/participants', WITH_EMAILS)

    expect(response.statusCode).toBe(201)
    expect(dbState.game_participants[0]).toMatchObject({ display_name: 'Léa', ...NO_PERSONAL_DATA })
    expect(parseJson<{ participant: Record<string, unknown> }>(response).participant).toMatchObject(
      { email: null, hasEmail: false }
    )
  })

  it('keeps the e-mail on a normal game', async () => {
    seedGame()

    const response = await call('POST', '/companies/1/games/1/participants', WITH_EMAILS)

    expect(response.statusCode).toBe(201)
    expect(dbState.game_participants[0]).toMatchObject(KEPT_PERSONAL_DATA)
  })
})

describe('mode enfants : modification des participants d une session', () => {
  it('keeps no e-mail when the session is already in kids mode', async () => {
    seedScheduledGame({ kids_mode: true })

    const response = await call('PATCH', '/companies/1/games/1', { participants: [WITH_EMAILS] })

    expect(response.statusCode).toBe(200)
    expect(dbState.game_participants).toHaveLength(1)
    expect(dbState.game_participants[0]).toMatchObject(NO_PERSONAL_DATA)
  })

  it('keeps no e-mail when the same call turns kids mode on', async () => {
    seedScheduledGame()

    const response = await call('PATCH', '/companies/1/games/1', {
      kidsMode: true,
      participants: [WITH_EMAILS],
    })

    expect(response.statusCode).toBe(200)
    expect(dbState.game_participants[0]).toMatchObject(NO_PERSONAL_DATA)
  })

  it('keeps the e-mail when the same call turns kids mode off', async () => {
    seedScheduledGame({ kids_mode: true })

    const response = await call('PATCH', '/companies/1/games/1', {
      kidsMode: false,
      participants: [WITH_EMAILS],
    })

    expect(response.statusCode).toBe(200)
    expect(dbState.game_participants[0]).toMatchObject(KEPT_PERSONAL_DATA)
  })

  it('keeps the e-mail on a normal session', async () => {
    seedScheduledGame()

    const response = await call('PATCH', '/companies/1/games/1', { participants: [WITH_EMAILS] })

    expect(response.statusCode).toBe(200)
    expect(dbState.game_participants[0]).toMatchObject(KEPT_PERSONAL_DATA)
  })
})

describe('mode enfants : validation d une demande par le personnel', () => {
  const accept = () => call('POST', '/companies/1/games/1/registrations/1/accept', {})

  it('writes a participant without e-mail nor consent, even if the request carries them', async () => {
    seedGame({ kids_mode: true })
    seedRegistration()

    const response = await accept()

    expect(response.statusCode).toBe(201)
    expect(dbState.game_registrations).toHaveLength(0)
    expect(dbState.game_participants[0]).toMatchObject({
      display_name: 'Léa',
      second_display_name: 'Noé',
      ...NO_PERSONAL_DATA,
    })
    expect(parseJson<{ participant: Record<string, unknown> }>(response).participant).toMatchObject(
      { email: null, hasEmail: false, marketingConsent: false }
    )
  })

  it('keeps the e-mail and the consents on a normal game', async () => {
    seedGame()
    seedRegistration()

    const response = await accept()

    expect(response.statusCode).toBe(201)
    expect(dbState.game_participants[0]).toMatchObject({
      ...KEPT_PERSONAL_DATA,
      consent_at: '2027-03-10T07:55:00.000Z',
    })
  })
})
