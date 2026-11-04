import type { FastifyRequest } from 'fastify'
import type { Knex } from 'knex'

import {
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  ANSWER_STATUS_DRAFT,
  ANSWER_STATUS_INACTIVE,
  QUESTION_KINDS,
  getQuestionKindAnswersError,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPES,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
  QUESTION_STATUSES,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_DELETED,
  type AnswerStatus,
  type QuestionKind,
  type QuestionMediaType,
  type QuestionStatus,
  type ThemeScope,
} from '@quizzup/shared'
import db from '../../db'
import {
  getCurrentAdminId,
  getCurrentAdminRole,
  isUserRole,
  parseOptionalNumber,
  parsePositiveId,
} from '../_shared/adminContext'
import {
  canEditScoped,
  canEditScopedForScope,
  canReadScoped,
  getScope,
  getScopedCompanyId,
} from '../_shared/scope'
import {
  canReadTheme,
  getThemeAccessRow,
  themeSelect,
  type ThemeAccessRow,
} from '../themes/_shared'

export { getCurrentAdminId, getCurrentAdminRole, isUserRole, parseOptionalNumber, parsePositiveId }

export const DEFAULT_QUESTION_MEDIA_TYPE = QUESTION_MEDIA_TYPE_NONE

export type QuestionBody = {
  question?: string
  themeId?: number | string | null
  themeIds?: Array<number | string>
  scope?: ThemeScope
  companyId?: number | null
  typeMedia?: QuestionMediaType
  kind?: QuestionKind
  mediaUrl?: string | null
  mediaStartMs?: number
  status?: QuestionStatus
  answers?: unknown
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
  kind?: QuestionKind
}

export type QuestionStatusBody = {
  status?: QuestionStatus
}

export type QuestionQuery = {
  search?: string
  themeId?: string
  status?: string
  typeMedia?: string
  kind?: string
  scope?: string
}

type NormalizedAnswer = {
  id?: number
  response: string
  isCorrect: boolean
  status?: AnswerStatus
}

type QuestionThemeLink = {
  question_id: number | string
  theme_id: number | string
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

export const questionSelect = [
  'questions.id',
  'questions.admin_id as adminId',
  'questions.company_id as companyId',
  'questions.scope',
  'questions.question',
  'questions.type_media as typeMedia',
  'questions.kind',
  'questions.media_url as mediaUrl',
  'questions.media_key as mediaKey',
  'questions.media_mime_type as mediaMimeType',
  'questions.media_size_bytes as mediaSizeBytes',
  'questions.media_duration_ms as mediaDurationMs',
  'questions.media_start_ms as mediaStartMs',
  'questions.media_original_name as mediaOriginalName',
  'questions.media_uploaded_at as mediaUploadedAt',
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

type QuestionMediaColumns = {
  id: number | string
  mediaKey?: string | null
  mediaMimeType?: string | null
  mediaSizeBytes?: number | string | null
  mediaDurationMs?: number | string | null
  mediaStartMs?: number | string | null
  mediaOriginalName?: string | null
  mediaUploadedAt?: string | Date | null
}

export type QuestionMediaFile = {
  url: string
  mimeType: string
  sizeBytes: number
  durationMs: number | null
  originalName: string | null
  uploadedAt: string | Date | null
}

export function getQuestionMediaPath(questionId: number | string): string {
  return `/questions/${questionId}/media`
}

/** Version du fichier = uuid de sa clé : change à chaque upload (URL de lecture, ETag). */
export function getMediaVersion(mediaKey: string): string {
  const fileName = mediaKey.split('/').pop() ?? mediaKey

  return fileName.replace(/\.[a-z0-9]+$/, '')
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

/**
 * Remplace les colonnes techniques du fichier audio par un objet `mediaFile` : la clé de
 * stockage n'est jamais exposée, seule l'URL protégée de lecture l'est.
 */
export function serializeQuestionMedia<T extends QuestionMediaColumns>(question: T) {
  const {
    mediaKey,
    mediaMimeType,
    mediaSizeBytes,
    mediaDurationMs,
    mediaOriginalName,
    mediaUploadedAt,
    ...rest
  } = question

  const mediaFile: QuestionMediaFile | null = mediaKey
    ? {
        // URL versionnée : un remplacement change l'URL, donc aucun cache (navigateur ou
        // préchargement de la salle) ne peut resservir l'ancien extrait.
        url: `${getQuestionMediaPath(question.id)}?v=${getMediaVersion(mediaKey)}`,
        mimeType: String(mediaMimeType),
        sizeBytes: Number(mediaSizeBytes),
        durationMs: toNullableNumber(mediaDurationMs),
        originalName: mediaOriginalName ?? null,
        uploadedAt: mediaUploadedAt ?? null,
      }
    : null

  return {
    ...rest,
    mediaStartMs: toNullableNumber(question.mediaStartMs) ?? 0,
    mediaFile,
  }
}

/** Point de départ de l'extrait : entier en ms, positif, et avant la fin du fichier connu. */
export function validateMediaStartMs(value: unknown, durationMs: number | null): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 'question_media_start_invalid'
  }

  if (durationMs !== null && value >= durationMs) {
    return 'question_media_start_out_of_range'
  }

  return null
}

const VALID_ANSWER_STATUSES: readonly AnswerStatus[] = [
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DRAFT,
  ANSWER_STATUS_DELETED,
]

export function isValidAnswerStatus(value: unknown): value is AnswerStatus {
  return typeof value === 'number' && VALID_ANSWER_STATUSES.includes(value as AnswerStatus)
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

export function isValidQuestionScope(value: unknown): value is ThemeScope {
  return value === THEME_SCOPE_GLOBAL || value === THEME_SCOPE_COMPANY
}

export function isValidQuestionKind(value: unknown): value is QuestionKind {
  return typeof value === 'string' && QUESTION_KINDS.includes(value as QuestionKind)
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
  return getScope(req, requestedScope)
}

export function getQuestionCompanyId(
  req: FastifyRequest,
  scope: ThemeScope,
  requestedCompanyId?: number | null
): number | null {
  return getScopedCompanyId(req, scope, requestedCompanyId)
}

export function canReadQuestion(question: QuestionAccessRow, req: FastifyRequest): boolean {
  return canReadScoped(question, req)
}

export function canEditQuestionForScope(
  req: FastifyRequest,
  scope: ThemeScope,
  companyId: number | null
): boolean {
  return canEditScopedForScope(req, scope, companyId)
}

export function canEditQuestion(question: QuestionAccessRow, req: FastifyRequest): boolean {
  return canEditScoped(question, req)
}

export async function getQuestionAccessRow(questionId: number): Promise<QuestionAccessRow | null> {
  const question = await db('questions')
    .select('id', 'admin_id', 'company_id', 'scope', 'status', 'kind')
    .where({ id: questionId })
    .first()

  return question ? (question as QuestionAccessRow) : null
}

export function normalizeAnswers(answers: unknown): NormalizedAnswer[] {
  if (!Array.isArray(answers)) {
    return []
  }

  return answers.map((answer) => {
    const rawAnswer = answer as Record<string, unknown>
    const id = parsePositiveId(rawAnswer.id)

    return {
      id: id ?? undefined,
      response: typeof rawAnswer.response === 'string' ? rawAnswer.response.trim() : '',
      isCorrect: Boolean(rawAnswer.isCorrect ?? rawAnswer.is_correct),
      status: rawAnswer.status as AnswerStatus | undefined,
    }
  })
}

export function hasInvalidAnswerStatus(answers: NormalizedAnswer[]): boolean {
  return answers.some(
    (answer) => answer.status !== undefined && !isValidAnswerStatus(answer.status)
  )
}

export function validateAnswers(answers: NormalizedAnswer[]): string | null {
  if (answers.length < 2) {
    return 'question_answers_min_required'
  }

  if (answers.some((answer) => !answer.response)) {
    return 'question_answer_required'
  }

  const correctAnswersCount = answers.filter((answer) => answer.isCorrect).length

  if (correctAnswersCount < 1) {
    return 'question_correct_answer_required'
  }

  return null
}

/** Règles de réponses du type de question : partagées avec le formulaire du backoffice. */
export function validateAnswersForKind(
  kind: QuestionKind,
  answers: NormalizedAnswer[]
): string | null {
  return getQuestionKindAnswersError(kind, answers)
}

/** Réponses non supprimées d'une question, pour revalider ses règles quand son type change. */
export async function getQuestionAnswersForValidation(
  questionId: number
): Promise<NormalizedAnswer[]> {
  const rows = await db('answers')
    .where('question_id', questionId)
    .whereNot('status', ANSWER_STATUS_DELETED)
    .select('response', 'is_correct')

  return rows.map((row) => ({ response: String(row.response), isCorrect: Boolean(row.is_correct) }))
}

/**
 * Plusieurs bonnes réponses sont autorisées, mais une question doit en garder
 * au moins une jouable : on ne peut retirer, désactiver ou supprimer une bonne
 * réponse que s'il en reste une autre ni supprimée ni inactive.
 */
export type AnswerLockRow = {
  id: number | string
  is_correct: boolean
  status: number
}

export function hasCorrectAnswerBesides(answers: AnswerLockRow[], answerId: number): boolean {
  return answers.some(
    (answer) =>
      Number(answer.id) !== answerId &&
      Boolean(answer.is_correct) &&
      Number(answer.status) !== ANSWER_STATUS_DELETED &&
      Number(answer.status) !== ANSWER_STATUS_INACTIVE
  )
}

/**
 * Verrouille la question le temps de la transaction puis renvoie ses réponses
 * non supprimées : deux modifications simultanées ne peuvent pas retirer
 * chacune « l'autre » bonne réponse.
 */
export async function lockQuestionAnswers(
  trx: Knex.Transaction,
  questionId: number
): Promise<AnswerLockRow[]> {
  await trx('questions').where({ id: questionId }).forUpdate().first('id')

  return trx('answers').where({ question_id: questionId }).whereNot('status', ANSWER_STATUS_DELETED)
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
        .filter((themeId): themeId is number => themeId !== null)
    ),
  ]
}

function isThemeCompatibleWithQuestion(
  theme: ThemeAccessRow,
  scope: ThemeScope,
  companyId: number | null
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
  companyId: number | null
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
  companyId: number | null
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
  themeIds: number[]
): Promise<void> {
  await trx('question_themes').where({ question_id: questionId }).delete()

  await trx('question_themes')
    .insert(
      themeIds.map((themeId) => ({
        question_id: questionId,
        theme_id: themeId,
      }))
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

export async function attachThemesToQuestions<
  T extends QuestionMediaColumns & { scope: ThemeScope; companyId: number | null },
>(questions: T[], req?: FastifyRequest) {
  if (questions.length === 0) {
    return []
  }

  const questionIds = questions.map((question) => Number(question.id))

  const links = (await db('question_themes')
    .select('question_id', 'theme_id')
    .whereIn('question_id', questionIds)
    .orderBy('theme_id', 'asc')) as QuestionThemeLink[]

  const themeIdsByQuestionId = links.reduce<Record<string, number[]>>((acc, link) => {
    const questionId = String(link.question_id)
    const themeId = Number(link.theme_id)

    acc[questionId] = [...(acc[questionId] ?? []), themeId]

    return acc
  }, {})

  return questions.map((question) => {
    const themeIds = themeIdsByQuestionId[String(question.id)] ?? []

    return {
      ...serializeQuestionMedia(question),
      themeId: themeIds[0] ?? null,
      themeIds,
      ...(req ? { canEdit: canEditQuestionForScope(req, question.scope, question.companyId) } : {}),
    }
  })
}

export async function getQuestionWithAnswers(questionId: number, req?: FastifyRequest) {
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
    .whereNot('status', ANSWER_STATUS_DELETED)
    .orderBy('id', 'asc')

  const themes = await getThemesForQuestion(questionId)

  return {
    ...serializeQuestionMedia(question),
    themeId: themes[0]?.id ?? null,
    themeIds: themes.map((theme) => Number(theme.id)),
    themes,
    answers,
    ...(req
      ? {
          canEdit: canEditQuestionForScope(
            req,
            question.scope as ThemeScope,
            (question.companyId ?? null) as number | null
          ),
        }
      : {}),
  }
}
