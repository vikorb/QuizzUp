import { vi } from 'vitest'

import type { Question } from '@/types/question'

export const uploadQuestionMediaServiceMock = vi.fn(async (questionId: number): Promise<Question> =>
  mediaQuestion(questionId)
)

export const deleteQuestionMediaServiceMock = vi.fn(async (questionId: number): Promise<Question> =>
  mediaQuestion(questionId, { mediaFile: null })
)

export const fetchQuestionMediaBlobServiceMock = vi.fn(
  async (): Promise<Blob> => new Blob(['ID3'], { type: 'audio/mpeg' })
)

export function mediaQuestion(questionId: number, overrides: Partial<Question> = {}): Question {
  return {
    id: questionId,
    adminId: 1,
    companyId: null,
    themeId: 1,
    themeIds: [1],
    scope: 'global',
    question: 'Blind test',
    typeMedia: 'audio',
    mediaUrl: null,
    mediaStartMs: 0,
    mediaFile: {
      url: `/questions/${questionId}/media`,
      mimeType: 'audio/mpeg',
      sizeBytes: 2048,
      durationMs: 60_000,
      originalName: 'extrait.mp3',
      uploadedAt: '2026-11-03T12:00:00.000Z',
    },
    status: 1,
    canEdit: true,
    ...overrides,
  }
}

export function resetQuestionMediaServiceMock(): void {
  uploadQuestionMediaServiceMock.mockReset()
  deleteQuestionMediaServiceMock.mockReset()
  fetchQuestionMediaBlobServiceMock.mockReset()

  uploadQuestionMediaServiceMock.mockImplementation(async (questionId: number) =>
    mediaQuestion(questionId)
  )
  deleteQuestionMediaServiceMock.mockImplementation(async (questionId: number) =>
    mediaQuestion(questionId, { mediaFile: null })
  )
  fetchQuestionMediaBlobServiceMock.mockImplementation(
    async () => new Blob(['ID3'], { type: 'audio/mpeg' })
  )
}
