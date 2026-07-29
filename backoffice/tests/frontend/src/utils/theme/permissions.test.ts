import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import type { Theme } from '@/types/theme'
import {
  canCreateTheme,
  canDeleteTheme,
  canUpdateTheme,
  canUpdateThemeStatus,
} from '@/utils/theme/permissions'

function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 1,
    adminId: 1,
    companyId: 1,
    scope: THEME_SCOPE_COMPANY,
    name: 'Theme',
    mode: 'classic',
    status: THEME_STATUS_ACTIVE,
    ...overrides,
  }
}

describe('utils/theme/permissions', () => {
  describe('canCreateTheme', () => {
    it('allows every known authenticated role', () => {
      expect(canCreateTheme(ADMIN_ROLE_SUPERADMIN)).toBe(true)
      expect(canCreateTheme(ADMIN_ROLE_ADMIN)).toBe(true)
      expect(canCreateTheme(ADMIN_ROLE_USER)).toBe(true)
    })

    it('rejects an unknown or missing role', () => {
      expect(canCreateTheme('ghost')).toBe(false)
      expect(canCreateTheme(null)).toBe(false)
      expect(canCreateTheme(undefined)).toBe(false)
    })
  })

  describe('canUpdateTheme (role x scope x status matrix)', () => {
    it('never allows editing a soft-deleted theme, whatever the role', () => {
      const deleted = makeTheme({ status: THEME_STATUS_DELETED })

      expect(canUpdateTheme(deleted, ADMIN_ROLE_SUPERADMIN)).toBe(false)
      expect(canUpdateTheme(deleted, ADMIN_ROLE_ADMIN)).toBe(false)
    })

    it('lets a superadmin edit any live theme', () => {
      expect(canUpdateTheme(makeTheme({ scope: THEME_SCOPE_GLOBAL }), ADMIN_ROLE_SUPERADMIN)).toBe(
        true
      )
      expect(canUpdateTheme(makeTheme({ scope: THEME_SCOPE_COMPANY }), ADMIN_ROLE_SUPERADMIN)).toBe(
        true
      )
      expect(canUpdateTheme(makeTheme({ status: THEME_STATUS_DRAFT }), ADMIN_ROLE_SUPERADMIN)).toBe(
        true
      )
    })

    it('lets an admin edit only company-scoped themes', () => {
      expect(canUpdateTheme(makeTheme({ scope: THEME_SCOPE_COMPANY }), ADMIN_ROLE_ADMIN)).toBe(true)
      expect(canUpdateTheme(makeTheme({ scope: THEME_SCOPE_GLOBAL }), ADMIN_ROLE_ADMIN)).toBe(false)
    })

    it('never lets a plain user or unknown role edit', () => {
      expect(canUpdateTheme(makeTheme({ scope: THEME_SCOPE_COMPANY }), ADMIN_ROLE_USER)).toBe(false)
      expect(canUpdateTheme(makeTheme({ scope: THEME_SCOPE_COMPANY }), null)).toBe(false)
    })
  })

  describe('canDeleteTheme / canUpdateThemeStatus', () => {
    it('mirror the update permission', () => {
      const companyTheme = makeTheme({ scope: THEME_SCOPE_COMPANY })
      const globalTheme = makeTheme({ scope: THEME_SCOPE_GLOBAL })

      expect(canDeleteTheme(companyTheme, ADMIN_ROLE_ADMIN)).toBe(true)
      expect(canDeleteTheme(globalTheme, ADMIN_ROLE_ADMIN)).toBe(false)
      expect(canUpdateThemeStatus(companyTheme, ADMIN_ROLE_ADMIN)).toBe(true)
      expect(canUpdateThemeStatus(globalTheme, ADMIN_ROLE_ADMIN)).toBe(false)
    })
  })
})
