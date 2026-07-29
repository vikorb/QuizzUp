import {
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_STATUS_ACTIVE,
  type QuestionMediaType,
  type QuestionStatus,
  THEME_SCOPE_COMPANY,
} from '@quizzup/shared'
import { vi } from 'vitest'

export type QuestionMock = {
  id: number
  adminId: number
  companyId: number | null
  themeId: number | null
  themeIds?: number[]
  scope: 'global' | 'company'
  question: string
  typeMedia: QuestionMediaType
  mediaUrl: string | null
  status: number
  canEdit?: boolean
}

type ServiceErrorResult = {
  ok: false
  status: number | null
  error: string
}

type QuestionApiResult =
  | {
      ok: true
      status: number
      data: {
        question: QuestionMock | null
      }
    }
  | ServiceErrorResult

type UpdateQuestionStatusResult =
  | {
      ok: true
      question: QuestionMock
    }
  | {
      ok: false
      error: string
    }

export function createQuestionMock(overrides: Partial<QuestionMock> = {}): QuestionMock {
  return {
    id: 1,
    adminId: 1,
    companyId: 1,
    themeId: 1,
    themeIds: [1],
    scope: THEME_SCOPE_COMPANY,
    question: 'Question ?',
    typeMedia: QUESTION_MEDIA_TYPE_NONE,
    mediaUrl: null,
    status: QUESTION_STATUS_ACTIVE,
    canEdit: true,
    ...overrides,
  }
}

export const linkedQuestionsFixture: QuestionMock[] = [
  createQuestionMock({ id: 101, question: 'Linked one', themeId: 1, themeIds: [1, 2] }),
  createQuestionMock({ id: 102, question: 'Linked two', themeId: 1, themeIds: [1] }),
]

// Réponses par défaut : listQuestionsService renvoie les questions liées au thème 1.
export const listQuestionsServiceMock = vi.fn(
  async (): Promise<QuestionMock[]> => linkedQuestionsFixture
)

export const listThemesServiceMock = vi.fn(async () => [])

export const loadQuestionServiceMock = vi.fn(async (questionId: number): Promise<QuestionMock> =>
  createQuestionMock({ id: questionId })
)

export const createQuestionServiceMock = vi.fn(async (): Promise<QuestionMock> =>
  createQuestionMock()
)

export const updateQuestionServiceMock = vi.fn(async (questionId: number): Promise<QuestionMock> =>
  createQuestionMock({ id: questionId })
)

export const deleteQuestionServiceMock = vi.fn(async (): Promise<QuestionMock | null> => null)

export const listQuestionThemesServiceMock = vi.fn(async () => [])

export const listQuestionAnswersServiceMock = vi.fn(async () => [])

export const createQuestionAnswerServiceMock = vi.fn(async () => ({
  id: 1,
  response: 'A',
  isCorrect: true,
}))

export const updateQuestionAnswerServiceMock = vi.fn(async () => ({
  id: 1,
  response: 'A',
  isCorrect: true,
}))

export const deleteQuestionAnswerServiceMock = vi.fn(async () => ({
  id: 1,
  response: 'A',
  isCorrect: true,
}))

export const updateQuestionStatusServiceMock = vi.fn(
  async (questionId: number, status: QuestionStatus): Promise<UpdateQuestionStatusResult> => ({
    ok: true,
    question: createQuestionMock({ id: questionId, status }),
  })
)

export const attachQuestionToThemeServiceMock = vi.fn(
  async (questionId: number, themeId: number): Promise<QuestionApiResult> => ({
    ok: true,
    status: 200,
    data: {
      question: createQuestionMock({
        id: questionId,
        themeId,
        themeIds: [themeId],
      }),
    },
  })
)

// Par défaut le détachement réussit et renvoie la question sans le thème courant
// (elle conserve au moins un autre thème pour respecter l'invariant serveur).
export const detachQuestionFromThemeServiceMock = vi.fn(
  async (questionId: number): Promise<QuestionApiResult> => ({
    ok: true,
    status: 200,
    data: {
      question: createQuestionMock({
        id: questionId,
        themeId: 2,
        themeIds: [2],
      }),
    },
  })
)

export function mockListQuestionsSuccess(questions: QuestionMock[] = linkedQuestionsFixture): void {
  listQuestionsServiceMock.mockResolvedValue(questions)
}

export function mockAttachQuestionSuccess(question: QuestionMock): void {
  attachQuestionToThemeServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      question,
    },
  })
}

export function mockDetachQuestionSuccess(question: QuestionMock): void {
  detachQuestionFromThemeServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      question,
    },
  })
}

export function mockDetachQuestionFailure(error = 'question_theme_last_link'): void {
  detachQuestionFromThemeServiceMock.mockResolvedValue({
    ok: false,
    status: 400,
    error,
  })
}

export function resetQuestionsServiceMock(): void {
  listQuestionsServiceMock.mockReset()
  listThemesServiceMock.mockReset()
  loadQuestionServiceMock.mockReset()
  createQuestionServiceMock.mockReset()
  updateQuestionServiceMock.mockReset()
  deleteQuestionServiceMock.mockReset()
  listQuestionThemesServiceMock.mockReset()
  listQuestionAnswersServiceMock.mockReset()
  createQuestionAnswerServiceMock.mockReset()
  updateQuestionAnswerServiceMock.mockReset()
  deleteQuestionAnswerServiceMock.mockReset()
  updateQuestionStatusServiceMock.mockReset()
  attachQuestionToThemeServiceMock.mockReset()
  detachQuestionFromThemeServiceMock.mockReset()

  listQuestionsServiceMock.mockResolvedValue(linkedQuestionsFixture)
  listThemesServiceMock.mockResolvedValue([])
  loadQuestionServiceMock.mockImplementation(async (questionId: number) =>
    createQuestionMock({ id: questionId })
  )
  createQuestionServiceMock.mockImplementation(async () => createQuestionMock())
  updateQuestionServiceMock.mockImplementation(async (questionId: number) =>
    createQuestionMock({ id: questionId })
  )
  deleteQuestionServiceMock.mockResolvedValue(null)
  updateQuestionStatusServiceMock.mockImplementation(
    async (questionId: number, status: QuestionStatus) => ({
      ok: true,
      question: createQuestionMock({ id: questionId, status }),
    })
  )
  attachQuestionToThemeServiceMock.mockImplementation(
    async (questionId: number, themeId: number) => ({
      ok: true,
      status: 200,
      data: {
        question: createQuestionMock({ id: questionId, themeId, themeIds: [themeId] }),
      },
    })
  )
  detachQuestionFromThemeServiceMock.mockImplementation(async (questionId: number) => ({
    ok: true,
    status: 200,
    data: {
      question: createQuestionMock({ id: questionId, themeId: 2, themeIds: [2] }),
    },
  }))
}
