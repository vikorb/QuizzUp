import type { FastifyRequest } from 'fastify'
import type { Knex } from 'knex'

import {
  ADMIN_ROLE_USER,
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  ANSWER_STATUS_DRAFT,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPES,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  QUESTION_STATUSES,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_DELETED,
  type AdminRole,
  type AnswerStatus,
  type QuestionMediaType,
  type QuestionStatus,
  type ThemeScope,
} from '@quizzup/shared'
import db from '../../db'
import { getCurrentCompanyId, isSuperadmin } from '../../security/companiesPolicy'
import { canReadTheme, getThemeAccessRow, themeSelect, type ThemeAccessRow } from '../themes/_shared'

export const DEFAULT_QUESTION_MEDIA_TYPE = QUESTION_MEDIA_TYPE_NONE

export type QuestionBody = {
  question?: string
  themeId?: number | string | null
  themeIds?: Array<number | string>
  scope?: ThemeScope
  companyId?: number | null
  typeMedia?: QuestionMediaType
  mediaUrl?: string | null
  status?: QuestionStatus
  answers?: unknown
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

export type QuestionAccessRow = {
  id: number
  admin_id: number
  company_id: number | null
  scope: ThemeScope
  status: QuestionStatus
}

type AuthPayload = {
  id?: number | string
  adminId?: number | string
  sub?: number | string
  role?: AdminRole | string
}

type AuthenticatedRequest = FastifyRequest & {
  user?: AuthPayload
  admin?: AuthPayload
}

type NormalizedAnswer = {
  response: string
  isCorrect: boolean
  status?: AnswerStatus
}

type QuestionThemeLink = {
  question_id: number | string
  theme_id: number | string
}

export const questionSelect = [
  'questions.id',
  'questions.admin_id as adminId',
  'questions.company_id as companyId',
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
  'answers.id',
  'answers.admin_id as adminId',
  'answers.question_id as questionId',
  'answers.response',
  'answers.is_correct as isCorrect',
  'answers.status',
  'answers.created_at as createdAt',
  'answers.updated_at as updatedAt',
  'answers.deleted_at as deletedAt',
]

export function getCurrentAdminId(req: FastifyRequest): number | null {
  const authReq = req as AuthenticatedRequest
  const value =
    authReq.user?.adminId ??
    authReq.user?.id ??
    authReq.user?.sub ??
    authReq.admin?.adminId ??
    authReq.admin?.id

  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function getCurrentAdminRole(req: FastifyRequest): string | null {
  const authReq = req as AuthenticatedRequest

  return authReq.user?.role ?? authReq.admin?.role ?? null
}

export function isUserRole(req: FastifyRequest): boolean {
  return getCurrentAdminRole(req) === ADMIN_ROLE_USER
}

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

export function isValidQuestionScope(value: unknown): value is ThemeScope {
  return value === THEME_SCOPE_GLOBAL || value === THEME_SCOPE_COMPANY
}

export function isValidQuestionMediaType(value: unknown): value is QuestionMediaType {
  return typeof value === 'string' && QUESTION_MEDIA_TYPES.includes(value as QuestionMediaType)
}

export function isValidQuestionStatus(value: unknown): value is QuestionStatus {
  return typeof value === 'number' && QUESTION_STATUSES.includes(value as QuestionStatus)
}

export function getCreateQuestionStatus(req: FastifyRequest): QuestionStatus {
  return isUserRole(req) ? QUESTION_STATUS_DRAFT : QUESTION_STATUS_ACTIVE
}

export function getCreateAnswerStatus(req: FastifyRequest): AnswerStatus {
  return isUserRole(req) ? ANSWER_STATUS_DRAFT : ANSWER_STATUS_ACTIVE
}

export function getAnswerStatusFromQuestionStatus(status: QuestionStatus): AnswerStatus {
  return status === QUESTION_STATUS_DELETED ? ANSWER_STATUS_DELETED : ANSWER_STATUS_ACTIVE
}

export function getQuestionScope(req: FastifyRequest, requestedScope?: ThemeScope): ThemeScope {
  return isSuperadmin(req) ? requestedScope ?? THEME_SCOPE_GLOBAL : THEME_SCOPE_COMPANY
}

export function getQuestionCompanyId(
  req: FastifyRequest,
  scope: ThemeScope,
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

export async function getQuestionAccessRow(
  questionId: number,
): Promise<QuestionAccessRow | null> {
  const question = await db('questions')
    .select('id', 'admin_id', 'company_id', 'scope', 'status')
    .where({ id: questionId })
    .first()

  return question ? (question as QuestionAccessRow) : null
}

export function buildQuestionStatusPatch(status: QuestionStatus) {
  return {
    status,
    updated_at: db.fn.now(),
    deleted_at: status === QUESTION_STATUS_DELETED ? db.fn.now() : null,
  }
}

export function normalizeAnswers(answers: unknown): NormalizedAnswer[] {
  if (!Array.isArray(answers)) {
    return []
  }

  return answers.map((answer) => {
    const rawAnswer = answer as Record<string, unknown>

    return {
      response: typeof rawAnswer.response === 'string' ? rawAnswer.response.trim() : '',
      isCorrect: Boolean(rawAnswer.isCorrect ?? rawAnswer.is_correct),
      status: rawAnswer.status as AnswerStatus | undefined,
    }
  })
}

export function validateAnswers(answers: NormalizedAnswer[]): string | null {
  if (answers.length < 2) {
    return 'question_answers_min_required'
  }

  if (answers.some((answer) => !answer.response)) {
    return 'question_answer_required'
  }

  const correctAnswersCount = answers.filter((answer) => answer.isCorrect).length

  if (correctAnswersCount !== 1) {
    return 'question_one_correct_answer_required'
  }

  return null
}

export function parseQuestionThemeIds(body: QuestionBody): number[] {
  const rawThemeIds =
    Array.isArray(body.themeIds) && body.themeIds.length > 0
      ? body.themeIds
      : body.themeId !== undefined && body.themeId !== null
        ? [body.themeId]
        : []

  return [
    ...new Set(
      rawThemeIds
        .map((themeId) => parsePositiveId(themeId))
        .filter((themeId): themeId is number => themeId !== null),
    ),
  ]
}

function isThemeCompatibleWithQuestion(
  theme: ThemeAccessRow,
  scope: ThemeScope,
  companyId: number | null,
): boolean {
  if (theme.scope === THEME_SCOPE_GLOBAL) {
    return scope === THEME_SCOPE_GLOBAL
  }

  if (scope === THEME_SCOPE_GLOBAL) {
    return true
  }

  return theme.company_id === companyId
}

export async function ensureThemeIsUsable(
  themeId: number,
  req: FastifyRequest,
  scope: ThemeScope,
  companyId: number | null,
): Promise<string | null> {
  const theme = await getThemeAccessRow(themeId)

  if (!theme || theme.status === THEME_STATUS_DELETED) {
    return 'question_theme_not_found'
  }

  if (!canReadTheme(theme, req)) {
    return 'question_theme_forbidden'
  }

  if (!isThemeCompatibleWithQuestion(theme, scope, companyId)) {
    return 'question_theme_scope_mismatch'
  }

  return null
}

export async function ensureThemesAreUsable(
  themeIds: number[],
  req: FastifyRequest,
  scope: ThemeScope,
  companyId: number | null,
): Promise<string | null> {
  if (themeIds.length === 0) {
    return 'question_theme_required'
  }

  for (const themeId of themeIds) {
    const themeError = await ensureThemeIsUsable(themeId, req, scope, companyId)

    if (themeError) {
      return themeError
    }
  }

  return null
}

export async function syncQuestionThemes(
  trx: Knex.Transaction,
  questionId: number,
  themeIds: number[],
): Promise<void> {
  await trx('question_themes').where({ question_id: questionId }).delete()

  await trx('question_themes')
    .insert(
      themeIds.map((themeId) => ({
        question_id: questionId,
        theme_id: themeId,
      })),
    )
    .onConflict(['question_id', 'theme_id'])
    .ignore()
}

export async function getThemesForQuestion(questionId: number) {
  return db('themes')
    .select(themeSelect)
    .join('question_themes', 'question_themes.theme_id', 'themes.id')
    .where('question_themes.question_id', questionId)
    .whereNot('themes.status', THEME_STATUS_DELETED)
    .orderBy('themes.id', 'asc')
}

export async function attachThemesToQuestions<T extends { id: number | string }>(
  questions: T[],
): Promise<Array<T & { themeId: number | null; themeIds: number[] }>> {
  if (questions.length === 0) {
    return []
  }

  const questionIds = questions.map((question) => Number(question.id))

  const links = await db('question_themes')
    .select('question_id', 'theme_id')
    .whereIn('question_id', questionIds)
    .orderBy('theme_id', 'asc') as QuestionThemeLink[]

  const themeIdsByQuestionId = links.reduce<Record<string, number[]>>((acc, link) => {
    const questionId = String(link.question_id)
    const themeId = Number(link.theme_id)

    acc[questionId] = [...(acc[questionId] ?? []), themeId]

    return acc
  }, {})

  return questions.map((question) => {
    const themeIds = themeIdsByQuestionId[String(question.id)] ?? []

    return {
      ...question,
      themeId: themeIds[0] ?? null,
      themeIds,
    }
  })
}

export async function getQuestionWithAnswers(questionId: number) {
  const question = await db('questions')
    .select(questionSelect)
    .where('questions.id', questionId)
    .first()

  if (!question) {
    return null
  }

  const answers = await db('answers')
    .select(answerSelect)
    .where({ question_id: questionId })
    .orderBy('id', 'asc')

  const themes = await getThemesForQuestion(questionId)

  return {
    ...question,
    themeId: themes[0]?.id ?? null,
    themeIds: themes.map((theme) => Number(theme.id)),
    themes,
    answers,
  }
}
