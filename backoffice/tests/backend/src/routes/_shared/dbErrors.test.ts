import { describe, expect, it } from 'vitest'

import { isUniqueViolation } from '@backend/routes/_shared/dbErrors'

describe('routes/_shared/dbErrors.ts', () => {
  it('detects PostgreSQL unique violations only', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})
