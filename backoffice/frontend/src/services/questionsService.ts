import type { QuestionStatus } from '@quizzup/shared'

import type { ApiResult } from '@/types/api'
import type {
  Answer,
  Question,
  QuestionFilters,
  QuestionMediaType,
  QuestionPayload,
  Theme,
  UpdateQuestionStatusResult,
} from '@/types/question'
import { apiRequestJson } from '@/utils/api'

type ThemeListResponse = {
  themes: Theme[]
}

type QuestionListResponse = {
  questions: Question[]
}

type QuestionResponse = {
  question: Question | null
}

type AnswerListResponse = {
  answers: Answer[]
}

type AnswerResponse = {
  answer: Answer
}

export type CreateAnswerPayload = {
  response: string
  isCorrect: boolean
}

export type UpdateAnswerPayload = {
  response?: string
  isCorrect?: boolean
}

export type UpdateQuestionPayload = {
  themeIds?: number[]
  themeId?: number
  question?: string
  typeMedia?: QuestionMediaType
  mediaUrl?: string | null
  status?: number
  answers?: Answer[]
}

function buildQuery(filters?: Partial<QuestionFilters>): string {
  const params = new URLSearchParams()

  if (filters?.search) {
    params.set('search', filters.search)
  }

  if (filters?.themeId) {
    params.set('themeId', filters.themeId)
  }

  if (filters?.status) {
    params.set('status', filters.status)
  }

  if (filters?.typeMedia) {
    params.set('typeMedia', filters.typeMedia)
  }

  if (filters?.scope) {
    params.set('scope', filters.scope)
  }

  const query = params.toString()

  return query ? `?${query}` : ''
}

function buildQuestionBody(payload: QuestionPayload | UpdateQuestionPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if ('themeIds' in payload && payload.themeIds !== undefined) {
    body.themeIds = payload.themeIds
  } else if ('themeId' in payload && payload.themeId !== undefined) {
    body.themeId = payload.themeId
  }

  if (payload.question !== undefined) {
    body.question = payload.question
  }

  if (payload.typeMedia !== undefined) {
    body.typeMedia = payload.typeMedia
  }

  if (payload.mediaUrl !== undefined) {
    body.mediaUrl = payload.mediaUrl
  }

  if ('status' in payload && payload.status !== undefined) {
    body.status = payload.status
  }

  if (payload.answers !== undefined) {
    body.answers = payload.answers.map((answer) => ({
      response: answer.response,
      isCorrect: answer.isCorrect,
    }))
  }

  return body
}

function buildAnswerBody(payload: CreateAnswerPayload | UpdateAnswerPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (payload.response !== undefined) {
    body.response = payload.response
  }

  if (payload.isCorrect !== undefined) {
    body.isCorrect = payload.isCorrect
  }

  return body
}

export async function listThemesService(): Promise<Theme[]> {
  const result = await apiRequestJson<ThemeListResponse>({
    path: '/themes',
    method: 'GET',
    authenticated: true,
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.data.themes
}

export async function listQuestionsService(filters?: Partial<QuestionFilters>): Promise<Question[]> {
  const result = await apiRequestJson<QuestionListResponse>({
    path: `/questions${buildQuery(filters)}`,
    method: 'GET',
    authenticated: true,
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.data.questions
}

export async function loadQuestionService(questionId: number): Promise<Question> {
  const result = await apiRequestJson<QuestionResponse>({
    path: `/questions/${questionId}`,
    method: 'GET',
    authenticated: true,
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  if (!result.data.question) {
    throw new Error('questionNotFound')
  }

  return result.data.question
}

export async function createQuestionService(payload: QuestionPayload): Promise<Question> {
  const result = await apiRequestJson<QuestionResponse>({
    path: '/questions',
    method: 'POST',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildQuestionBody(payload)),
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  if (!result.data.question) {
    throw new Error('questionCreateFailed')
  }

  return result.data.question
}

export async function updateQuestionService(
  questionId: number,
  payload: UpdateQuestionPayload,
): Promise<Question> {
  const result = await apiRequestJson<QuestionResponse>({
    path: `/questions/${questionId}`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildQuestionBody(payload)),
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  if (!result.data.question) {
    throw new Error('questionUpdateFailed')
  }

  return result.data.question
}

export async function deleteQuestionService(questionId: number): Promise<Question | null> {
  const result = await apiRequestJson<QuestionResponse>({
    path: `/questions/${questionId}`,
    method: 'DELETE',
    authenticated: true,
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.data.question
}

export async function listQuestionThemesService(questionId: number): Promise<Theme[]> {
  const result = await apiRequestJson<ThemeListResponse>({
    path: `/questions/${questionId}/themes`,
    method: 'GET',
    authenticated: true,
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.data.themes
}

export async function listQuestionAnswersService(questionId: number): Promise<Answer[]> {
  const result = await apiRequestJson<AnswerListResponse>({
    path: `/questions/${questionId}/answers`,
    method: 'GET',
    authenticated: true,
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.data.answers
}

export async function createQuestionAnswerService(
  questionId: number,
  payload: CreateAnswerPayload,
): Promise<Answer> {
  const result = await apiRequestJson<AnswerResponse>({
    path: `/questions/${questionId}/answers`,
    method: 'POST',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildAnswerBody(payload)),
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.data.answer
}

export async function updateQuestionAnswerService(
  questionId: number,
  answerId: number,
  payload: UpdateAnswerPayload,
): Promise<Answer> {
  const result = await apiRequestJson<AnswerResponse>({
    path: `/questions/${questionId}/answers/${answerId}`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildAnswerBody(payload)),
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.data.answer
}

export async function deleteQuestionAnswerService(
  questionId: number,
  answerId: number,
): Promise<Answer> {
  const result = await apiRequestJson<AnswerResponse>({
    path: `/questions/${questionId}/answers/${answerId}`,
    method: 'DELETE',
    authenticated: true,
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.data.answer
}

export async function updateQuestionStatusService(
  questionId: number,
  status: QuestionStatus,
): Promise<UpdateQuestionStatusResult> {
  const result = await apiRequestJson<QuestionResponse>({
    path: `/questions/${questionId}/status`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status,
    }),
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    }
  }

  if (!result.data.question) {
    return {
      ok: false,
      error: 'server_error',
    }
  }

  return {
    ok: true,
    question: result.data.question,
  }
}

export async function attachQuestionToThemeService(
  questionId: number,
  themeId: number,
): Promise<ApiResult<QuestionResponse>> {
  return apiRequestJson<QuestionResponse>({
    path: `/themes/${themeId}/questions/${questionId}`,
    method: 'POST',
    authenticated: true,
  })
}

export async function detachQuestionFromThemeService(
  questionId: number,
  themeId: number,
): Promise<ApiResult<QuestionResponse>> {
  return apiRequestJson<QuestionResponse>({
    path: `/themes/${themeId}/questions/${questionId}`,
    method: 'DELETE',
    authenticated: true,
  })
}
