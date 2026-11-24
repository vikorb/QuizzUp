import './_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  ANSWER_STATUS_ACTIVE,
  GAME_STATE_PENDING,
  GAME_STATUS_ACTIVE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_STATUS_ACTIVE,
  ROOM_STATUS_ACTIVE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_INACTIVE,
} from '@quizzup/shared'
import roomRoutes from '@backend/routes/room'
import { dbState } from './_helpers/mockDb'
import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'
import { authHeaders, createRouteApp, parseJson, type TestUser } from './_helpers/testApp'

const roomUser = {
  sub: '10',
  id: 10,
  company_id: 1,
  role: ADMIN_ROLE_ROOM,
  room_id: 1,
  sid: 'sid-room',
} as TestUser

resetRouteMocksBeforeEach()

function theme(id: number, overrides: Record<string, unknown> = {}) {
  dbState.themes.push({
    id,
    name: `Thème ${id}`,
    scope: THEME_SCOPE_GLOBAL,
    company_id: null,
    status: THEME_STATUS_ACTIVE,
    kids_friendly: false,
    ...overrides,
  })
}

/** Question sans média, avec une réponse active, rattachée à un ou plusieurs thèmes. */
function question(id: number, ...themeIds: number[]) {
  dbState.questions.push({
    id,
    question: `Question ${id}`,
    scope: THEME_SCOPE_GLOBAL,
    company_id: null,
    status: QUESTION_STATUS_ACTIVE,
    type_media: QUESTION_MEDIA_TYPE_NONE,
  })
  dbState.answers.push({
    id: id * 10,
    question_id: id,
    response: 'Bonne',
    is_correct: true,
    status: ANSWER_STATUS_ACTIVE,
  })

  for (const themeId of themeIds) {
    dbState.question_themes.push({ question_id: id, theme_id: themeId })
  }
}

function seedGame(overrides: Record<string, unknown> = {}) {
  dbState.rooms.push({ id: 1, company_id: 1, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE })
  dbState.games.push({
    id: 5,
    company_id: 1,
    room_id: 1,
    admin_id: 2,
    rounds_count: 10,
    questions_per_round: 10,
    seed: '42',
    state: GAME_STATE_PENDING,
    status: GAME_STATUS_ACTIVE,
    kids_mode: false,
    ...overrides,
  })
}

/**
 * 1 enfants (global) : questions 11 et 12 ; 2 adulte (global) : questions 21 et 12 ;
 * 3 enfants de la compagnie 1 : question 31 ; 4 enfants de la compagnie 2 : question 41 ;
 * 5 enfants mais inactif : question 51 ; 6 adulte de la compagnie 1 : question 61.
 */
function seedContent() {
  theme(1, { kids_friendly: true })
  theme(2)
  theme(3, { scope: THEME_SCOPE_COMPANY, company_id: 1, kids_friendly: true })
  theme(4, { scope: THEME_SCOPE_COMPANY, company_id: 2, kids_friendly: true })
  theme(5, { status: THEME_STATUS_INACTIVE, kids_friendly: true })
  theme(6, { scope: THEME_SCOPE_COMPANY, company_id: 1 })
  question(11, 1)
  question(12, 1, 2)
  question(21, 2)
  question(31, 3)
  question(41, 4)
  question(51, 5)
  question(61, 6)
}

type ContentBody = { themes: { id: number; questions: { id: number }[] }[] }

async function get(url: string) {
  const app = await createRouteApp(roomRoutes)
  const response = await app.inject({ method: 'GET', url, headers: authHeaders(roomUser) })

  await app.close()

  return response
}

const summary = (response: Awaited<ReturnType<typeof get>>) =>
  parseJson<ContentBody>(response).themes.map((item) => [
    item.id,
    item.questions.map((entry) => entry.id).sort((a, b) => a - b),
  ])

describe('routes/room.ts — contenu d’une partie en mode enfants', () => {
  it('ne renvoie que les thèmes adaptés aux enfants, de la compagnie ou globaux, et actifs', async () => {
    seedGame({ kids_mode: true })
    seedContent()

    const response = await get('/room/games/current/content')

    expect(response.statusCode).toBe(200)
    // La question 12 est aussi dans le thème adulte 2 : elle n'en sort pas.
    expect(summary(response)).toEqual([
      [1, [11, 12]],
      [3, [31]],
    ])
  })

  it('renvoie tous les thèmes lisibles quand la partie n’est pas en mode enfants', async () => {
    seedGame()
    seedContent()

    expect(summary(await get('/room/games/current/content'))).toEqual([
      [1, [11, 12]],
      [2, [12, 21]],
      [3, [31]],
      [6, [61]],
    ])
  })

  it('applique le filtre aussi avec ?ids=', async () => {
    seedGame({ kids_mode: true })
    seedContent()

    expect(summary(await get('/room/games/current/content?ids=11,21,31,61'))).toEqual([
      [1, [11]],
      [3, [31]],
    ])
  })

  it('renvoie une liste vide, sans erreur, quand aucun thème n’est adapté aux enfants', async () => {
    seedGame({ kids_mode: true })
    theme(2)
    question(21, 2)

    const response = await get('/room/games/current/content')

    expect(response.statusCode).toBe(200)
    expect(parseJson<ContentBody>(response).themes).toEqual([])
  })

  it('ignore le mode enfants d’une partie d’une autre compagnie', async () => {
    seedGame({ kids_mode: false })
    dbState.games.push({
      id: 6,
      company_id: 2,
      room_id: 2,
      state: GAME_STATE_PENDING,
      status: GAME_STATUS_ACTIVE,
      kids_mode: true,
    })
    seedContent()

    expect(summary(await get('/room/games/current/content'))).toHaveLength(4)
  })
})

describe('routes/room.ts — kidsMode dans la partie courante', () => {
  it('renvoie game.kidsMode', async () => {
    seedGame({ kids_mode: true })

    const response = await get('/room/games/current')

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ game: { kidsMode: boolean } }>(response).game.kidsMode).toBe(true)
  })

  it('renvoie game.kidsMode à false pour une partie normale', async () => {
    seedGame()

    expect(
      parseJson<{ game: { kidsMode: boolean } }>(await get('/room/games/current')).game.kidsMode
    ).toBe(false)
  })
})
