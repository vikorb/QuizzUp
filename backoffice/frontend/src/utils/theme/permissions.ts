import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  THEME_SCOPE_COMPANY,
  THEME_STATUS_DELETED,
} from '@quizzup/shared'

import type { Theme } from '@/types/theme'

export function canCreateTheme(role: string | null | undefined): boolean {
  return (
    role === ADMIN_ROLE_SUPERADMIN ||
    role === ADMIN_ROLE_ADMIN ||
    role === ADMIN_ROLE_USER
  )
}

export function canUpdateTheme(
  theme: Theme,
  role: string | null | undefined,
): boolean {
  if (theme.status === THEME_STATUS_DELETED) {
    return false
  }

  if (theme.canEdit !== undefined) {
    return theme.canEdit
  }

  if (role === ADMIN_ROLE_SUPERADMIN) {
    return true
  }

  if (role === ADMIN_ROLE_ADMIN) {
    return theme.scope === THEME_SCOPE_COMPANY
  }

  return false
}

export function canDeleteTheme(
  theme: Theme,
  role: string | null | undefined,
): boolean {
  return canUpdateTheme(theme, role)
}

export function canUpdateThemeStatus(
  theme: Theme,
  role: string | null | undefined,
): boolean {
  return canUpdateTheme(theme, role)
}
