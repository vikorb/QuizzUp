import './_helpers/registerRouteMocks'

import roomRoutes from '@backend/routes/room'
import { findAvoidQuestionIds } from '@backend/routes/room/_history'
import {
  ADMIN_ROLE_ROOM,
  GAME_STATE_RUNNING,
  GAME_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import { describe, expect, it, vi } from 'vitest'

import { dbState } from './_helpers/mockDb'
import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  type TestUser,
} from './_helpers/testApp'

resetRouteMocksBeforeEach()

const roomUser = {
  sub: '10',
  id: 10,
  company_id: 1,
  role: ADMIN_ROLE_ROOM,
  room_id: 1,
  sid: 'sid-room',
} as TestUser

function seedRunningGame() {
  dbState.rooms.push({
    id: 1,
    company_id: 1,
    name: 'Salle Néon',
    config: {},
    config_revision: 0,
    status: ROOM_STATUS_ACTIVE,
    deleted_at: null,
  })
  dbState.games.push({
    id: 5,
    company_id: 1,
    room_id: 1,
    admin_id: 2,
    rounds_count: 10,
    questions_per_round: 10,
    seed: '42',
    state: GAME_STATE_RUNNING,
    started_at: null,
    finished_at: null,
    status: GAME_STATUS_ACTIVE,
    deleted_at: null,
  })
  dbState.game_participants.push({ id: 1, game_id: 5, podium: 1, display_name: 'Léa', score: 0 })
}

async function getCurrent(user: TestUser = roomUser) {
  const app = await createRouteApp(roomRoutes)
  const response = await app.inject({
    method: 'GET',
    url: '/room/games/current',
    headers: authHeaders(user),
  })

  await app.close()

  return response
}

// La requête elle-même (e-mails, compagnie, récence) se prouve sur PostgreSQL :
// `tests/backend/src/db/avoidQuestions.pg.test.ts`.
describe('GET /room/games/current : questions déjà vues (lot 8e)', () => {
  it('gives the questions already seen by the players of the game, for its company', async () => {
    seedRunningGame()
    vi.mocked(findAvoidQuestionIds).mockResolvedValueOnce([12, 7, 30])

    const response = await getCurrent()

    expect(response.statusCode).toBe(200)
    expect(
      parseJson<{ game: { avoidQuestionIds: number[] } }>(response).game.avoidQuestionIds
    ).toEqual([12, 7, 30])
    expect(findAvoidQuestionIds).toHaveBeenLastCalledWith(1, 5)
  })

  it('gives an empty list when nobody is known', async () => {
    seedRunningGame()

    const response = await getCurrent()

    expect(
      parseJson<{ game: { avoidQuestionIds: number[] } }>(response).game.avoidQuestionIds
    ).toEqual([])
  })

  it('does not look for anything, and does not answer a game, when the room has none', async () => {
    vi.mocked(findAvoidQuestionIds).mockClear()
    dbState.rooms.push({ id: 1, company_id: 1, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE })

    const response = await getCurrent()

    expect(parseJson<{ game: unknown }>(response).game).toBeNull()
    expect(findAvoidQuestionIds).not.toHaveBeenCalled()
  })

  it('never looks at the history of another company, nor at a game of another room', async () => {
    seedRunningGame()
    vi.mocked(findAvoidQuestionIds).mockClear()

    const otherCompany = await getCurrent({ ...roomUser, company_id: 2 } as TestUser)
    const otherRoom = await getCurrent({ ...roomUser, room_id: 2 } as TestUser)

    expect(parseJson<{ game: unknown }>(otherCompany).game).toBeNull()
    expect(parseJson<{ game: unknown }>(otherRoom).game).toBeNull()
    expect(findAvoidQuestionIds).not.toHaveBeenCalled()
  })

  it('stays reserved to room accounts', async () => {
    seedRunningGame()
    vi.mocked(findAvoidQuestionIds).mockClear()

    const response = await getCurrent(companyAdminUser)

    expect(response.statusCode).toBe(403)
    expect(findAvoidQuestionIds).not.toHaveBeenCalled()
  })
})
