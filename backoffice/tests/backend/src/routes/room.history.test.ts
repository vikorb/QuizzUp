import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  GAME_STATE_FINISHED,
  GAME_STATE_RUNNING,
  GAME_STATUS_ACTIVE,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  ROOM_STATUS_ACTIVE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
} from '@quizzup/shared'
import roomRoutes from '@backend/routes/room'
import { dbState } from './_helpers/mockDb'
import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'
import { authHeaders, createRouteApp, parseJson, type TestUser } from './_helpers/testApp'

resetRouteMocksBeforeEach()

const roomUser = {
  sub: '10',
  id: 10,
  company_id: 1,
  role: ADMIN_ROLE_ROOM,
  room_id: 1,
  sid: 'sid-room',
} as TestUser

const SCORES = [{ podium: 1, score: 900 }]

function seedGame() {
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

function seedContent() {
  // Thèmes 1 (global) et 2 (compagnie 1) lisibles ; 3 appartient à la compagnie 2.
  dbState.themes.push(
    { id: 1, scope: THEME_SCOPE_GLOBAL, company_id: null, status: THEME_STATUS_ACTIVE },
    { id: 2, scope: THEME_SCOPE_COMPANY, company_id: 1, status: THEME_STATUS_ACTIVE },
    { id: 3, scope: THEME_SCOPE_COMPANY, company_id: 2, status: THEME_STATUS_ACTIVE }
  )
  // Questions 10 et 11 lisibles ; 12 appartient à la compagnie 2.
  dbState.questions.push(
    { id: 10, scope: THEME_SCOPE_GLOBAL, company_id: null, status: QUESTION_STATUS_ACTIVE },
    { id: 11, scope: THEME_SCOPE_COMPANY, company_id: 1, status: QUESTION_STATUS_ACTIVE },
    { id: 12, scope: THEME_SCOPE_COMPANY, company_id: 2, status: QUESTION_STATUS_ACTIVE }
  )
}

const ROUNDS = [
  { position: 1, miniGame: 'quick_answer', themeId: 1, questionIds: [10, 11] },
  { position: 2, miniGame: 'first_buzz', themeId: 2, questionIds: [11] },
]

async function finish(body: Record<string, unknown>, user: TestUser = roomUser) {
  const app = await createRouteApp(roomRoutes)
  const response = await app.inject({
    method: 'POST',
    url: '/room/games/5/finish',
    headers: authHeaders(user),
    payload: body,
  })

  await app.close()

  return response
}

describe('POST /room/games/:gameId/finish : manches jouées (lot 8d)', () => {
  it('records the rounds with the scores, once even when the finish is sent twice', async () => {
    seedGame()
    seedContent()

    const first = await finish({ scores: SCORES, rounds: ROUNDS })
    const again = await finish({ scores: SCORES, rounds: ROUNDS })

    expect(first.statusCode).toBe(200)
    expect(parseJson<{ game: { state: string } }>(first).game.state).toBe(GAME_STATE_FINISHED)
    expect(again.statusCode).toBe(200)
    expect(
      dbState.game_rounds.map((row) => ({
        game_id: row.game_id,
        position: row.position,
        mini_game: row.mini_game,
        theme_id: row.theme_id,
        questions: JSON.parse(row.questions as string),
      }))
    ).toEqual([
      { game_id: 5, position: 1, mini_game: 'quick_answer', theme_id: 1, questions: [10, 11] },
      { game_id: 5, position: 2, mini_game: 'first_buzz', theme_id: 2, questions: [11] },
    ])
    expect(dbState.game_participants[0]!.score).toBe(900)
  })

  it('still finishes a game without rounds, an old room screen sends none', async () => {
    seedGame()

    const response = await finish({ scores: SCORES })

    expect(response.statusCode).toBe(200)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_FINISHED)
    expect(dbState.game_rounds).toEqual([])
  })

  it('accepts an empty list of rounds and a round without theme', async () => {
    seedGame()
    seedContent()

    const response = await finish({
      scores: SCORES,
      rounds: [{ position: 1, miniGame: 'streak', themeId: null, questionIds: [] }],
    })

    expect(response.statusCode).toBe(200)
    expect(dbState.game_rounds).toMatchObject([{ position: 1, theme_id: null, questions: '[]' }])
  })

  it.each([
    ['a theme of another company', [{ ...ROUNDS[0], themeId: 3 }]],
    ['a question of another company', [{ ...ROUNDS[0], questionIds: [10, 12] }]],
    ['an unknown theme', [{ ...ROUNDS[0], themeId: 99 }]],
    ['an unknown question', [{ ...ROUNDS[0], questionIds: [99] }]],
  ])('refuses %s without finishing the game', async (_label, rounds) => {
    seedGame()
    seedContent()

    const response = await finish({ scores: SCORES, rounds })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'game_rounds_invalid' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_RUNNING)
    expect(dbState.game_rounds).toEqual([])
  })

  it.each([
    ['a duplicated position', [ROUNDS[0], { ...ROUNDS[1], position: 1 }]],
    ['a duplicated question in a round', [{ ...ROUNDS[0], questionIds: [10, 10] }]],
    ['an unknown mini-game', [{ ...ROUNDS[0], miniGame: 'poker' }]],
    ['a position of 0', [{ ...ROUNDS[0], position: 0 }]],
    [
      'too many questions',
      [{ ...ROUNDS[0], questionIds: Array.from({ length: 21 }, (_, i) => i + 1) }],
    ],
    ['too many rounds', Array.from({ length: 21 }, (_, i) => ({ ...ROUNDS[0], position: i + 1 }))],
    ['an extra field', [{ ...ROUNDS[0], answers: [] }]],
    ['rounds that are not a list', 'nope'],
  ])('rejects %s as an invalid body', async (_label, rounds) => {
    seedGame()
    seedContent()

    const response = await finish({ scores: SCORES, rounds })

    expect(response.statusCode).toBe(400)
    expect(parseJson<{ error: string }>(response).error).toBe('invalid_body')
    expect(dbState.games[0]!.state).toBe(GAME_STATE_RUNNING)
    expect(dbState.game_rounds).toEqual([])
  })

  it('refuses a round numbered beyond the rounds of the game', async () => {
    seedGame()
    seedContent()
    dbState.games[0]!.rounds_count = 1

    const response = await finish({ scores: SCORES, rounds: ROUNDS })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'game_rounds_invalid' })
    expect(dbState.games[0]!.state).toBe(GAME_STATE_RUNNING)
    expect(dbState.game_rounds).toEqual([])

    expect((await finish({ scores: SCORES, rounds: [ROUNDS[0]] })).statusCode).toBe(200)
  })

  it('keeps the rounds of a theme or a question deleted or drafted since they were drawn', async () => {
    seedGame()
    seedContent()
    // L'écran de salle renvoie parfois sa fin de partie après une suppression : on garde l'historique.
    dbState.themes[0]!.status = THEME_STATUS_DELETED
    dbState.questions[0]!.status = QUESTION_STATUS_DELETED
    dbState.questions[1]!.status = QUESTION_STATUS_DRAFT

    const response = await finish({ scores: SCORES, rounds: ROUNDS })

    expect(response.statusCode).toBe(200)
    expect(dbState.game_rounds).toHaveLength(2)
  })

  it('does not write the rounds of a game of another company', async () => {
    seedGame()
    seedContent()

    const response = await finish({ scores: SCORES, rounds: ROUNDS }, {
      ...roomUser,
      company_id: 2,
    } as TestUser)

    expect(response.statusCode).toBe(404)
    expect(dbState.games[0]!.state).toBe(GAME_STATE_RUNNING)
    expect(dbState.game_rounds).toEqual([])
  })
})
