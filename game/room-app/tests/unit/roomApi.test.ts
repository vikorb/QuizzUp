import {
  fetchCurrentContent,
  fetchCurrentGame,
  fetchRoomInfo,
  FINISH_REQUEST_TIMEOUT_MS,
  finishRoomGame,
  postRoomLogs,
  resolveMediaUrl,
  RoomApiError,
  saveRoomConfig,
  startRoomGame,
} from '@/utils/roomApi'

const API = 'http://localhost:3001'

function respond(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

describe('API de la salle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('complète les chemins de médias relatifs', () => {
    expect(resolveMediaUrl('/room/questions/3/media')).toBe(`${API}/room/questions/3/media`)
    expect(resolveMediaUrl('https://cdn/x.png')).toBe('https://cdn/x.png')
    expect(resolveMediaUrl(null)).toBeNull()
  })

  it('lit la partie, son contenu et la salle avec le jeton', async () => {
    const fetchMock = respond(200, { game: null })
    await expect(fetchCurrentGame('tok')).resolves.toBeNull()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${API}/room/games/current`)
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok')

    respond(200, {
      themes: [{ id: 1, name: 'T', questions: [{ id: 3, mediaUrl: '/room/questions/3/media' }] }],
    })
    const themes = await fetchCurrentContent('tok')
    expect(themes[0]?.questions[0]?.mediaUrl).toBe(`${API}/room/questions/3/media`)

    respond(200, { room: { id: 1, name: 'Salle', config: {} } })
    await expect(fetchRoomInfo('tok')).resolves.toMatchObject({ name: 'Salle' })
  })

  it('limite le contenu aux questions demandées, avec un délai facultatif', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ themes: [] })))

    await fetchCurrentContent('tok')
    await fetchCurrentContent('tok', { ids: [3, 14, 15], timeoutMs: 5000 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API}/room/games/current/content`)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API}/room/games/current/content?ids=3,14,15`)
    expect(timeout).toHaveBeenCalledOnce()
    expect(timeout).toHaveBeenCalledWith(5000)
  })

  it('laisse une URL d’extrait absolue telle quelle et garde le crédit s’il existe', async () => {
    const deezer = 'https://cdnt-preview.dzcdn.net/api/1/1/a/12.mp3?hdnea=exp=1~hmac=abc'
    const mediaCredit = {
      provider: 'deezer',
      title: 'Titre',
      artist: 'Artiste',
      coverUrl: null,
      link: 'https://www.deezer.com/track/12',
    }
    respond(200, {
      themes: [
        {
          id: 1,
          name: 'T',
          questions: [
            { id: 3, mediaUrl: deezer, mediaCredit },
            { id: 4, mediaUrl: '/room/questions/4/media' },
          ],
        },
      ],
    })

    const [credited, imported] = (await fetchCurrentContent('tok'))[0]?.questions ?? []

    expect(credited?.mediaUrl).toBe(deezer)
    expect(credited?.mediaCredit).toEqual(mediaCredit)
    expect(imported?.mediaUrl).toBe(`${API}/room/questions/4/media`)
    expect(imported?.mediaCredit).toBeUndefined()
  })

  it('démarre la partie et enregistre la config', async () => {
    const fetchMock = respond(200, { game: { id: 4 } })
    await startRoomGame('tok', 4)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API}/room/games/4/start`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')

    const save = respond(200, { room: { id: 1, name: 'Salle', config: { version: 1 } } })
    await saveRoomConfig('tok', { version: 1 })
    expect(save.mock.calls.at(-1)?.[1]?.method).toBe('PUT')
    expect(save.mock.calls.at(-1)?.[1]?.body).toBe(JSON.stringify({ config: { version: 1 } }))
  })

  it('envoie la fin de partie avec les scores', async () => {
    const fetchMock = respond(200, { game: { id: 4, state: 'finished' } })
    const game = await finishRoomGame('tok', 4, [{ podium: 1, score: 300 }])

    expect(game).toMatchObject({ state: 'finished' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API}/room/games/4/finish`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ scores: [{ podium: 1, score: 300 }] })
    )
  })

  it('abandonne l’envoi de fin de partie après 10 s, sans délai pour les autres appels', async () => {
    expect(FINISH_REQUEST_TIMEOUT_MS).toBe(10_000)
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ game: {}, room: {} })))

    await finishRoomGame('tok', 4, [])
    await fetchRoomInfo('tok')

    expect(timeout).toHaveBeenCalledOnce()
    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBeUndefined()
  })

  it('rejette l’envoi de fin de partie quand le délai est dépassé', async () => {
    const abort = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(abort.signal)
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })
    )

    const sending = finishRoomGame('tok', 4, [])
    abort.abort(new DOMException('signal timed out', 'TimeoutError'))

    await expect(sending).rejects.toMatchObject({ name: 'TimeoutError' })
    await expect(sending).rejects.not.toBeInstanceOf(RoomApiError)
  })

  it('envoie les journaux d’erreurs (204 sans corps) et traduit un refus', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const entries = [
      {
        level: 'error' as const,
        code: 'vue_error',
        message: 'boom',
        occurredAt: '2026-11-23T10:00:00.000Z',
      },
    ]

    await expect(postRoomLogs('tok', '1.2.3', entries)).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${API}/room/logs`)
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok')
    expect(init?.body).toBe(JSON.stringify({ appVersion: '1.2.3', entries }))

    respond(429, { error: 'too_many_requests' })
    await expect(postRoomLogs('tok', '1.2.3', entries)).rejects.toMatchObject({
      status: 429,
      code: 'too_many_requests',
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }))
    await expect(postRoomLogs('tok', '1.2.3', entries)).rejects.toMatchObject({
      status: 500,
      code: 'server_error',
    })
  })

  it('traduit les erreurs du backoffice', async () => {
    respond(404, { error: 'game_not_found' })
    await expect(fetchCurrentContent('tok')).rejects.toMatchObject({
      status: 404,
      code: 'game_not_found',
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }))
    await expect(fetchCurrentGame('tok')).rejects.toBeInstanceOf(RoomApiError)
  })
})
