import type { FastifyRequest } from 'fastify'

import {
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  ANSWER_STATUS_DRAFT,
  ANSWER_STATUSES,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPES,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  QUESTION_STATUSES,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_SCOPES,
  THEME_STATUS_DELETED,
  type AnswerStatus,
  type QuestionMediaType,
  type QuestionStatus,
  type ThemeScope,
} from '@quizzup/shared'
import db from '../../db'
import { getCurrentCompanyId, isSuperadmin } from '../../security/companiesPolicy'
import { getCurrentAdminId, isUserRole } from '../themes/_shared'

export type QuestionScope = ThemeScope

export type QuestionBody = {
  themeId?: number
  question?: string
  typeMedia?: QuestionMediaType
  mediaUrl?: string | null
  scope?: QuestionScope
  companyId?: number | null
  answers?: AnswerBody[]
}

export type QuestionStatusBody = {
  status?: QuestionStatus
}

export type QuestionQuery = {
  search?: string
  themeId?: string
  status?: string
  typeMedia?: string
  scope?: string
}

export type QuestionParams = {
  questionId: string
}

export type AnswerBody = {
  response?: string
  isCorrect?: boolean
}

export type AnswerStatusBody = {
  status?: AnswerStatus
}

export type AnswerParams = {
  questionId: string
  answerId: string
}

export type QuestionAccessRow = {
  id: number
  scope: QuestionScope
  company_id: number | null
  status: QuestionStatus
}

export const questionSelect = [
  'questions.id',
  'questions.admin_id as adminId',
  'questions.company_id as companyId',
  'questions.theme_id as themeId',
  'themes.name as themeName',
  'themes.mode as themeMode',
  'themes.scope as themeScope',
  'questions.scope',
  'questions.question',
  'questions.type_media as typeMedia',
  'questions.media_url as mediaUrl',
  'questions.status',
  'questions.created_at as createdAt',
  'questions.updated_at as updatedAt',
  'questions.deleted_at as deletedAt',
]

export const answerSelect = [
  'id',
  'admin_id as adminId',
  'question_id as questionId',
  'response',
  'is_correct as isCorrect',
  'status',
  'created_at as createdAt',
  'updated_at as updatedAt',
  'deleted_at as deletedAt',
]

export { getCurrentAdminId }

export function parsePositiveId(value: unknown): number | null {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = Number(value)

  return Number.isInteger(parsed) ? parsed : null
}

export function isValidQuestionScope(value: unknown): value is QuestionScope {
  return typeof value === 'string' && THEME_SCOPES.includes(value as QuestionScope)
}

export function isValidQuestionMediaType(value: unknown): value is QuestionMediaType {
  return typeof value === 'string' && QUESTION_MEDIA_TYPES.includes(value as QuestionMediaType)
}

export function isValidQuestionStatus(value: unknown): value is QuestionStatus {
  return typeof value === 'number' && QUESTION_STATUSES.includes(value as QuestionStatus)
}

export function isValidAnswerStatus(value: unknown): value is AnswerStatus {
  return typeof value === 'number' && ANSWER_STATUSES.includes(value as AnswerStatus)
}

export function getCreateQuestionStatus(req: FastifyRequest): QuestionStatus {
  return isUserRole(req) ? QUESTION_STATUS_DRAFT : QUESTION_STATUS_ACTIVE
}

export function getCreateAnswerStatus(req: FastifyRequest): AnswerStatus {
  return isUserRole(req) ? ANSWER_STATUS_DRAFT : ANSWER_STATUS_ACTIVE
}

export function getQuestionScope(req: FastifyRequest, requestedScope?: QuestionScope): QuestionScope {
  return isSuperadmin(req) ? requestedScope ?? THEME_SCOPE_GLOBAL : THEME_SCOPE_COMPANY
}

export function getQuestionCompanyId(
  req: FastifyRequest,
  scope: QuestionScope,
  requestedCompanyId?: number | null,
): number | null {
  if (scope === THEME_SCOPE_GLOBAL) {
    return null
  }

  return isSuperadmin(req) ? requestedCompanyId ?? null : getCurrentCompanyId(req)
}

export function canReadQuestion(question: QuestionAccessRow, req: FastifyRequest): boolean {
  const currentCompanyId = getCurrentCompanyId(req)

  return (
    isSuperadmin(req) ||
    question.scope === THEME_SCOPE_GLOBAL ||
    (question.scope === THEME_SCOPE_COMPANY && question.company_id === currentCompanyId)
  )
}

export function canEditQuestion(question: QuestionAccessRow, req: FastifyRequest): boolean {
  const currentCompanyId = getCurrentCompanyId(req)

  return (
    isSuperadmin(req) ||
    (question.scope === THEME_SCOPE_COMPANY && question.company_id === currentCompanyId)
  )
}

export async function getQuestionAccessRow(questionId: number): Promise<QuestionAccessRow | null> {
  const question = await db('questions')
    .select('id', 'scope', 'company_id', 'status')
    .where({ id: questionId })
    .first()

  return question ? (question as QuestionAccessRow) : null
}

export async function getQuestionWithAnswers(questionId: number) {
  const question = await db('questions')
    .select(questionSelect)
    .leftJoin('themes', 'themes.id', 'questions.theme_id')
    .where('questions.id', questionId)
    .first()

  if (!question) {
    return null
  }

  const answers = await db('answers')
    .select(answerSelect)
    .where({ question_id: questionId })
    .whereNot('status', ANSWER_STATUS_DELETED)
    .orderBy('id', 'asc')

  return {
    ...question,
    answers,
  }
}

export async function ensureThemeIsUsable(
  themeId: number,
  req: FastifyRequest,
  questionScope: QuestionScope,
  questionCompanyId: number | null,
): Promise<string | null> {
  const theme = await db('themes')
    .select('id', 'scope', 'company_id')
    .where({ id: themeId })
    .whereNot('status', THEME_STATUS_DELETED)
    .first()

  if (!theme) {
    return 'question_theme_not_found'
  }

  if (isSuperadmin(req)) {
    return null
  }

  if (theme.scope === THEME_SCOPE_GLOBAL) {
    return null
  }

  if (
    theme.scope === THEME_SCOPE_COMPANY &&
    theme.company_id === questionCompanyId &&
    questionScope === THEME_SCOPE_COMPANY
  ) {
    return null
  }

  return 'question_theme_forbidden'
}

export function normalizeAnswers(answers: AnswerBody[] | undefined) {
  return (answers ?? []).map((answer) => ({
    response: answer.response?.trim() ?? '',
    isCorrect: answer.isCorrect ?? false,
  }))
}

export function validateAnswers(answers: { response: string; isCorrect: boolean }[]): string | null {
  if (answers.length < 2) {
    return 'question_answers_min_required'
  }

  if (answers.some((answer) => !answer.response)) {
    return 'answer_response_required'
  }

  if (answers.filter((answer) => answer.isCorrect).length !== 1) {
    return 'question_one_correct_answer_required'
  }

  return null
}

export function getAnswerStatusFromQuestionStatus(status: QuestionStatus): AnswerStatus {
  if (status === QUESTION_STATUS_DELETED) {
    return ANSWER_STATUS_DELETED
  }

  if (status === QUESTION_STATUS_DRAFT) {
    return ANSWER_STATUS_DRAFT
  }

  return ANSWER_STATUS_ACTIVE
}

export function buildQuestionStatusPatch(status: QuestionStatus) {
  return {
    status,
    updated_at: db.fn.now(),
    deleted_at: status === QUESTION_STATUS_DELETED ? db.fn.now() : null,
  }
}

export function buildAnswerStatusPatch(status: AnswerStatus) {
  return {
    status,
    updated_at: db.fn.now(),
    deleted_at: status === ANSWER_STATUS_DELETED ? db.fn.now() : null,
  }
}

export const DEFAULT_QUESTION_MEDIA_TYPE = QUESTION_MEDIA_TYPE_NONE
