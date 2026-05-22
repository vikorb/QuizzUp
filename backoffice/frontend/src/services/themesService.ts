import type { ThemeStatus } from '@quizzup/shared'

import type { ApiResult } from '@/types/api'
import type { Theme, ThemeFilters, ThemePayload } from '@/types/theme'
import { apiRequestJson } from '@/utils/api'

type ThemesResponse = {
  themes: Theme[]
}

type ThemeResponse = {
  theme: Theme
}

export type ThemesResult = ApiResult<ThemesResponse>
export type ThemeResult = ApiResult<ThemeResponse>

export type ThemeStatusUpdateResult =
  | {
      ok: true
      theme: Theme
    }
  | {
      ok: false
      error: string
    }

function buildThemesQuery(filters: ThemeFilters = {}): string {
  const searchParams = new URLSearchParams()

  if (filters.search?.trim()) {
    searchParams.set('search', filters.search.trim())
  }

  if (filters.mode) {
    searchParams.set('mode', filters.mode)
  }

  if (filters.status) {
    searchParams.set('status', filters.status)
  }

  if (filters.scope) {
    searchParams.set('scope', filters.scope)
  }

  const query = searchParams.toString()

  return query ? `?${query}` : ''
}

export async function listThemesService(
  filters: ThemeFilters = {},
): Promise<ThemesResult> {
  return apiRequestJson<ThemesResponse>({
    path: `/themes${buildThemesQuery(filters)}`,
    authenticated: true,
  })
}

export async function loadThemeService(themeId: number): Promise<ThemeResult> {
  return apiRequestJson<ThemeResponse>({
    path: `/themes/${themeId}`,
    authenticated: true,
  })
}

export async function createThemeService(payload: ThemePayload): Promise<ThemeResult> {
  return apiRequestJson<ThemeResponse>({
    path: '/themes',
    method: 'POST',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function updateThemeService(
  themeId: number,
  payload: ThemePayload,
): Promise<ThemeResult> {
  return apiRequestJson<ThemeResponse>({
    path: `/themes/${themeId}`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function updateThemeStatusService(
  themeId: number,
  status: ThemeStatus,
): Promise<ThemeStatusUpdateResult> {
  const result = await apiRequestJson<ThemeResponse>({
    path: `/themes/${themeId}/status`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    }
  }

  return {
    ok: true,
    theme: result.data.theme,
  }
}

export async function deleteThemeService(themeId: number): Promise<ThemeResult> {
  return apiRequestJson<ThemeResponse>({
    path: `/themes/${themeId}`,
    method: 'DELETE',
    authenticated: true,
  })
}
