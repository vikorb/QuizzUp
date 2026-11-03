import type { Question } from '@/types/question'
import { apiFetch } from '@/utils/api'
import { getAudioMimeType } from '@/utils/question/audio'

import { QuestionMediaError, type QuestionMediaErrorCode } from './questionMediaError'

type QuestionResponse = {
  question: Question | null
}

export type UploadQuestionMediaPayload = {
  file: File
  durationMs: number | null
  rightsAttested: boolean
}

const KNOWN_ERROR_CODES: QuestionMediaErrorCode[] = [
  'question_media_required',
  'question_media_invalid_file',
  'question_media_rights_required',
  'question_media_duration_invalid',
  'question_media_not_found',
  'question_media_too_large',
  'question_media_type_unsupported',
  'forbidden',
]

async function readMediaError(response: Response | null): Promise<QuestionMediaError> {
  if (!response) {
    return new QuestionMediaError('api_unreachable')
  }

  if (response.status === 413) {
    return new QuestionMediaError('question_media_too_large')
  }

  if (response.status === 415) {
    return new QuestionMediaError('question_media_type_unsupported')
  }

  const data = (await response.json().catch(() => null)) as { error?: unknown } | null
  const code = data?.error

  if (typeof code === 'string' && KNOWN_ERROR_CODES.includes(code as QuestionMediaErrorCode)) {
    return new QuestionMediaError(code as QuestionMediaErrorCode)
  }

  return new QuestionMediaError(response.status === 403 ? 'forbidden' : 'server_error')
}

async function readQuestion(response: Response): Promise<Question> {
  const data = (await response.json().catch(() => null)) as QuestionResponse | null

  if (!data?.question) {
    throw new QuestionMediaError('server_error')
  }

  return data.question
}

function buildUploadQuery(payload: UploadQuestionMediaPayload): string {
  const params = new URLSearchParams()

  params.set('rightsAttested', String(payload.rightsAttested))
  params.set('fileName', payload.file.name)

  if (payload.durationMs) {
    params.set('durationMs', String(payload.durationMs))
  }

  return params.toString()
}

/** Envoie le fichier brut (pas de multipart) : `Content-Type` = type audio du fichier. */
export async function uploadQuestionMediaService(
  questionId: number,
  payload: UploadQuestionMediaPayload
): Promise<Question> {
  const mimeType = getAudioMimeType(payload.file)

  if (!mimeType) {
    throw new QuestionMediaError('question_media_type_unsupported')
  }

  const response = await apiFetch({
    path: `/questions/${questionId}/media?${buildUploadQuery(payload)}`,
    method: 'PUT',
    authenticated: true,
    headers: {
      'Content-Type': mimeType,
    },
    body: payload.file,
  })

  if (!response?.ok) {
    throw await readMediaError(response)
  }

  return readQuestion(response)
}

export async function deleteQuestionMediaService(questionId: number): Promise<Question> {
  const response = await apiFetch({
    path: `/questions/${questionId}/media`,
    method: 'DELETE',
    authenticated: true,
  })

  if (!response?.ok) {
    throw await readMediaError(response)
  }

  return readQuestion(response)
}

/**
 * L'URL de lecture est protégée (en-tête `Authorization`) : on la télécharge puis le
 * formulaire la lit via une URL locale (`URL.createObjectURL`).
 */
export async function fetchQuestionMediaBlobService(questionId: number): Promise<Blob> {
  const response = await apiFetch({
    path: `/questions/${questionId}/media`,
    method: 'GET',
    authenticated: true,
  })

  if (!response?.ok) {
    throw await readMediaError(response)
  }

  return response.blob()
}
