import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  THEME_MODE_CLASSIC,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUS_INACTIVE,
} from '@quizzup/shared'
import {
  buildThemeStatusPatch,
  canEditTheme,
  canReadTheme,
  getCreateThemeStatus,
  getThemeCompanyId,
  getThemeScope,
  isValidThemeMode,
  isValidThemeScope,
  isValidThemeStatus,
  parseOptionalNumber,
  parsePositiveId,
  type ThemeAccessRow,
} from '@backend/routes/themes/_shared'
import { MOCK_NOW } from '../_helpers/mockDb'
import { companyAdminUser, companyUser, superadminUser, type TestUser } from '../_helpers/testApp'

function asRequest(user: TestUser): Parameters<typeof getThemeScope>[0] {
  return { user } as unknown as Parameters<typeof getThemeScope>[0]
}

function themeRow(overrides: Partial<ThemeAccessRow>): ThemeAccessRow {
  return {
    id: 1,
    scope: THEME_SCOPE_GLOBAL,
    company_id: null,
    status: THEME_STATUS_ACTIVE,
    ...overrides,
  }
}

describe('routes/themes/_shared.ts', () => {
  describe('getThemeScope', () => {
    it('honours the requested scope for superadmins', () => {
      expect(getThemeScope(asRequest(superadminUser), THEME_SCOPE_COMPANY)).toBe(
        THEME_SCOPE_COMPANY
      )
    })

    it('defaults superadmins to the global scope', () => {
      expect(getThemeScope(asRequest(superadminUser))).toBe(THEME_SCOPE_GLOBAL)
    })

    it('forces the company scope for non-superadmins', () => {
      expect(getThemeScope(asRequest(companyAdminUser), THEME_SCOPE_GLOBAL)).toBe(
        THEME_SCOPE_COMPANY
      )
    })
  })

  describe('getThemeCompanyId', () => {
    it('returns null for a global scope', () => {
      expect(getThemeCompanyId(asRequest(superadminUser), THEME_SCOPE_GLOBAL, 9)).toBeNull()
    })

    it('lets superadmins target any company', () => {
      expect(getThemeCompanyId(asRequest(superadminUser), THEME_SCOPE_COMPANY, 9)).toBe(9)
    })

    it('pins non-superadmins to their own company', () => {
      expect(getThemeCompanyId(asRequest(companyAdminUser), THEME_SCOPE_COMPANY, 9)).toBe(1)
    })
  })

  describe('getCreateThemeStatus', () => {
    it('drafts themes created by a plain user', () => {
      expect(getCreateThemeStatus(asRequest(companyUser))).toBe(THEME_STATUS_DRAFT)
    })

    it('activates themes created by admins and superadmins', () => {
      expect(getCreateThemeStatus(asRequest(companyAdminUser))).toBe(THEME_STATUS_ACTIVE)
      expect(getCreateThemeStatus(asRequest(superadminUser))).toBe(THEME_STATUS_ACTIVE)
    })
  })

  describe('canReadTheme (role x scope matrix)', () => {
    it('lets a superadmin read anything', () => {
      expect(
        canReadTheme(
          themeRow({ scope: THEME_SCOPE_COMPANY, company_id: 2 }),
          asRequest(superadminUser)
        )
      ).toBe(true)
    })

    it('lets everyone read a global theme', () => {
      expect(
        canReadTheme(themeRow({ scope: THEME_SCOPE_GLOBAL }), asRequest(companyAdminUser))
      ).toBe(true)
    })

    it('lets an admin read their own company theme', () => {
      expect(
        canReadTheme(
          themeRow({ scope: THEME_SCOPE_COMPANY, company_id: 1 }),
          asRequest(companyAdminUser)
        )
      ).toBe(true)
    })

    it('blocks reading another company theme', () => {
      expect(
        canReadTheme(
          themeRow({ scope: THEME_SCOPE_COMPANY, company_id: 2 }),
          asRequest(companyAdminUser)
        )
      ).toBe(false)
    })
  })

  describe('canEditTheme (role x scope matrix)', () => {
    it('lets a superadmin edit a global theme', () => {
      expect(canEditTheme(themeRow({ scope: THEME_SCOPE_GLOBAL }), asRequest(superadminUser))).toBe(
        true
      )
    })

    it('blocks an admin from editing a global theme', () => {
      expect(
        canEditTheme(themeRow({ scope: THEME_SCOPE_GLOBAL }), asRequest(companyAdminUser))
      ).toBe(false)
    })

    it('lets an admin edit their own company theme', () => {
      expect(
        canEditTheme(
          themeRow({ scope: THEME_SCOPE_COMPANY, company_id: 1 }),
          asRequest(companyAdminUser)
        )
      ).toBe(true)
    })

    it('blocks an admin from editing another company theme', () => {
      expect(
        canEditTheme(
          themeRow({ scope: THEME_SCOPE_COMPANY, company_id: 2 }),
          asRequest(companyAdminUser)
        )
      ).toBe(false)
    })
  })

  describe('validators', () => {
    it('validates theme modes', () => {
      expect(isValidThemeMode(THEME_MODE_CLASSIC)).toBe(true)
      expect(isValidThemeMode('nope')).toBe(false)
    })

    it('validates theme scopes', () => {
      expect(isValidThemeScope(THEME_SCOPE_COMPANY)).toBe(true)
      expect(isValidThemeScope('nope')).toBe(false)
    })

    it('validates theme statuses', () => {
      expect(isValidThemeStatus(THEME_STATUS_DRAFT)).toBe(true)
      expect(isValidThemeStatus(99)).toBe(false)
      expect(isValidThemeStatus('1')).toBe(false)
    })
  })

  describe('buildThemeStatusPatch', () => {
    it('stamps deleted_at only when the theme is soft-deleted', () => {
      expect(buildThemeStatusPatch(THEME_STATUS_DELETED)).toEqual({
        status: THEME_STATUS_DELETED,
        updated_at: MOCK_NOW,
        deleted_at: MOCK_NOW,
      })

      expect(buildThemeStatusPatch(THEME_STATUS_INACTIVE)).toEqual({
        status: THEME_STATUS_INACTIVE,
        updated_at: MOCK_NOW,
        deleted_at: null,
      })
    })
  })

  describe('number parsers', () => {
    it('parses optional numbers', () => {
      expect(parseOptionalNumber('')).toBeNull()
      expect(parseOptionalNumber(undefined)).toBeNull()
      expect(parseOptionalNumber('3')).toBe(3)
      expect(parseOptionalNumber('1.5')).toBeNull()
    })

    it('parses positive ids only', () => {
      expect(parsePositiveId('4')).toBe(4)
      expect(parsePositiveId('0')).toBeNull()
      expect(parsePositiveId('-2')).toBeNull()
      expect(parsePositiveId('x')).toBeNull()
    })
  })
})
