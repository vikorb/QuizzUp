import type { FastifyRequest } from 'fastify'

import {
  QUESTION_MEDIA_PROVIDER_DEEZER,
  QUESTION_STATUS_DELETED,
  THEME_MODE_AUDIO,
  THEME_MODES,
  THEME_PLAYLIST_MIN_PLAYABLE_TRACKS,
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
  getProviderPlaylistTracks,
  MediaProviderUnavailableError,
  providerRefSchema,
} from '../../services/mediaProvider'
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
  playlistRef?: string | null
  kidsFriendly?: boolean
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
  mode: ThemeMode
  playlist_ref: string | null
}

export const themeSelect = [
  'themes.id',
  'themes.admin_id as adminId',
  'themes.company_id as companyId',
  'themes.scope',
  'themes.name',
  'themes.mode',
  'themes.playlist_ref as playlistRef',
  'themes.kids_friendly as kidsFriendly',
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

/** `kidsFriendly` est facultatif ; s'il est présent, c'est un booléen. */
export function isValidKidsFriendly(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean'
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
    .select('id', 'scope', 'company_id', 'status', 'mode', 'playlist_ref')
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

type ThemePlaylistError = { status: 400 | 422 | 502; error: string }

/**
 * Contrôle un `playlistRef` demandé avant de l'enregistrer : forme, mode `audio`, playlist connue
 * du fournisseur avec assez de titres jouables. Appel réseau : à faire hors transaction. `null` si
 * tout est bon.
 */
export async function checkThemePlaylist(
  req: FastifyRequest,
  playlistRef: string,
  mode: ThemeMode
): Promise<ThemePlaylistError | null> {
  if (!providerRefSchema.safeParse(playlistRef).success) {
    return { status: 400, error: 'theme_playlist_ref_invalid' }
  }

  if (mode !== THEME_MODE_AUDIO) {
    return { status: 400, error: 'theme_playlist_mode_invalid' }
  }

  try {
    const tracks = await getProviderPlaylistTracks(playlistRef)

    if (!tracks) {
      return { status: 422, error: 'theme_playlist_not_found' }
    }

    const playable = tracks.filter((track) => track.readable && track.previewUrl !== null)

    return playable.length < THEME_PLAYLIST_MIN_PLAYABLE_TRACKS
      ? { status: 422, error: 'theme_playlist_too_small' }
      : null
  } catch (error) {
    if (error instanceof MediaProviderUnavailableError) {
      req.log.warn({ err: error }, 'media provider unavailable')

      return { status: 502, error: 'media_provider_unavailable' }
    }

    throw error
  }
}

/** Colonnes de la playlist ; `null` efface. */
export function buildThemePlaylistPatch(playlistRef: string | null) {
  return {
    playlist_provider: playlistRef === null ? null : QUESTION_MEDIA_PROVIDER_DEEZER,
    playlist_ref: playlistRef,
  }
}
