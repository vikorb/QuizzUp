import '../_helpers/registerRouteMocks'

import mediaCatalogRoutes from '@backend/routes/mediaCatalog'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { jsonResponse, providerTrack, stubProviderFetch } from '../_helpers/mockMediaProvider'
import { securityState } from '../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
  createRouteApp,
  parseJson,
} from '../_helpers/testApp'

resetRouteMocksBeforeEach()

afterEach(() => {
  vi.unstubAllGlobals()
})

async function search(query: string, user = companyAdminUser) {
  const app = await createRouteApp(mediaCatalogRoutes)
  const response = await app.inject({
    method: 'GET',
    url: `/media-catalog/tracks${query}`,
    headers: authHeaders(user),
  })

  await app.close()

  return response
}

describe('routes/mediaCatalog — GET /media-catalog/tracks', () => {
  it('lists the matching titles, without those that have no preview', async () => {
    const fetchMock = stubProviderFetch(() =>
      jsonResponse({
        data: [providerTrack(1), providerTrack(2, { preview: '' }), providerTrack(3)],
        total: 3,
      })
    )

    const response = await search('?q=daft%20punk&limit=5')

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ items: Array<{ ref: string }> }>(response).items.map((i) => i.ref)).toEqual([
      '1',
      '3',
    ])
    expect(parseJson<{ items: unknown[] }>(response).items[0]).toEqual({
      provider: 'deezer',
      ref: '1',
      title: 'Titre 1',
      artist: 'Artiste 1',
      album: 'Album 1',
      coverUrl: 'https://cdn.test/cover/1.jpg',
      previewUrl: 'https://cdn.test/preview/1.mp3?hdnea=exp=1',
      link: 'https://www.deezer.com/track/1',
    })

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('q')).toBe('daft punk')
    expect(url.searchParams.get('limit')).toBe('5')
  })

  it('asks for 10 results by default', async () => {
    const fetchMock = stubProviderFetch(() => jsonResponse({ data: [], total: 0 }))

    const response = await search('?q=abc')

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toEqual({ items: [] })
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('limit')).toBe('10')
  })

  it.each([
    ['no query', ''],
    ['a query shorter than 2 characters', '?q=a'],
    ['a blank query', '?q=%20%20%20'],
    ['a query longer than 100 characters', `?q=${'a'.repeat(101)}`],
    ['a limit of 0', '?q=abc&limit=0'],
    ['a limit above 25', '?q=abc&limit=26'],
    ['a limit that is not a number', '?q=abc&limit=ten'],
    ['a decimal limit', '?q=abc&limit=2.5'],
  ])('answers 400 invalid_query for %s, without calling the provider', async (_label, query) => {
    const fetchMock = stubProviderFetch(() => jsonResponse({ data: [] }))

    const response = await search(query)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_query' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts the limits 1 and 25 and a query of 2 and 100 characters', async () => {
    stubProviderFetch(() => jsonResponse({ data: [] }))

    for (const query of ['?q=ab&limit=1', `?q=${'a'.repeat(100)}&limit=25`]) {
      expect((await search(query)).statusCode).toBe(200)
    }
  })

  it('answers 502 media_provider_unavailable when the provider fails', async () => {
    stubProviderFetch(() => jsonResponse({}, 500))
    expect(parseJson(await search('?q=abc'))).toEqual({ error: 'media_provider_unavailable' })
    expect((await search('?q=abc')).statusCode).toBe(502)

    stubProviderFetch(() => {
      throw new DOMException('timeout', 'TimeoutError')
    })
    expect((await search('?q=abc')).statusCode).toBe(502)

    stubProviderFetch(() => new Response('not json', { status: 200 }))
    expect((await search('?q=abc')).statusCode).toBe(502)
  })

  it('refuses roles without the question update permission', async () => {
    securityState.hasPermission = false
    const fetchMock = stubProviderFetch(() => jsonResponse({ data: [] }))

    const response = await search('?q=abc', companyUser)

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a request that is not authenticated', async () => {
    const app = await createRouteApp(mediaCatalogRoutes)
    const fetchMock = stubProviderFetch(() => jsonResponse({ data: [] }))

    const response = await app.inject({ method: 'GET', url: '/media-catalog/tracks?q=abc' })

    await app.close()

    expect(response.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
