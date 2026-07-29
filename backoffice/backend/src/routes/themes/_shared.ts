import type { FastifyRequest } from 'fastify'

import {
  QUESTION_STATUS_DELETED,
  THEME_MODES,
  THEME_SCOPES,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUSES,
  type ThemeMode,
  type ThemeScope,
  type ThemeStatus,
} from '@quizzup/shared'
import db from '../../db'
import {
  getCurrentAdminId,
  getCurrentAdminRole,
  isUserRole,
  parseOptionalNumber,
  parsePositiveId,
} from '../_shared/adminContext'
import { canEditScoped, canReadScoped, getScope, getScopedCompanyId } from '../_shared/scope'

export { getCurrentAdminId, getCurrentAdminRole, isUserRole, parseOptionalNumber, parsePositiveId }

export type ThemeBody = {
  name?: string
  mode?: ThemeMode
  scope?: ThemeScope
  companyId?: number | null
}

export type ThemeStatusBody = {
  status?: ThemeStatus
}

export type ThemeQuery = {
  search?: string
  mode?: string
  status?: string
  scope?: string
}

export type ThemeParams = {
  themeId: string
}

export type ThemeAccessRow = {
  id: number
  scope: ThemeScope
  company_id: number | null
  status: ThemeStatus
}

export const themeSelect = [
  'themes.id',
  'themes.admin_id as adminId',
  'themes.company_id as companyId',
  'themes.scope',
  'themes.name',
  'themes.mode',
  'themes.status',
  'themes.created_at as createdAt',
  'themes.updated_at as updatedAt',
  'themes.deleted_at as deletedAt',
]

/**
 * Sélection enrichie pour le listing : ajoute le nombre de questions liées via
 * une sous-requête corrélée sur `question_themes`.
 *
 * On garde une sélection dédiée (plutôt que d'étendre `themeSelect`) car ce
 * dernier alimente aussi les `RETURNING` des mutations et `getThemesForQuestion`
 * (module questions), où ce compteur n'a pas lieu d'être.
 */
export const themeListSelect = [
  ...themeSelect,
  db.raw(
    '(SELECT COUNT(*) FROM question_themes ' +
      'INNER JOIN questions ON questions.id = question_themes.question_id ' +
      'WHERE question_themes.theme_id = themes.id AND questions.status <> ?)::int as "questionsCount"',
    [QUESTION_STATUS_DELETED]
  ),
]

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODES.includes(value as ThemeMode)
}

export function isValidThemeScope(value: unknown): value is ThemeScope {
  return typeof value === 'string' && THEME_SCOPES.includes(value as ThemeScope)
}

export function isValidThemeStatus(value: unknown): value is ThemeStatus {
  return typeof value === 'number' && THEME_STATUSES.includes(value as ThemeStatus)
}

export function getCreateThemeStatus(req: FastifyRequest): ThemeStatus {
  return isUserRole(req) ? THEME_STATUS_DRAFT : THEME_STATUS_ACTIVE
}

export function getThemeScope(req: FastifyRequest, requestedScope?: ThemeScope): ThemeScope {
  return getScope(req, requestedScope)
}

export function getThemeCompanyId(
  req: FastifyRequest,
  scope: ThemeScope,
  requestedCompanyId?: number | null
): number | null {
  return getScopedCompanyId(req, scope, requestedCompanyId)
}

export function canReadTheme(theme: ThemeAccessRow, req: FastifyRequest): boolean {
  return canReadScoped(theme, req)
}

export function canEditTheme(theme: ThemeAccessRow, req: FastifyRequest): boolean {
  return canEditScoped(theme, req)
}

export async function getThemeAccessRow(themeId: number): Promise<ThemeAccessRow | null> {
  const theme = await db('themes')
    .select('id', 'scope', 'company_id', 'status')
    .where({ id: themeId })
    .first()

  return theme ? (theme as ThemeAccessRow) : null
}

export function buildThemeStatusPatch(status: ThemeStatus) {
  return {
    status,
    updated_at: db.fn.now(),
    deleted_at: status === THEME_STATUS_DELETED ? db.fn.now() : null,
  }
}
