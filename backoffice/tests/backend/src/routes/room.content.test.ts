import './_helpers/registerRouteMocks'

import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ADMIN_ROLE_ROOM,
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATUS_ACTIVE,
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
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
import { loadRoomContent } from '@backend/routes/room/_content'
import { type MediaStorage, setMediaStorage } from '@backend/storage/mediaStorage'
import { dbState } from './_helpers/mockDb'
import {
  jsonResponse,
  PROVIDER_ERROR_NOT_FOUND,
  providerTrack,
  stubProviderFetch,
  stubProviderTracks,
} from './_helpers/mockMediaProvider'
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
  vi.unstubAllGlobals()
})

type ContentBody = {
  themes: {
    id: number
    name: string
    questions: {
      id: number
      mediaUrl: string | null
      mediaStartMs: number
      mediaCredit: Record<string, unknown> | null
      answers: unknown[]
    }[]
  }[]
}

describe('routes/room.ts — content of the current game', () => {
  it('keeps active questions of every type, audio only with a file, readable by the company', async () => {
    seedRoomAndGame()
    theme(1)
    question(11, 1)
    question(12, 1, { media_key: null }) // audio sans fichier : écartée
    question(13, 1, {
      type_media: QUESTION_MEDIA_TYPE_NONE,
      media_key: null,
      kind: QUESTION_KIND_TRUE_FALSE,
    })
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
      kind: QUESTION_KIND_QCM,
      mediaType: QUESTION_MEDIA_TYPE_AUDIO,
      mediaUrl: '/room/questions/11/media',
      mediaStartMs: 1500,
      mediaCredit: null,
      answers: [
        { id: 110, text: 'Bonne', isCorrect: true },
        { id: 111, text: 'Fausse', isCorrect: false },
      ],
    })
    expect(body.themes[0].questions[1]).toMatchObject({
      kind: QUESTION_KIND_TRUE_FALSE,
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

describe('routes/room.ts — content with provider extracts', () => {
  /** Question audio dont l'extrait vient du fournisseur (aucun fichier). */
  function providerQuestion(id: number, ref: string, overrides: Record<string, unknown> = {}) {
    question(id, 1, {
      media_key: null,
      media_provider: 'deezer',
      media_provider_ref: ref,
      media_start_ms: 4000,
      ...overrides,
    })
  }

  async function readContent(query = '') {
    const app = await createRouteApp(roomRoutes)
    const response = await app.inject({
      method: 'GET',
      url: `/room/games/current/content${query}`,
      headers: authHeaders(roomUser),
    })

    await app.close()

    return response
  }

  it('plays a provider question with a fresh preview link and its credit, other questions have none', async () => {
    seedRoomAndGame()
    theme(1)
    question(11, 1)
    providerQuestion(12, '3135556')
    question(13, 1, { type_media: QUESTION_MEDIA_TYPE_NONE, media_key: null })
    const fetchMock = stubProviderTracks({ 3135556: providerTrack(3135556) })

    const response = await readContent()

    expect(response.statusCode).toBe(200)
    const [file, provider, none] = parseJson<ContentBody>(response).themes[0].questions
    expect(provider).toEqual({
      id: 12,
      text: 'Extrait 12',
      kind: QUESTION_KIND_QCM,
      mediaType: QUESTION_MEDIA_TYPE_AUDIO,
      mediaUrl: 'https://cdn.test/preview/3135556.mp3?hdnea=exp=1',
      mediaStartMs: 4000,
      mediaCredit: {
        provider: 'deezer',
        title: 'Titre 3135556',
        artist: 'Artiste 3135556',
        coverUrl: 'https://cdn.test/cover/3135556.jpg',
        link: 'https://www.deezer.com/track/3135556',
      },
      answers: [
        { id: 120, text: 'Bonne', isCorrect: true },
        { id: 121, text: 'Fausse', isCorrect: false },
      ],
    })
    expect(file).toMatchObject({ mediaUrl: '/room/questions/11/media', mediaCredit: null })
    expect(none).toMatchObject({ mediaUrl: null, mediaCredit: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('takes the link from the provider each time: nothing is stored or cached', async () => {
    seedRoomAndGame()
    theme(1)
    providerQuestion(12, '3135556')
    stubProviderTracks({ 3135556: providerTrack(3135556, { preview: 'https://cdn.test/a.mp3' }) })
    const first = parseJson<ContentBody>(await readContent())

    const fetchMock = stubProviderTracks({
      3135556: providerTrack(3135556, { preview: 'https://cdn.test/b.mp3' }),
    })
    const second = parseJson<ContentBody>(await readContent())

    expect(first.themes[0].questions[0].mediaUrl).toBe('https://cdn.test/a.mp3')
    expect(second.themes[0].questions[0].mediaUrl).toBe('https://cdn.test/b.mp3')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(dbState.questions)).not.toContain('cdn.test')
  })

  it('asks the provider once per title, whatever the number of questions that use it', async () => {
    seedRoomAndGame()
    theme(1)
    providerQuestion(12, '3135556')
    providerQuestion(13, '3135556')
    providerQuestion(14, '42')
    theme(2)
    question(21, 2, { media_key: null, media_provider: 'deezer', media_provider_ref: '42' })
    const fetchMock = stubProviderTracks({
      3135556: providerTrack(3135556),
      42: providerTrack(42),
    })

    const body = parseJson<ContentBody>(await readContent())

    expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual([
      'https://api.deezer.com/track/3135556',
      'https://api.deezer.com/track/42',
    ])
    expect(body.themes[0].questions.map((item) => item.id)).toEqual([12, 13, 14])
    expect(body.themes[1].questions.map((item) => item.id)).toEqual([21])
    expect(body.themes[1].questions[0].mediaCredit).toMatchObject({ title: 'Titre 42' })
  })

  it('never has more than 5 requests in flight', async () => {
    seedRoomAndGame()
    theme(1)

    for (let ref = 100; ref < 112; ref += 1) {
      providerQuestion(ref, String(ref))
    }

    let inFlight = 0
    let maxInFlight = 0

    stubProviderFetch(async (url) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      // Les cinq premiers appels démarrent avant qu'aucun ne rende la main.
      await Promise.resolve()
      inFlight -= 1

      return jsonResponse(providerTrack(Number(url.pathname.split('/').pop())))
    })

    const body = parseJson<ContentBody>(await readContent())

    expect(body.themes[0].questions).toHaveLength(12)
    expect(maxInFlight).toBe(5)
  })

  it('drops the question and logs one warning when the provider is unavailable, the answer stays 200', async () => {
    seedRoomAndGame()
    theme(1)
    question(11, 1)
    providerQuestion(12, '3135556')
    stubProviderFetch(() => jsonResponse({}, 503))
    const warn = vi.fn()

    const themes = await loadRoomContent(1, { warn })

    expect(themes[0].questions.map((item) => item.id)).toEqual([11])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toEqual({ company_id: 1, dropped: 1, refs: ['3135556'] })

    const response = await readContent()

    expect(response.statusCode).toBe(200)
    expect(parseJson<ContentBody>(response).themes[0].questions.map((item) => item.id)).toEqual([
      11,
    ])
  })

  it('stops calling the provider after the first outage, calls already in flight may end', async () => {
    seedRoomAndGame()
    theme(1)
    question(11, 1)

    for (let ref = 100; ref < 112; ref += 1) {
      providerQuestion(ref, String(ref))
    }

    const fetchMock = stubProviderFetch(() => jsonResponse({}, 503))
    const warn = vi.fn()

    const themes = await loadRoomContent(1, { warn })

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(themes[0].questions.map((item) => item.id)).toEqual([11])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toMatchObject({ company_id: 1, dropped: 12 })
    expect(warn.mock.calls[0][0].refs).toHaveLength(12)
  })

  it('bounds the references of the warning to 20', async () => {
    seedRoomAndGame()
    theme(1)

    for (let ref = 100; ref < 125; ref += 1) {
      providerQuestion(ref, String(ref))
    }

    stubProviderFetch(() => jsonResponse({}, 503))
    const warn = vi.fn()

    await loadRoomContent(1, { warn })

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0].dropped).toBe(25)
    expect(warn.mock.calls[0][0].refs).toHaveLength(20)
  })

  it('does not take an unknown title for an outage: the other titles are still resolved', async () => {
    seedRoomAndGame()
    theme(1)

    for (let ref = 1; ref <= 8; ref += 1) {
      providerQuestion(ref, String(ref))
    }

    const fetchMock = stubProviderTracks({
      1: PROVIDER_ERROR_NOT_FOUND,
      2: providerTrack(2, { preview: '' }),
      3: providerTrack(3),
      4: providerTrack(4),
      5: providerTrack(5),
      6: providerTrack(6),
      7: providerTrack(7),
      8: providerTrack(8),
    })
    const warn = vi.fn()

    const themes = await loadRoomContent(1, { warn })

    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(themes[0].questions.map((item) => item.id)).toEqual([3, 4, 5, 6, 7, 8])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toEqual({ company_id: 1, dropped: 2, refs: ['1', '2'] })
  })

  it('does not warn when every question is playable', async () => {
    seedRoomAndGame()
    theme(1)
    providerQuestion(12, '3135556')
    stubProviderTracks({ 3135556: providerTrack(3135556) })
    const warn = vi.fn()

    await loadRoomContent(1, { warn })

    expect(warn).not.toHaveBeenCalled()
  })

  it('drops only the failing title: the other provider questions stay playable', async () => {
    seedRoomAndGame()
    theme(1)
    providerQuestion(12, '1')
    providerQuestion(13, '2')
    stubProviderFetch((url) =>
      url.pathname.endsWith('/1')
        ? new Response('<html>', { status: 200 })
        : jsonResponse(providerTrack(2))
    )

    const body = parseJson<ContentBody>(await readContent())

    expect(body.themes[0].questions.map((item) => item.id)).toEqual([13])
  })

  describe('with the ids filter', () => {
    it('resolves and returns only the asked questions', async () => {
      seedRoomAndGame()
      theme(1)
      question(11, 1)
      providerQuestion(12, '12')
      providerQuestion(13, '13')
      theme(2)
      question(14, 2, { media_key: null, media_provider: 'deezer', media_provider_ref: '14' })
      const fetchMock = stubProviderTracks({
        12: providerTrack(12),
        13: providerTrack(13),
        14: providerTrack(14),
      })

      const response = await readContent('?ids=12,14')

      expect(response.statusCode).toBe(200)
      const body = parseJson<ContentBody>(response)
      expect(body.themes.map((item) => item.id)).toEqual([1, 2])
      expect(body.themes[0].questions.map((item) => item.id)).toEqual([12])
      expect(body.themes[1].questions.map((item) => item.id)).toEqual([14])
      expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual([
        'https://api.deezer.com/track/12',
        'https://api.deezer.com/track/14',
      ])
    })

    it('does not return nor resolve a question of another company', async () => {
      seedRoomAndGame()
      theme(1)
      providerQuestion(12, '12')
      providerQuestion(13, '13', { scope: THEME_SCOPE_COMPANY, company_id: 2 })
      const fetchMock = stubProviderTracks({ 12: providerTrack(12), 13: providerTrack(13) })

      const body = parseJson<ContentBody>(await readContent('?ids=12,13,999'))

      expect(body.themes[0].questions.map((item) => item.id)).toEqual([12])
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('returns no theme when no asked question is playable', async () => {
      seedRoomAndGame()
      theme(1)
      providerQuestion(12, '12')
      const fetchMock = stubProviderTracks({ 12: providerTrack(12) })

      const response = await readContent('?ids=999')

      expect(parseJson<ContentBody>(response).themes).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('keeps the whole catalogue without the parameter', async () => {
      seedRoomAndGame()
      theme(1)
      question(11, 1)
      providerQuestion(12, '12')
      stubProviderTracks({ 12: providerTrack(12) })

      const body = parseJson<ContentBody>(await readContent())

      expect(body.themes[0].questions.map((item) => item.id)).toEqual([11, 12])
    })

    it.each([
      ['an empty value', '?ids='],
      ['a non numeric id', '?ids=1,abc'],
      ['a decimal id', '?ids=1.5'],
      ['a zero id', '?ids=0'],
      ['a negative id', '?ids=-3'],
      ['an empty item', '?ids=1,,2'],
      ['an id beyond the safe integers', '?ids=99999999999999999999'],
      ['a repeated parameter', '?ids=1&ids=2'],
      ['more than 200 ids', `?ids=${Array.from({ length: 201 }, (_, i) => i + 1).join(',')}`],
    ])('answers 400 for %s', async (_label, query) => {
      seedRoomAndGame()
      theme(1)

      const response = await readContent(query)

      expect(response.statusCode).toBe(400)
      expect(parseJson<{ error: string }>(response).error).toBe('invalid_query')
    })

    it('accepts exactly 200 ids', async () => {
      seedRoomAndGame()
      theme(1)

      const response = await readContent(
        `?ids=${Array.from({ length: 200 }, (_, i) => i + 1).join(',')}`
      )

      expect(response.statusCode).toBe(200)
    })
  })

  it('removes a theme whose provider questions are all unavailable', async () => {
    seedRoomAndGame()
    theme(1)
    providerQuestion(12, '1')
    stubProviderFetch(() => jsonResponse({}, 500))

    const body = parseJson<ContentBody>(await readContent())

    expect(body.themes).toEqual([])
  })

  it('does not call the provider for a provider question of another company', async () => {
    seedRoomAndGame()
    theme(1)
    providerQuestion(12, '1', { scope: THEME_SCOPE_COMPANY, company_id: 2 })
    const fetchMock = stubProviderTracks({ 1: providerTrack(1) })

    await readContent()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not serve the provider question through the file route', async () => {
    seedRoomAndGame()
    theme(1)
    providerQuestion(12, '1')

    const app = await createRouteApp(roomRoutes)
    const response = await app.inject({
      method: 'GET',
      url: '/room/questions/12/media',
      headers: authHeaders(roomUser),
    })

    await app.close()

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'question_media_not_found' })
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
