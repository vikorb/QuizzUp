import {
  getProviderPlaylistTracks,
  getProviderTrack,
  MediaProviderUnavailableError,
  searchProviderTracks,
} from '@backend/services/mediaProvider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  jsonResponse,
  PROVIDER_ERROR_NOT_FOUND,
  providerTrack,
  stubProviderFetch,
  stubProviderTracks,
} from '../routes/_helpers/mockMediaProvider'

const previousBaseUrl = process.env.DEEZER_API_BASE_URL

beforeEach(() => {
  delete process.env.DEEZER_API_BASE_URL
})

afterEach(() => {
  vi.unstubAllGlobals()

  if (previousBaseUrl === undefined) {
    delete process.env.DEEZER_API_BASE_URL
  } else {
    process.env.DEEZER_API_BASE_URL = previousBaseUrl
  }
})

describe('services/mediaProvider — getProviderTrack', () => {
  it('returns the normalized track with a timeout signal', async () => {
    const fetchMock = stubProviderTracks({ 3135556: providerTrack(3135556) })

    const track = await getProviderTrack('3135556')

    expect(track).toEqual({
      provider: 'deezer',
      ref: '3135556',
      title: 'Titre 3135556',
      artist: 'Artiste 3135556',
      album: 'Album 3135556',
      coverUrl: 'https://cdn.test/cover/3135556.jpg',
      previewUrl: 'https://cdn.test/preview/3135556.mp3?hdnea=exp=1',
      link: 'https://www.deezer.com/track/3135556',
    })
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.deezer.com/track/3135556')
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('reads the API address from DEEZER_API_BASE_URL, without a trailing slash', async () => {
    process.env.DEEZER_API_BASE_URL = 'http://provider.test:9000/api/'
    const fetchMock = stubProviderTracks({ 7: providerTrack(7) })

    await getProviderTrack('7')

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://provider.test:9000/api/track/7')
  })

  it('returns null for an unknown title (200 with a DataException body)', async () => {
    stubProviderFetch(() => jsonResponse(PROVIDER_ERROR_NOT_FOUND))

    expect(await getProviderTrack('999')).toBeNull()
  })

  it('returns null for an HTTP 404', async () => {
    stubProviderFetch(() => jsonResponse({}, 404))

    expect(await getProviderTrack('999')).toBeNull()
  })

  it.each([
    ['empty', { preview: '' }],
    ['missing', { preview: undefined }],
    ['not https', { preview: 'http://x.test/a.mp3' }],
  ])('has no preview url when the preview is %s', async (_label, overrides) => {
    stubProviderTracks({ 5: providerTrack(5, overrides) })

    const track = await getProviderTrack('5')

    expect(track).not.toBeNull()
    expect(track?.previewUrl).toBeNull()
  })

  it('drops a cover or a link that is not an https url', async () => {
    stubProviderTracks({
      5: providerTrack(5, {
        link: 'javascript:alert(1)',
        album: { title: 'A', cover_medium: 'not a url' },
      }),
    })

    const track = await getProviderTrack('5')

    expect(track?.link).toBeNull()
    expect(track?.coverUrl).toBeNull()
  })

  it.each(['', 'abc', '12a', '12/../x', '1.5', '-3', '1'.repeat(21), '12 34'])(
    'refuses the ref %j without calling the provider',
    async (ref) => {
      const fetchMock = stubProviderTracks({})

      expect(await getProviderTrack(ref)).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('accepts a 20 digit ref', async () => {
    const fetchMock = stubProviderTracks({})

    await getProviderTrack('1'.repeat(20))

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reports the provider as unavailable on a timeout or a network error', async () => {
    stubProviderFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    await expect(getProviderTrack('1')).rejects.toBeInstanceOf(MediaProviderUnavailableError)

    stubProviderFetch(() => {
      throw new TypeError('fetch failed')
    })
    await expect(getProviderTrack('1')).rejects.toBeInstanceOf(MediaProviderUnavailableError)
  })

  it.each([500, 502, 503, 429, 403])(
    'reports the provider as unavailable on HTTP %i',
    async (status) => {
      stubProviderFetch(() => jsonResponse({}, status))

      await expect(getProviderTrack('1')).rejects.toBeInstanceOf(MediaProviderUnavailableError)
    }
  )

  it('reports the provider as unavailable on invalid JSON', async () => {
    stubProviderFetch(() => new Response('<html>oops</html>', { status: 200 }))

    await expect(getProviderTrack('1')).rejects.toBeInstanceOf(MediaProviderUnavailableError)
  })

  it('reports the provider as unavailable on a body that is not a track', async () => {
    stubProviderFetch(() => jsonResponse({ id: 1, title: 'sans artiste' }))

    await expect(getProviderTrack('1')).rejects.toBeInstanceOf(MediaProviderUnavailableError)
  })

  it('does not take a quota error for an unknown title', async () => {
    stubProviderFetch(() =>
      jsonResponse({ error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } })
    )

    await expect(getProviderTrack('1')).rejects.toBeInstanceOf(MediaProviderUnavailableError)
  })
})

describe('services/mediaProvider — searchProviderTracks', () => {
  it('sends the encoded query and the limit, and normalizes every result', async () => {
    const fetchMock = stubProviderFetch(() =>
      jsonResponse({
        data: [providerTrack(1), providerTrack(2, { preview: '' })],
        total: 2,
      })
    )

    const tracks = await searchProviderTracks('daft punk & co', 7)

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.origin + url.pathname).toBe('https://api.deezer.com/search/track')
    expect(url.searchParams.get('q')).toBe('daft punk & co')
    expect(url.searchParams.get('limit')).toBe('7')
    expect(tracks.map((track) => [track.ref, track.previewUrl === null])).toEqual([
      ['1', false],
      ['2', true],
    ])
  })

  it('drops a malformed result and keeps the others', async () => {
    stubProviderFetch(() =>
      jsonResponse({
        data: [
          providerTrack(1),
          { id: 'x', title: 'Sans identifiant numérique' },
          providerTrack(3, { artist: null }),
          null,
          providerTrack(5),
        ],
      })
    )

    const tracks = await searchProviderTracks('abc', 10)

    expect(tracks.map((track) => track.ref)).toEqual(['1', '5'])
  })

  it('reports the provider as unavailable when the envelope is unreadable', async () => {
    stubProviderFetch(() => jsonResponse({ data: 'nope' }))

    await expect(searchProviderTracks('abc', 10)).rejects.toBeInstanceOf(
      MediaProviderUnavailableError
    )
  })

  it('returns an empty list when nothing matches', async () => {
    stubProviderFetch(() => jsonResponse({ data: [], total: 0 }))

    expect(await searchProviderTracks('zzzz', 10)).toEqual([])
  })

  it.each<[string, () => Response]>([
    [
      'a timeout',
      () => {
        throw new DOMException('timeout', 'TimeoutError')
      },
    ],
    ['HTTP 500', () => jsonResponse({}, 500)],
    ['invalid JSON', () => new Response('nope', { status: 200 })],
    ['an error body', () => jsonResponse(PROVIDER_ERROR_NOT_FOUND)],
  ])('reports the provider as unavailable on %s', async (_label, answer) => {
    stubProviderFetch(answer)

    await expect(searchProviderTracks('abc', 10)).rejects.toBeInstanceOf(
      MediaProviderUnavailableError
    )
  })
})

describe('services/mediaProvider — getProviderPlaylistTracks', () => {
  it('reads the playlist in one call limited to 500 titles, with a timeout signal', async () => {
    const fetchMock = stubProviderFetch(() => jsonResponse({ data: [providerTrack(1)], total: 1 }))

    const tracks = await getProviderPlaylistTracks('908622995')

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(url.origin + url.pathname).toBe('https://api.deezer.com/playlist/908622995/tracks')
    expect(url.searchParams.get('limit')).toBe('500')
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
    expect(tracks).toEqual([
      {
        provider: 'deezer',
        ref: '1',
        title: 'Titre 1',
        titleShort: 'Titre 1',
        artist: 'Artiste 1',
        album: 'Album 1',
        coverUrl: 'https://cdn.test/cover/1.jpg',
        previewUrl: 'https://cdn.test/preview/1.mp3?hdnea=exp=1',
        link: 'https://www.deezer.com/track/1',
        readable: true,
      },
    ])
  })

  it('keeps the short title when the provider gives one', async () => {
    stubProviderFetch(() =>
      jsonResponse({
        data: [providerTrack(1, { title: 'Song (Remastered)', title_short: 'Song' })],
      })
    )

    const [track] = (await getProviderPlaylistTracks('1')) ?? []

    expect([track.title, track.titleShort]).toEqual(['Song (Remastered)', 'Song'])
  })

  it('flags a title only when readable is false (absent means readable), and a title without a usable preview', async () => {
    stubProviderFetch(() =>
      jsonResponse({
        data: [
          providerTrack(1, { readable: false }),
          providerTrack(2, { readable: undefined }),
          providerTrack(3, { preview: '' }),
          providerTrack(4, { preview: 'http://cdn.test/4.mp3' }),
        ],
      })
    )

    const tracks = (await getProviderPlaylistTracks('1')) ?? []

    expect(tracks.map((track) => [track.readable, track.previewUrl === null])).toEqual([
      [false, false],
      [true, false],
      [true, true],
      [true, true],
    ])
  })

  it('drops a malformed title and keeps the others', async () => {
    stubProviderFetch(() =>
      jsonResponse({ data: [providerTrack(1), { id: 'x' }, null, providerTrack(4)] })
    )

    expect((await getProviderPlaylistTracks('1'))?.map((track) => track.ref)).toEqual(['1', '4'])
  })

  it('returns an empty list for an empty playlist', async () => {
    stubProviderFetch(() => jsonResponse({ data: [], total: 0 }))

    expect(await getProviderPlaylistTracks('1')).toEqual([])
  })

  it('returns null for an unknown playlist (200 with error 800, or HTTP 404)', async () => {
    stubProviderFetch(() => jsonResponse(PROVIDER_ERROR_NOT_FOUND))
    expect(await getProviderPlaylistTracks('999')).toBeNull()

    stubProviderFetch(() => jsonResponse({}, 404))
    expect(await getProviderPlaylistTracks('999')).toBeNull()
  })

  it.each(['', 'abc', '12/../x', '-3', '1'.repeat(21)])(
    'refuses the ref %j without calling the provider',
    async (ref) => {
      const fetchMock = stubProviderFetch(() => jsonResponse({ data: [] }))

      expect(await getProviderPlaylistTracks(ref)).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it.each<[string, () => Response]>([
    [
      'a timeout',
      () => {
        throw new DOMException('timeout', 'TimeoutError')
      },
    ],
    ['a network error', () => Promise.reject(new TypeError('fetch failed')) as never],
    ['HTTP 500', () => jsonResponse({}, 500)],
    ['HTTP 429', () => jsonResponse({}, 429)],
    ['a quota error body', () => jsonResponse({ error: { type: 'Exception', code: 4 } })],
    ['invalid JSON', () => new Response('<html>', { status: 200 })],
    ['an unreadable envelope', () => jsonResponse({ data: 'nope' })],
  ])('reports the provider as unavailable on %s', async (_label, answer) => {
    stubProviderFetch(answer)

    await expect(getProviderPlaylistTracks('1')).rejects.toBeInstanceOf(
      MediaProviderUnavailableError
    )
  })
})
