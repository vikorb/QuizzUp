import type { FastifyRequest } from 'fastify'

import {
  ADMIN_ROLE_USER,
  THEME_MODES,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_SCOPES,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUSES,
  type AdminRole,
  type ThemeMode,
  type ThemeScope,
  type ThemeStatus,
} from '@quizzup/shared'
import db from '../../db'
import { getCurrentCompanyId, isSuperadmin } from '../../security/companiesPolicy'

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
  return isSuperadmin(req) ? requestedScope ?? THEME_SCOPE_GLOBAL : THEME_SCOPE_COMPANY
}

export function getThemeCompanyId(
  req: FastifyRequest,
  scope: ThemeScope,
  requestedCompanyId?: number | null,
): number | null {
  if (scope === THEME_SCOPE_GLOBAL) {
    return null
  }

  return isSuperadmin(req) ? requestedCompanyId ?? null : getCurrentCompanyId(req)
}

export function canReadTheme(theme: ThemeAccessRow, req: FastifyRequest): boolean {
  const currentCompanyId = getCurrentCompanyId(req)

  return (
    isSuperadmin(req) ||
    theme.scope === THEME_SCOPE_GLOBAL ||
    (theme.scope === THEME_SCOPE_COMPANY && theme.company_id === currentCompanyId)
  )
}

export function canEditTheme(theme: ThemeAccessRow, req: FastifyRequest): boolean {
  const currentCompanyId = getCurrentCompanyId(req)

  return (
    isSuperadmin(req) ||
    (theme.scope === THEME_SCOPE_COMPANY && theme.company_id === currentCompanyId)
  )
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
