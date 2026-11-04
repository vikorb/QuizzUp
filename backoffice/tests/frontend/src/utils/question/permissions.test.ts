import { ADMIN_ROLE_ADMIN, ADMIN_ROLE_SUPERADMIN, ADMIN_ROLE_USER } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { canCreateQuestion } from '@/utils/question/permissions'

describe('utils/question/permissions', () => {
  describe('canCreateQuestion', () => {
    it('allows superadmin and admin only (US-PERM-01)', () => {
      expect(canCreateQuestion(ADMIN_ROLE_SUPERADMIN)).toBe(true)
      expect(canCreateQuestion(ADMIN_ROLE_ADMIN)).toBe(true)
      expect(canCreateQuestion(ADMIN_ROLE_USER)).toBe(false)
    })

    it('rejects an unknown or missing role', () => {
      expect(canCreateQuestion('ghost')).toBe(false)
      expect(canCreateQuestion(null)).toBe(false)
      expect(canCreateQuestion(undefined)).toBe(false)
    })
  })
})
