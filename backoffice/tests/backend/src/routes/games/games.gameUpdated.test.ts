import '../_helpers/registerRouteMocks'

import gamesRoutes from '@backend/routes/games'
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
  expectNobodyNotified,
  expectOnlyCompany1Notified,
  type TestUser,
  watchGameUpdates,
} from '../_helpers/testApp'

// `game_updated` : le serveur prévient la salle et le personnel de la compagnie, par l'identifiant
// de la partie seulement. Un abonné d'une autre compagnie, ou d'une autre salle, ne reçoit rien.

resetRouteMocksBeforeEach()

const NOW = new Date('2027-03-10T08:00:00.000Z')
const otherCompanyAdmin = { ...companyAdminUser, company_id: 2, companyId: 2 } as TestUser

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seedRoom()
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
    state: GAME_STATE_PENDING,
    started_at: null,
    finished_at: null,
    join_token: null,
    join_expires_at: null,
    scheduled_at: null,
    scheduled_end_at: null,
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

function seedScheduled() {
  seedGame({
    state: GAME_STATE_SCHEDULED,
    scheduled_at: '2027-03-10T13:00:00.000Z',
    scheduled_end_at: '2027-03-10T14:00:00.000Z',
  })
}

function seedRegistration() {
  dbState.game_registrations.push({
    id: 1,
    game_id: 1,
    display_name: 'Léa',
    email: 'lea@exemple.fr',
    consent_at: '2027-03-10T07:55:00.000Z',
    marketing_consent_at: null,
    second_display_name: null,
    second_email: null,
    second_consent_at: null,
    second_marketing_consent_at: null,
    created_at: '2027-03-10T07:55:00.000Z',
  })
}

function seedParticipant() {
  dbState.game_participants.push({
    id: 1,
    game_id: 1,
    podium: 1,
    display_name: 'Hugo',
    email: null,
    consent_at: null,
    second_display_name: null,
    score: 0,
  })
}

async function call(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  user: TestUser = companyAdminUser
) {
  const app = await createRouteApp(gamesRoutes)
  const updates = watchGameUpdates(app)
  const response = await app.inject({
    method,
    url,
    headers: authHeaders(user),
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  })

  await app.close()

  return { response, updates }
}

type Case = {
  name: string
  method: 'POST' | 'PATCH' | 'DELETE'
  url: string
  payload?: unknown
  /** Données de la partie 1 avant l'appel. */
  seed: () => void
  /** Appel qui échoue (partie inconnue, déjà lancée…) : rien n'est annoncé. */
  failing?: { url: string; status: number }
}

const cases: Case[] = [
  {
    name: 'POST /games (création)',
    method: 'POST',
    url: '/companies/1/games',
    payload: { roomId: 1, participants: [{ podium: 1, displayName: 'Léa' }] },
    seed: () => undefined,
  },
  {
    name: 'PATCH /games/:id (session programmée)',
    method: 'PATCH',
    url: '/companies/1/games/1',
    payload: { externalRef: 'NEW' },
    seed: seedScheduled,
    failing: { url: '/companies/1/games/99', status: 404 },
  },
  {
    name: 'POST /games/:id/abort',
    method: 'POST',
    url: '/companies/1/games/1/abort',
    seed: () => seedGame(),
    failing: { url: '/companies/1/games/99/abort', status: 404 },
  },
  {
    name: 'POST /games/:id/open',
    method: 'POST',
    url: '/companies/1/games/1/open',
    seed: () => {
      vi.setSystemTime(new Date('2027-03-10T12:00:00.000Z'))
      seedScheduled()
    },
    failing: { url: '/companies/1/games/99/open', status: 404 },
  },
  {
    name: 'POST /games/:id/cancel',
    method: 'POST',
    url: '/companies/1/games/1/cancel',
    seed: seedScheduled,
    failing: { url: '/companies/1/games/99/cancel', status: 404 },
  },
  {
    name: 'POST /games/:id/join (ouvrir le lien)',
    method: 'POST',
    url: '/companies/1/games/1/join',
    seed: () => seedGame(),
    failing: { url: '/companies/1/games/99/join', status: 404 },
  },
  {
    name: 'DELETE /games/:id/join (fermer le lien)',
    method: 'DELETE',
    url: '/companies/1/games/1/join',
    seed: () => seedGame({ join_token: 'a'.repeat(43) }),
    failing: { url: '/companies/1/games/99/join', status: 404 },
  },
  {
    name: 'POST /games/:id/participants (joueur ajouté)',
    method: 'POST',
    url: '/companies/1/games/1/participants',
    payload: { podium: 2, displayName: 'Noé' },
    seed: () => seedGame(),
    failing: { url: '/companies/1/games/99/participants', status: 404 },
  },
  {
    name: 'DELETE /games/:id/participants/:id (joueur retiré)',
    method: 'DELETE',
    url: '/companies/1/games/1/participants/1',
    seed: () => {
      seedGame()
      seedParticipant()
    },
    failing: { url: '/companies/1/games/1/participants/99', status: 404 },
  },
  {
    name: 'POST /games/:id/registrations/:id/accept (demande acceptée)',
    method: 'POST',
    url: '/companies/1/games/1/registrations/1/accept',
    seed: () => {
      seedGame()
      seedRegistration()
    },
    failing: { url: '/companies/1/games/1/registrations/99/accept', status: 404 },
  },
  {
    name: 'DELETE /games/:id/registrations/:id (demande refusée)',
    method: 'DELETE',
    url: '/companies/1/games/1/registrations/1',
    seed: () => {
      seedGame()
      seedRegistration()
    },
    failing: { url: '/companies/1/games/1/registrations/99', status: 404 },
  },
]

describe.each(cases)('game_updated : $name', (testCase) => {
  const { method, url, payload, seed, failing } = testCase

  it('prévient la salle et le personnel de la compagnie, par l’identifiant de la partie seul', async () => {
    seed()

    const { response, updates } = await call(method, url, payload)

    expect(response.statusCode).toBeLessThan(300)
    // La création donne son identifiant à la partie ; les autres routes visent la partie 1.
    expectOnlyCompany1Notified(updates, Number(dbState.games.at(-1)!.id))
    expect(JSON.stringify(updates)).not.toMatch(/Léa|Hugo|Noé|@/)
  })

  it('ne prévient personne quand le compte est d’une autre compagnie', async () => {
    seed()

    const { response, updates } = await call(method, url, payload, otherCompanyAdmin)

    expect(response.statusCode).toBe(403)
    expectNobodyNotified(updates)
  })

  if (failing) {
    it('ne prévient personne quand l’appel échoue', async () => {
      seed()

      const { response, updates } = await call(method, failing.url, payload)

      expect(response.statusCode).toBe(failing.status)
      expectNobodyNotified(updates)
    })
  }
})

describe('game_updated : déplacement d’une session', () => {
  it('prévient aussi la salle de destination, et elle seule en plus', async () => {
    dbState.rooms.push({ ...dbState.rooms[0]!, id: 2 })
    seedScheduled()

    const { response, updates } = await call('PATCH', '/companies/1/games/1', { roomId: 2 })

    expect(response.statusCode).toBe(200)
    expect(updates.room1).toEqual([{ gameId: 1 }])
    expect(updates.room2).toEqual([{ gameId: 1 }])
    expect(updates.room3).toEqual([])
    expect(updates.staff2).toEqual([])
  })
})
