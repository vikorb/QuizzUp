import { describe, expect, it } from 'vitest'

import { isExclusionViolation, isUniqueViolation } from '@backend/routes/_shared/dbErrors'

describe('routes/_shared/dbErrors.ts', () => {
  it('detects PostgreSQL unique violations only', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })

  it('detects PostgreSQL exclusion violations only, not unique ones', () => {
    expect(isExclusionViolation({ code: '23P01' })).toBe(true)
    expect(isExclusionViolation({ code: '23505' })).toBe(false)
    expect(isExclusionViolation(new Error('boom'))).toBe(false)
    expect(isExclusionViolation(null)).toBe(false)
    expect(isUniqueViolation({ code: '23P01' })).toBe(false)
  })
})
