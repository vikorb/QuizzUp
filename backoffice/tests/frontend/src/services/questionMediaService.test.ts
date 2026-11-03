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
