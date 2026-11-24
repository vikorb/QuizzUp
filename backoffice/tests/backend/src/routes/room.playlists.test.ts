import './_helpers/registerRouteMocks'

import roomRoutes from '@backend/routes/room'
import { loadRoomContent } from '@backend/routes/room/_content'
import { ROOM_TRACKS_RATE_LIMIT_MAX } from '@backend/routes/room/_playlists'
import {
  ADMIN_ROLE_ROOM,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATUS_ACTIVE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_STATUS_ACTIVE,
  ROOM_CONTENT_MAX_IDS,
  ROOM_STATUS_ACTIVE,
  THEME_MODE_AUDIO,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
} from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState } from './_helpers/mockDb'
import {
  jsonResponse,
  PROVIDER_ERROR_NOT_FOUND,
  providerTrack,
  stubProviderFetch,
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

resetRouteMocksBeforeEach()

afterEach(() => {
  vi.unstubAllGlobals()
})

function playlistTheme(id: number, playlistRef: string, overrides: Record<string, unknown> = {}) {
  dbState.themes.push({
    id,
    name: `Playlist ${id}`,
    scope: THEME_SCOPE_GLOBAL,
    company_id: null,
    status: THEME_STATUS_ACTIVE,
    mode: THEME_MODE_AUDIO,
    kids_friendly: false,
    playlist_provider: 'deezer',
    playlist_ref: playlistRef,
    ...overrides,
  })
}

function gameRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    company_id: 1,
    room_id: 1,
    admin_id: 2,
    rounds_count: 10,
    questions_per_round: 4,
    seed: '42',
    state: GAME_STATE_PENDING,
    status: GAME_STATUS_ACTIVE,
    kids_mode: false,
    ...overrides,
  }
}

/** La partie courante de la salle 1 (remplace la précédente). */
function seedGame(overrides: Record<string, unknown> = {}) {
  dbState.games.length = 0
  dbState.games.push(gameRow(overrides))
}

/** `count` titres jouables dont les identifiants commencent à `first`. */
const titles = (first: number, count: number) =>
  Array.from({ length: count }, (_value, index) => providerTrack(first + index))

/** Faux fournisseur : corps de `GET /playlist/<ref>/tracks` par référence de playlist. */
function stubPlaylists(playlists: Record<string, unknown>) {
  return stubProviderFetch((url) => {
    const match = /^\/playlist\/(\d+)\/tracks$/.exec(url.pathname)
    const body = match ? playlists[match[1]] : undefined

    if (body instanceof Response) {
      return body
    }

    return jsonResponse(body === undefined ? PROVIDER_ERROR_NOT_FOUND : { data: body })
  })
}

const requestedPlaylists = (fetchMock: ReturnType<typeof stubPlaylists>) =>
  fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname.split('/')[2]).sort()

type ContentBody = {
  themes: {
    id: number
    questions: {
      id: number
      mediaUrl: string
      mediaCredit: { title: string }
      answers: { id: number; isCorrect: boolean }[]
    }[]
  }[]
}

type TracksBody = { items: { ref: string; mediaUrl: string; mediaCredit: { title: string } }[] }

async function get(url: string, user: TestUser = roomUser) {
  const app = await createRouteApp(roomRoutes)
  const response = await app.inject({ method: 'GET', url, headers: authHeaders(user) })

  await app.close()

  return response
}

const readContent = (query = '') => get(`/room/games/current/content${query}`)
/** `themeIds` : les thèmes de playlist à relire (par défaut les thèmes 1 et 2 des scénarios). */
const readTracks = (refs: string, themeIds = '1,2') =>
  get(`/room/games/current/tracks?refs=${refs}&themeIds=${themeIds}`)

/** Réponse du fournisseur dont la lecture lève une erreur qui n'est pas une indisponibilité. */
const brokenResponse = () =>
  ({
    get status(): number {
      throw new Error('boom')
    },
  }) as unknown as Response

const contentThemes = async (query = '') => parseJson<ContentBody>(await readContent(query)).themes

describe('routes/room.ts — content drawn from a playlist', () => {
  beforeEach(() => {
    dbState.rooms.push({ id: 1, company_id: 1, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE })
    seedGame()
  })

  it('draws questions_per_round titles of the playlist, with three decoys and the provider credit', async () => {
    playlistTheme(1, '900')
    stubPlaylists({ 900: titles(100, 12) })

    const response = await readContent()

    expect(response.statusCode).toBe(200)
    const { themes } = parseJson<ContentBody>(response)

    expect(themes).toHaveLength(1)
    expect(themes[0].id).toBe(1)
    expect(themes[0].questions).toHaveLength(4)
    expect(new Set(themes[0].questions.map((question) => question.id)).size).toBe(4)

    for (const question of themes[0].questions) {
      const ref = -question.id

      expect(ref).toBeGreaterThanOrEqual(100)
      expect(ref).toBeLessThan(112)
      expect(question.mediaUrl).toBe(`https://cdn.test/preview/${ref}.mp3?hdnea=exp=1`)
      expect(question.mediaCredit.title).toBe(`Titre ${ref}`)
      expect(question.answers).toHaveLength(4)
      expect(question.answers.filter((answer) => answer.isCorrect).map((a) => a.id)).toEqual([
        question.id,
      ])
    }
  })

  it('draws again each time: nothing is stored', async () => {
    playlistTheme(1, '900')
    const fetchMock = stubPlaylists({ 900: titles(100, 30) })

    await contentThemes()
    await contentThemes()

    expect(requestedPlaylists(fetchMock)).toEqual(['900', '900'])
  })

  it('makes a shorter round when the playlist has fewer playable titles than asked', async () => {
    playlistTheme(1, '900')
    stubPlaylists({
      900: [
        ...titles(100, 3),
        providerTrack(200, { preview: '' }),
        providerTrack(201, { readable: false }),
      ],
    })

    const [theme] = await contentThemes()

    expect(theme.questions).toHaveLength(3)
    // Les titres sans extrait ou non lisibles ne sont jamais posés, mais servent de leurres.
    expect(theme.questions.every((question) => -question.id < 200)).toBe(true)
    expect(theme.questions[0].answers).toHaveLength(4)
  })

  it('drops a playlist with fewer than two playable titles, the other themes stay', async () => {
    playlistTheme(1, '900')
    playlistTheme(2, '901')
    stubPlaylists({
      900: [providerTrack(100), providerTrack(101, { preview: '' })],
      901: titles(300, 5),
    })

    expect((await contentThemes()).map((theme) => theme.id)).toEqual([2])
  })

  it('lets a server defect through instead of dropping the playlist theme', async () => {
    playlistTheme(1, '900')
    stubProviderFetch(brokenResponse)

    await expect(loadRoomContent(1, { warn: vi.fn() })).rejects.toThrow('boom')
  })

  it('drops only an unknown playlist (404 or error 800), the others stay', async () => {
    playlistTheme(1, '900')
    playlistTheme(2, '901')
    playlistTheme(3, '902')
    stubPlaylists({ 901: titles(300, 5), 902: jsonResponse({}, 404) })

    expect((await contentThemes()).map((theme) => theme.id)).toEqual([2])
  })

  it('answers 200 with the stored questions when the provider is down or too slow', async () => {
    playlistTheme(1, '900')
    dbState.questions.push({
      id: 11,
      question: 'Question 11',
      scope: THEME_SCOPE_GLOBAL,
      company_id: null,
      status: QUESTION_STATUS_ACTIVE,
      type_media: QUESTION_MEDIA_TYPE_NONE,
    })
    dbState.question_themes.push({ question_id: 11, theme_id: 1 })

    stubPlaylists({ 900: jsonResponse({}, 503) })
    expect((await contentThemes())[0].questions.map((question) => question.id)).toEqual([11])

    vi.unstubAllGlobals()
    stubProviderFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    const warn = vi.fn()

    const themes = await loadRoomContent(1, { warn })

    expect(themes[0].questions.map((question) => question.id)).toEqual([11])
    expect(warn).toHaveBeenCalledWith(
      { dropped: 1, themeIds: [1] },
      'playlist themes dropped from the room content'
    )
  })

  it('adds the drawn titles to the stored questions of the same theme', async () => {
    playlistTheme(1, '900')
    dbState.questions.push({
      id: 11,
      question: 'Question 11',
      scope: THEME_SCOPE_GLOBAL,
      company_id: null,
      status: QUESTION_STATUS_ACTIVE,
      type_media: QUESTION_MEDIA_TYPE_NONE,
    })
    dbState.question_themes.push({ question_id: 11, theme_id: 1 })
    stubPlaylists({ 900: titles(100, 10) })

    const [theme] = await contentThemes()

    expect(theme.questions).toHaveLength(5)
    expect(theme.questions[0].id).toBe(11)
  })

  it('draws no new titles when resuming with ?ids=, and does not call the provider', async () => {
    playlistTheme(1, '900')
    const fetchMock = stubPlaylists({ 900: titles(100, 10) })

    expect(await contentThemes('?ids=11')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads at most six playlists per game', async () => {
    for (let id = 1; id <= 8; id += 1) {
      playlistTheme(id, String(900 + id))
    }

    const fetchMock = stubPlaylists(
      Object.fromEntries(Array.from({ length: 8 }, (_v, i) => [901 + i, titles(100 * (i + 1), 5)]))
    )

    const themes = await contentThemes()

    expect(themes).toHaveLength(6)
    expect(requestedPlaylists(fetchMock)).toHaveLength(6)
    expect(themes.map((theme) => theme.id)).toEqual(themes.map((theme) => theme.id).sort())
  })

  it('never reads the playlist of another company', async () => {
    playlistTheme(1, '900', { scope: THEME_SCOPE_COMPANY, company_id: 2 })
    playlistTheme(2, '901', { scope: THEME_SCOPE_COMPANY, company_id: 1 })
    const fetchMock = stubPlaylists({ 900: titles(100, 5), 901: titles(300, 5) })

    expect((await contentThemes()).map((theme) => theme.id)).toEqual([2])
    expect(requestedPlaylists(fetchMock)).toEqual(['901'])
  })

  it('ignores an inactive theme', async () => {
    playlistTheme(1, '900', { status: 0 })
    const fetchMock = stubPlaylists({ 900: titles(100, 5) })

    expect(await contentThemes()).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('in kids mode, never reads nor sends the playlist of a theme not allowed to children', async () => {
    seedGame({ kids_mode: true })
    playlistTheme(1, '900')
    playlistTheme(2, '901', { kids_friendly: true })
    const fetchMock = stubPlaylists({ 900: titles(100, 5), 901: titles(300, 5) })

    const themes = await contentThemes()

    expect(themes.map((theme) => theme.id)).toEqual([2])
    expect(themes[0].questions.every((question) => -question.id >= 300)).toBe(true)
    expect(requestedPlaylists(fetchMock)).toEqual(['901'])
  })

  it('outside kids mode, sends the playlists of every readable theme', async () => {
    playlistTheme(1, '900')
    playlistTheme(2, '901', { kids_friendly: true })
    stubPlaylists({ 900: titles(100, 5), 901: titles(300, 5) })

    expect((await contentThemes()).map((theme) => theme.id)).toEqual([1, 2])
  })
})

describe('routes/room.ts — tracks of the current game', () => {
  beforeEach(() => {
    dbState.rooms.push({ id: 1, company_id: 1, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE })
    seedGame()
  })

  it('returns a fresh preview link and the credit of the asked titles, in the asked order', async () => {
    playlistTheme(1, '900')
    stubPlaylists({ 900: [...titles(100, 5), providerTrack(200, { preview: '' })] })

    const response = await readTracks('103,101,200,999')

    expect(response.statusCode).toBe(200)
    expect(parseJson<TracksBody>(response)).toEqual({
      items: [
        {
          ref: '103',
          mediaUrl: 'https://cdn.test/preview/103.mp3?hdnea=exp=1',
          mediaCredit: {
            provider: 'deezer',
            title: 'Titre 103',
            artist: 'Artiste 103',
            coverUrl: 'https://cdn.test/cover/103.jpg',
            link: 'https://www.deezer.com/track/103',
          },
        },
        {
          ref: '101',
          mediaUrl: 'https://cdn.test/preview/101.mp3?hdnea=exp=1',
          mediaCredit: {
            provider: 'deezer',
            title: 'Titre 101',
            artist: 'Artiste 101',
            coverUrl: 'https://cdn.test/cover/101.jpg',
            link: 'https://www.deezer.com/track/101',
          },
        },
      ],
    })
  })

  it('finds a title in the running game too, and deduplicates the refs', async () => {
    seedGame({ state: GAME_STATE_RUNNING })
    playlistTheme(1, '900')
    stubPlaylists({ 900: titles(100, 5) })

    const { items } = parseJson<TracksBody>(await readTracks('101,101'))

    expect(items.map((item) => item.ref)).toEqual(['101'])
  })

  it('does not serve a title of the playlist of another company', async () => {
    playlistTheme(1, '900', { scope: THEME_SCOPE_COMPANY, company_id: 2 })
    const fetchMock = stubPlaylists({ 900: titles(100, 5) })

    const response = await readTracks('101')

    expect(response.statusCode).toBe(200)
    expect(parseJson<TracksBody>(response).items).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not serve a title that belongs to no playlist of a readable theme', async () => {
    playlistTheme(1, '900')
    stubPlaylists({ 900: titles(100, 5), 901: titles(300, 5) })

    expect(parseJson<TracksBody>(await readTracks('300')).items).toEqual([])
  })

  it('in kids mode, serves no title of a playlist not allowed to children', async () => {
    playlistTheme(1, '900')
    playlistTheme(2, '901', { kids_friendly: true })
    const fetchMock = stubPlaylists({ 900: titles(100, 5), 901: titles(300, 5) })

    const adult = parseJson<TracksBody>(await readTracks('101,301'))

    expect(adult.items.map((item) => item.ref)).toEqual(['101', '301'])

    seedGame({ kids_mode: true })
    fetchMock.mockClear()

    const kids = parseJson<TracksBody>(await readTracks('101,301'))

    expect(kids.items.map((item) => item.ref)).toEqual(['301'])
    expect(requestedPlaylists(fetchMock)).toEqual(['901'])
  })

  it('answers 502 when the provider is down or too slow and a title is missing', async () => {
    playlistTheme(1, '900')
    stubPlaylists({ 900: jsonResponse({}, 503) })

    const down = await readTracks('101')

    expect(down.statusCode).toBe(502)
    expect(parseJson(down)).toEqual({ error: 'media_provider_unavailable' })

    vi.unstubAllGlobals()
    stubProviderFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })

    expect((await readTracks('101')).statusCode).toBe(502)
  })

  it('keeps the titles it found when another playlist is down', async () => {
    playlistTheme(1, '900')
    playlistTheme(2, '901')
    stubPlaylists({ 900: titles(100, 5), 901: jsonResponse({}, 503) })

    const response = await readTracks('101')

    expect(response.statusCode).toBe(200)
    expect(parseJson<TracksBody>(response).items.map((item) => item.ref)).toEqual(['101'])
  })

  it('answers 404 without a pending or running game', async () => {
    seedGame({ state: GAME_STATE_FINISHED })
    playlistTheme(1, '900')
    const fetchMock = stubPlaylists({ 900: titles(100, 5) })

    const response = await readTracks('101')

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'game_not_found' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 404 when the game is in another room or another company', async () => {
    seedGame({ room_id: 2 })
    dbState.games.push(gameRow({ id: 6, company_id: 2 }))
    playlistTheme(1, '900')
    const fetchMock = stubPlaylists({ 900: titles(100, 5) })

    expect((await readTracks('101')).statusCode).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 400 on missing, empty, too many or non numeric themeIds, without calling the provider', async () => {
    const fetchMock = stubPlaylists({})

    for (const themeIds of ['', '1,,2', '1,2,3,4,5,6,7', 'a', '0', '-1', '1.5']) {
      expect((await readTracks('101', themeIds)).statusCode, themeIds).toBe(400)
    }

    expect((await get('/room/games/current/tracks?refs=101')).statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts six themeIds and deduplicates them', async () => {
    for (let id = 1; id <= 6; id += 1) {
      playlistTheme(id, String(900 + id))
    }

    const fetchMock = stubPlaylists(
      Object.fromEntries(Array.from({ length: 6 }, (_v, i) => [901 + i, titles(100 * (i + 1), 5)]))
    )

    const response = await readTracks('101,601', '1,2,3,4,5,6')

    expect(response.statusCode).toBe(200)
    expect(parseJson<TracksBody>(response).items.map((item) => item.ref)).toEqual(['101', '601'])
    expect(requestedPlaylists(fetchMock)).toHaveLength(6)

    fetchMock.mockClear()
    await readTracks('101', '1,1,1')
    expect(requestedPlaylists(fetchMock)).toEqual(['901'])
  })

  it('reads one playlist per allowed theme asked for, nothing for the others', async () => {
    playlistTheme(1, '900')
    playlistTheme(2, '901', { scope: THEME_SCOPE_COMPANY, company_id: 2 })
    playlistTheme(3, '902')
    playlistTheme(4, '903')
    const fetchMock = stubPlaylists({
      900: titles(100, 3),
      901: titles(200, 3),
      902: titles(300, 3),
      903: titles(400, 3),
    })

    const response = await readTracks('101,201,301,401', '1,2,3,99')

    // Le thème 2 (autre compagnie) et 99 (inconnu) sont ignorés ; le thème 4 n'est pas demandé.
    expect(parseJson<TracksBody>(response).items.map((item) => item.ref)).toEqual(['101', '301'])
    expect(requestedPlaylists(fetchMock)).toEqual(['900', '902'])
  })

  it('serves no title of an inactive or deleted theme', async () => {
    playlistTheme(1, '900', { status: 0 })
    playlistTheme(2, '901', { status: 2, deleted_at: new Date().toISOString() })
    const fetchMock = stubPlaylists({ 900: titles(100, 3), 901: titles(200, 3) })

    const response = await readTracks('101,201')

    expect(response.statusCode).toBe(200)
    expect(parseJson<TracksBody>(response).items).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 429 after 6 calls a minute per room, with Retry-After', async () => {
    playlistTheme(1, '900')
    stubPlaylists({ 900: titles(100, 3) })
    const app = await createRouteApp(roomRoutes)
    const call = () =>
      app.inject({
        method: 'GET',
        url: '/room/games/current/tracks?refs=101&themeIds=1',
        headers: authHeaders(roomUser),
      })

    for (let attempt = 0; attempt < ROOM_TRACKS_RATE_LIMIT_MAX; attempt += 1) {
      expect((await call()).statusCode).toBe(200)
    }

    const refused = await call()

    expect(refused.statusCode).toBe(429)
    expect(parseJson(refused)).toEqual({ error: 'too_many_requests' })
    expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1)

    await app.close()
  })

  it('does not hide a server defect as a provider outage', async () => {
    playlistTheme(1, '900')
    stubProviderFetch(brokenResponse)

    expect((await readTracks('101')).statusCode).toBe(500)
  })

  it('answers 400 on missing, malformed or too many refs', async () => {
    const tooMany = Array.from({ length: ROOM_CONTENT_MAX_IDS + 1 }, (_v, i) => i + 1).join(',')
    const fetchMock = stubPlaylists({})

    for (const refs of ['', '1,,2', 'abc', '-5', '1.5', '123456789012345678901', tooMany]) {
      expect((await readTracks(refs)).statusCode, refs).toBe(400)
    }

    expect((await get('/room/games/current/tracks')).statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts exactly the maximum number of refs', async () => {
    playlistTheme(1, '900')
    stubPlaylists({ 900: titles(1, 5) })
    const refs = Array.from({ length: ROOM_CONTENT_MAX_IDS }, (_v, i) => i + 1).join(',')

    expect((await readTracks(refs)).statusCode).toBe(200)
  })

  it('is reserved to room accounts', async () => {
    const response = await get('/room/games/current/tracks?refs=1', companyAdminUser)

    expect(response.statusCode).toBe(403)
  })
})
