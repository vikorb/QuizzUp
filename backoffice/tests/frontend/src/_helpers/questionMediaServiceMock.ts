import { vi } from 'vitest'

import type { attachQuestionMediaProviderService } from '@/services/questionMediaService'
import type { MediaCatalogTrack, Question } from '@/types/question'

export const uploadQuestionMediaServiceMock = vi.fn(async (questionId: number): Promise<Question> =>
  mediaQuestion(questionId)
)

export const deleteQuestionMediaServiceMock = vi.fn(async (questionId: number): Promise<Question> =>
  mediaQuestion(questionId, { mediaFile: null })
)

export const attachQuestionMediaProviderServiceMock = vi.fn<
  typeof attachQuestionMediaProviderService
>(async (questionId) => providerQuestion(questionId))

export const searchMediaCatalogTracksServiceMock = vi.fn<
  (query: string) => Promise<MediaCatalogTrack[]>
>(async () => [])

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

export function providerQuestion(questionId: number, overrides: Partial<Question> = {}): Question {
  return mediaQuestion(questionId, {
    mediaFile: null,
    mediaProvider: 'deezer',
    mediaProviderRef: '3135556',
    mediaProviderLabel: 'Queen — Bohemian Rhapsody',
    ...overrides,
  })
}

export function mediaTrack(overrides: Partial<MediaCatalogTrack> = {}): MediaCatalogTrack {
  return {
    provider: 'deezer',
    ref: '3135556',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    coverUrl: 'https://cdn.example/cover.jpg',
    previewUrl: 'https://cdn.example/preview.mp3',
    link: 'https://www.deezer.com/track/3135556',
    ...overrides,
  }
}

export function resetQuestionMediaServiceMock(): void {
  uploadQuestionMediaServiceMock.mockReset()
  deleteQuestionMediaServiceMock.mockReset()
  fetchQuestionMediaBlobServiceMock.mockReset()
  attachQuestionMediaProviderServiceMock.mockReset()
  searchMediaCatalogTracksServiceMock.mockReset()

  uploadQuestionMediaServiceMock.mockImplementation(async (questionId: number) =>
    mediaQuestion(questionId)
  )
  deleteQuestionMediaServiceMock.mockImplementation(async (questionId: number) =>
    mediaQuestion(questionId, { mediaFile: null })
  )
  fetchQuestionMediaBlobServiceMock.mockImplementation(
    async () => new Blob(['ID3'], { type: 'audio/mpeg' })
  )
  attachQuestionMediaProviderServiceMock.mockImplementation(async (questionId: number) =>
    providerQuestion(questionId)
  )
  searchMediaCatalogTracksServiceMock.mockImplementation(async () => [])
}
