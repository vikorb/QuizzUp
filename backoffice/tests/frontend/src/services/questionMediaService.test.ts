import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as MediaService from '@/services/questionMediaService'

const apiFetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/api', () => ({
  apiFetch: apiFetchMock,
}))

// Le service est mocké globalement pour les composants : ici on teste le vrai module.
const service = await vi.importActual<typeof MediaService>('@/services/questionMediaService')

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const audioFile = new File(['ID3'], 'été.mp3', { type: 'audio/mpeg' })

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('services/questionMediaService — upload', () => {
  it('sends the raw file with its audio type and the query parameters', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { question: { id: 7 } }))

    const question = await service.uploadQuestionMediaService(7, {
      file: audioFile,
      durationMs: 31_000,
      rightsAttested: true,
    })

    expect(question).toEqual({ id: 7 })

    const options = apiFetchMock.mock.calls[0]?.[0]
    const url = new URL(`http://api${options.path}`)

    expect(url.pathname).toBe('/questions/7/media')
    expect(url.searchParams.get('rightsAttested')).toBe('true')
    expect(url.searchParams.get('durationMs')).toBe('31000')
    expect(url.searchParams.get('fileName')).toBe('été.mp3')
    expect(options).toMatchObject({
      method: 'PUT',
      authenticated: true,
      headers: { 'Content-Type': 'audio/mpeg' },
      body: audioFile,
    })
  })

  it('omits an unknown duration', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { question: { id: 7 } }))

    await service.uploadQuestionMediaService(7, {
      file: audioFile,
      durationMs: null,
      rightsAttested: true,
    })

    expect(apiFetchMock.mock.calls[0]?.[0].path).not.toContain('durationMs')
  })

  it('refuses unsupported files before calling the API', async () => {
    await expect(
      service.uploadQuestionMediaService(7, {
        file: new File(['x'], 'a.wav', { type: 'audio/wav' }),
        durationMs: null,
        rightsAttested: true,
      })
    ).rejects.toMatchObject({ code: 'question_media_type_unsupported' })

    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [jsonResponse(400, { error: 'question_media_invalid_file' }), 'question_media_invalid_file'],
    [new Response(null, { status: 413 }), 'question_media_too_large'],
    [new Response(null, { status: 415 }), 'question_media_type_unsupported'],
    [jsonResponse(403, {}), 'forbidden'],
    [jsonResponse(500, { error: 'boom' }), 'server_error'],
    [null, 'api_unreachable'],
  ])('maps API failures to a media error code (%#)', async (response, code) => {
    apiFetchMock.mockResolvedValue(response)

    await expect(
      service.uploadQuestionMediaService(7, {
        file: audioFile,
        durationMs: null,
        rightsAttested: true,
      })
    ).rejects.toMatchObject({ name: 'QuestionMediaError', code })
  })
})

describe('services/questionMediaService — delete and read', () => {
  it('deletes the file of a question', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { question: { id: 3, mediaFile: null } }))

    const question = await service.deleteQuestionMediaService(3)

    expect(question).toEqual({ id: 3, mediaFile: null })
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/questions/3/media',
      method: 'DELETE',
      authenticated: true,
    })
  })

  it('downloads the protected file as a blob', async () => {
    apiFetchMock.mockResolvedValue(
      new Response('ID3', { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
    )

    const blob = await service.fetchQuestionMediaBlobService(3)

    expect(blob.size).toBe(3)
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({ method: 'GET', authenticated: true })
  })

  it('reports a missing file', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(404, { error: 'question_media_not_found' }))

    await expect(service.fetchQuestionMediaBlobService(3)).rejects.toMatchObject({
      code: 'question_media_not_found',
    })
  })
})

describe('services/questionMediaService — track search', () => {
  const track = {
    provider: 'deezer',
    ref: '3135556',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    coverUrl: null,
    previewUrl: 'https://cdn.example/preview.mp3',
    link: null,
  }

  it('searches tracks with the encoded query and returns the items', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { items: [track] }))

    const items = await service.searchMediaCatalogTracksService('queen & bohème')

    expect(items).toEqual([track])

    const options = apiFetchMock.mock.calls[0]?.[0]
    const url = new URL(`http://api${options.path}`)

    expect(url.pathname).toBe('/media-catalog/tracks')
    expect(url.searchParams.get('q')).toBe('queen & bohème')
    expect(options).toMatchObject({ method: 'GET', authenticated: true })
  })

  it('returns an empty list when nothing matches', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { items: [] }))

    await expect(service.searchMediaCatalogTracksService('zzzz')).resolves.toEqual([])
  })

  it.each([
    [jsonResponse(400, { error: 'invalid_query' }), 'invalid_query'],
    [jsonResponse(502, { error: 'media_provider_unavailable' }), 'media_provider_unavailable'],
    [jsonResponse(403, {}), 'forbidden'],
    [jsonResponse(500, { error: 'boom' }), 'server_error'],
    [jsonResponse(200, { unexpected: true }), 'server_error'],
    [null, 'api_unreachable'],
  ])('maps search failures to a media error code (%#)', async (response, code) => {
    apiFetchMock.mockResolvedValue(response)

    await expect(service.searchMediaCatalogTracksService('queen')).rejects.toMatchObject({
      name: 'QuestionMediaError',
      code,
    })
  })
})

describe('services/questionMediaService — attach a track', () => {
  const payload = { provider: 'deezer', ref: '3135556' } as const

  it('sends the provider and the reference as JSON and returns the question', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(200, {
        question: { id: 7, mediaProvider: 'deezer', mediaProviderRef: '3135556' },
      })
    )

    const question = await service.attachQuestionMediaProviderService(7, payload)

    expect(question).toMatchObject({ id: 7, mediaProvider: 'deezer' })

    const options = apiFetchMock.mock.calls[0]?.[0]

    expect(options).toMatchObject({
      path: '/questions/7/media/provider',
      method: 'PUT',
      authenticated: true,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(JSON.parse(options.body)).toEqual(payload)
  })

  it.each([
    [400, 'question_media_provider_invalid'],
    [400, 'question_kind_media_invalid'],
    [404, 'question_not_found'],
    [404, 'question_media_provider_track_not_found'],
    [409, 'question_media_provider_no_preview'],
    [502, 'media_provider_unavailable'],
  ])('maps the API error %i %s to its code', async (status, code) => {
    apiFetchMock.mockResolvedValue(jsonResponse(status, { error: code }))

    await expect(service.attachQuestionMediaProviderService(7, payload)).rejects.toMatchObject({
      name: 'QuestionMediaError',
      code,
    })
  })

  it.each([
    [jsonResponse(403, {}), 'forbidden'],
    [jsonResponse(500, {}), 'server_error'],
    [jsonResponse(200, {}), 'server_error'],
    [null, 'api_unreachable'],
  ])('maps other failures to a media error code (%#)', async (response, code) => {
    apiFetchMock.mockResolvedValue(response)

    await expect(service.attachQuestionMediaProviderService(7, payload)).rejects.toMatchObject({
      code,
    })
  })
})
