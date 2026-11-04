import './_helpers/registerRouteMocks'

import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATUS_ACTIVE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_VIDEO,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DRAFT,
  ROOM_STATUS_ACTIVE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_INACTIVE,
} from '@quizzup/shared'
import roomRoutes from '@backend/routes/room'
import { type MediaStorage, setMediaStorage } from '@backend/storage/mediaStorage'
import { dbState } from './_helpers/mockDb'
import { resetRouteMocksBeforeEach } from './_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  type TestUser,
} from './_helpers/testApp'

const roomUser = {
  sub: '10',
  id: 10,
  company_id: 1,
  role: ADMIN_ROLE_ROOM,
  room_id: 1,
  sid: 'sid-room',
} as TestUser

const MP3_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21])
const UUID = '0b6f1c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f'

function mediaKey(questionId: number): string {
  return `questions/${questionId}/${UUID}.mp3`
}

let files: Map<string, Buffer>

function memoryStorage(): MediaStorage {
  return {
    async save(key, content) {
      files.set(key, Buffer.from(content))
    },
    async read(key) {
      const content = files.get(key)

      return content ? { stream: Readable.from(content), size: content.length } : null
    },
    async remove(key) {
      files.delete(key)
    },
  }
}

function theme(id: number, overrides: Record<string, unknown> = {}) {
  dbState.themes.push({
    id,
    name: `Thème ${id}`,
    scope: THEME_SCOPE_GLOBAL,
    company_id: null,
    status: THEME_STATUS_ACTIVE,
    ...overrides,
  })
}

function question(id: number, themeId: number, overrides: Record<string, unknown> = {}) {
  const row = {
    id,
    question: `Extrait ${id}`,
    scope: THEME_SCOPE_GLOBAL,
    company_id: null,
    status: QUESTION_STATUS_ACTIVE,
    type_media: QUESTION_MEDIA_TYPE_AUDIO,
    media_key: mediaKey(id),
    media_mime_type: 'audio/mpeg',
    media_start_ms: 1500,
    ...overrides,
  }
  dbState.questions.push(row)
  dbState.question_themes.push({ question_id: id, theme_id: themeId })

  if (typeof row.media_key === 'string') {
    files.set(row.media_key, MP3_BYTES)
  }

  dbState.answers.push(
    {
      id: id * 10,
      question_id: id,
      response: 'Bonne',
      is_correct: true,
      status: ANSWER_STATUS_ACTIVE,
    },
    {
      id: id * 10 + 1,
      question_id: id,
      response: 'Fausse',
      is_correct: false,
      status: ANSWER_STATUS_ACTIVE,
    },
    {
      id: id * 10 + 2,
      question_id: id,
      response: 'Retirée',
      is_correct: false,
      status: ANSWER_STATUS_DELETED,
    }
  )
}

function seedRoomAndGame(gameOverrides: Record<string, unknown> = {}) {
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
    ...gameOverrides,
  })
}

resetRouteMocksBeforeEach()

beforeEach(() => {
  files = new Map()
  setMediaStorage(memoryStorage())
})

afterEach(() => {
  setMediaStorage(null)
})

type ContentBody = {
  themes: {
    id: number
    name: string
    questions: { id: number; mediaUrl: string | null; mediaStartMs: number; answers: unknown[] }[]
  }[]
}

describe('routes/room.ts — content of the current game', () => {
  it('keeps active questions of every type, audio only with a file, readable by the company', async () => {
    seedRoomAndGame()
    theme(1)
    question(11, 1)
    question(12, 1, { media_key: null }) // audio sans fichier : écartée
    question(13, 1, { type_media: QUESTION_MEDIA_TYPE_NONE, media_key: null })
    question(14, 1, { status: QUESTION_STATUS_DRAFT })
    question(15, 1, { scope: THEME_SCOPE_COMPANY, company_id: 2 })
    question(16, 1, {
      type_media: QUESTION_MEDIA_TYPE_IMAGE,
      media_key: null,
      media_url: 'https://cdn.test/16.jpg',
    })
    question(17, 1, { type_media: QUESTION_MEDIA_TYPE_IMAGE, media_key: null, media_url: null })
    question(18, 1, { type_media: QUESTION_MEDIA_TYPE_VIDEO, media_key: null, media_url: '  ' })
    theme(2, { scope: THEME_SCOPE_COMPANY, company_id: 1 })
    question(21, 2, { scope: THEME_SCOPE_COMPANY, company_id: 1 })
    theme(3, { scope: THEME_SCOPE_COMPANY, company_id: 2 })
    question(31, 3)
    theme(4, { status: THEME_STATUS_INACTIVE })
    question(41, 4)
    theme(5) // aucune question jouable : écarté
    question(51, 5, { media_key: null })
    const app = await createRouteApp(roomRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/room/games/current/content',
      headers: authHeaders(roomUser),
    })

    expect(response.statusCode).toBe(200)
    const body = parseJson<ContentBody>(response)
    expect(body.themes.map((item) => item.id)).toEqual([1, 2])
    expect(body.themes[0].questions.map((item) => item.id)).toEqual([11, 13, 16])
    expect(body.themes[0].questions[0]).toEqual({
      id: 11,
      text: 'Extrait 11',
      mediaType: QUESTION_MEDIA_TYPE_AUDIO,
      mediaUrl: '/room/questions/11/media',
      mediaStartMs: 1500,
      answers: [
        { id: 110, text: 'Bonne', isCorrect: true },
        { id: 111, text: 'Fausse', isCorrect: false },
      ],
    })
    expect(body.themes[0].questions[1]).toMatchObject({
      mediaType: QUESTION_MEDIA_TYPE_NONE,
      mediaUrl: null,
      mediaStartMs: 1500,
    })
    expect(body.themes[0].questions[2]).toMatchObject({
      mediaType: QUESTION_MEDIA_TYPE_IMAGE,
      mediaUrl: 'https://cdn.test/16.jpg',
    })
    expect(JSON.stringify(body)).not.toContain('questions/11/0b6f')
    expect(body.themes[1].questions.map((item) => item.id)).toEqual([21])

    await app.close()
  })

  it('answers 404 without a pending or running game', async () => {
    seedRoomAndGame({ state: GAME_STATE_FINISHED })
    const app = await createRouteApp(roomRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/room/games/current/content',
      headers: authHeaders(roomUser),
    })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'game_not_found' })

    await app.close()
  })

  it('is reserved to room accounts', async () => {
    seedRoomAndGame()
    const app = await createRouteApp(roomRoutes)

    const content = await app.inject({
      method: 'GET',
      url: '/room/games/current/content',
      headers: authHeaders(companyAdminUser),
    })
    const media = await app.inject({
      method: 'GET',
      url: '/room/questions/11/media',
      headers: authHeaders(companyAdminUser),
    })

    expect(content.statusCode).toBe(403)
    expect(media.statusCode).toBe(403)

    await app.close()
  })
})

describe('routes/room.ts — question media', () => {
  async function read(questionId: number | string, headers: Record<string, string> = {}) {
    const app = await createRouteApp(roomRoutes)
    const response = await app.inject({
      method: 'GET',
      url: `/room/questions/${questionId}/media`,
      headers: { ...authHeaders(roomUser), ...headers },
    })
    await app.close()

    return response
  }

  it('streams the audio file with revalidated private cache headers', async () => {
    seedRoomAndGame()
    theme(1)
    question(11, 1)

    const response = await read(11)

    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(MP3_BYTES)
    expect(response.headers).toMatchObject({
      'content-type': 'audio/mpeg',
      'content-length': String(MP3_BYTES.length),
      'cache-control': 'private, no-cache',
      vary: 'Authorization',
      etag: `"${UUID}"`,
      'x-content-type-options': 'nosniff',
    })
  })

  it('answers 304 when the ETag matches', async () => {
    seedRoomAndGame()
    theme(1)
    question(11, 1)

    const response = await read(11, { 'if-none-match': `"${UUID}"` })

    expect(response.statusCode).toBe(304)
  })

  it('refuses media outside a current game', async () => {
    seedRoomAndGame({ state: GAME_STATE_FINISHED })
    theme(1)
    question(11, 1)

    const response = await read(11)

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'game_not_found' })
  })

  it('answers 400 on an invalid id', async () => {
    seedRoomAndGame()

    expect((await read('abc')).statusCode).toBe(400)
  })

  it.each<[string, Record<string, unknown>]>([
    ['another company', { scope: THEME_SCOPE_COMPANY, company_id: 2 }],
    ['an inactive question', { status: QUESTION_STATUS_DRAFT }],
    ['a question without file', { media_key: null }],
    ['a non audio question', { type_media: QUESTION_MEDIA_TYPE_NONE }],
    ['an invalid storage key', { media_key: '../secret.mp3' }],
  ])('answers 404 for %s', async (_label, overrides) => {
    seedRoomAndGame()
    theme(1)
    question(11, 1, overrides)

    const response = await read(11)

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'question_media_not_found' })
  })

  it('answers 404 when the question belongs to no playable theme', async () => {
    seedRoomAndGame()
    theme(1, { status: THEME_STATUS_INACTIVE })
    question(11, 1)
    theme(2, { scope: THEME_SCOPE_COMPANY, company_id: 2 })
    question(12, 2)
    question(13, 1)
    dbState.question_themes = dbState.question_themes.filter((link) => link.question_id !== 13)

    for (const id of [11, 12, 13]) {
      const response = await read(id)

      expect(response.statusCode).toBe(404)
      expect(parseJson(response)).toEqual({ error: 'question_media_not_found' })
    }
  })

  it('answers 404 for an unknown question or a file missing from storage', async () => {
    seedRoomAndGame()
    theme(1)
    question(11, 1)
    files.clear()

    expect((await read(11)).statusCode).toBe(404)
    expect((await read(99)).statusCode).toBe(404)
  })
})
