import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as QuestionsService from '@/services/questionsService'
import type { QuestionPayload } from '@/types/question'

// Le setup global mocke le service et l'état d'authentification : on teste ici le vrai service
// avec le vrai client HTTP, en ne simulant que `fetch`.
vi.mock('@/state/authState', () => ({ token: { value: 'jeton' } }))

const fetchMock = vi.hoisted(() => vi.fn())

vi.stubGlobal('fetch', fetchMock)

const service = await vi.importActual<typeof QuestionsService>('@/services/questionsService')

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const payload: QuestionPayload = {
  themeIds: [1],
  question: 'Quel groupe ?',
  kind: 'qcm',
  typeMedia: 'audio',
  mediaUrl: null,
  audioEffect: 'reverse',
  answers: [
    { response: 'Queen', isCorrect: true },
    { response: 'ABBA', isCorrect: false },
  ],
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe('services/questionsService — audio effect', () => {
  it('sends the chosen audio effect in the request body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { question: { id: 42 } }))

    await service.createQuestionService(payload)

    const [, init] = fetchMock.mock.calls[0] ?? []

    expect(JSON.parse(init.body as string)).toMatchObject({ audioEffect: 'reverse' })
  })

  it.each(['question_audio_effect_invalid', 'audio_effect_requires_audio'])(
    'hands the API error %s intact to the caller on create',
    async (code) => {
      fetchMock.mockResolvedValue(jsonResponse(400, { error: code }))

      await expect(service.createQuestionService(payload)).rejects.toThrow(code)
    }
  )

  it.each(['question_audio_effect_invalid', 'audio_effect_requires_audio'])(
    'hands the API error %s intact to the caller on update',
    async (code) => {
      fetchMock.mockResolvedValue(jsonResponse(400, { error: code }))

      await expect(service.updateQuestionService(5, { audioEffect: 'slowed' })).rejects.toThrow(
        code
      )
    }
  )

  it('still turns an unknown 400 into invalid_body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'whatever' }))

    await expect(service.createQuestionService(payload)).rejects.toThrow('invalid_body')
  })
})
