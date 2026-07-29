import '../_helpers/registerRouteMocks'

import { describe, expect, it } from 'vitest'

import {
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import {
  getQuestionCompanyId,
  getQuestionScope,
  hasInvalidAnswerStatus,
  normalizeAnswers,
  parseQuestionThemeIds,
  validateAnswers,
} from '@backend/routes/questions/_shared'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { companyAdminUser, superadminUser, type TestUser } from '../_helpers/testApp'

resetRouteMocksBeforeEach()

function asRequest(user: TestUser): Parameters<typeof getQuestionScope>[0] {
  return { user } as unknown as Parameters<typeof getQuestionScope>[0]
}

describe('routes/questions/_shared.ts', () => {
  describe('validateAnswers', () => {
    it('requires at least two answers', () => {
      expect(validateAnswers(normalizeAnswers([{ response: 'a', isCorrect: true }]))).toBe(
        'question_answers_min_required'
      )
    })

    it('requires every answer to have a response', () => {
      expect(
        validateAnswers(
          normalizeAnswers([
            { response: 'a', isCorrect: true },
            { response: '  ', isCorrect: false },
          ])
        )
      ).toBe('question_answer_required')
    })

    it('requires exactly one correct answer', () => {
      expect(
        validateAnswers(
          normalizeAnswers([
            { response: 'a', isCorrect: true },
            { response: 'b', isCorrect: true },
          ])
        )
      ).toBe('question_one_correct_answer_required')
    })

    it('accepts a valid set of answers', () => {
      expect(
        validateAnswers(
          normalizeAnswers([
            { response: 'a', isCorrect: true },
            { response: 'b', isCorrect: false },
          ])
        )
      ).toBeNull()
    })
  })

  describe('normalizeAnswers', () => {
    it('trims responses, reads is_correct aliases and keeps answer ids', () => {
      expect(
        normalizeAnswers([
          { id: 7, response: '  hello  ', is_correct: true },
          { response: 'world', isCorrect: false },
        ])
      ).toEqual([
        { id: 7, response: 'hello', isCorrect: true, status: undefined },
        { id: undefined, response: 'world', isCorrect: false, status: undefined },
      ])
    })
  })

  describe('hasInvalidAnswerStatus', () => {
    it('flags a client-provided status that is not a valid answer status', () => {
      expect(
        hasInvalidAnswerStatus(normalizeAnswers([{ response: 'a', isCorrect: true, status: 99 }]))
      ).toBe(true)
    })

    it('accepts a valid status or no status at all', () => {
      expect(
        hasInvalidAnswerStatus(
          normalizeAnswers([
            { response: 'a', isCorrect: true, status: ANSWER_STATUS_ACTIVE },
            { response: 'b', isCorrect: false, status: ANSWER_STATUS_DELETED },
            { response: 'c', isCorrect: false },
          ])
        )
      ).toBe(false)
    })
  })

  describe('parseQuestionThemeIds', () => {
    it('deduplicates and coerces the themeIds array', () => {
      expect(parseQuestionThemeIds({ themeIds: [1, 2, 2, '3'] })).toEqual([1, 2, 3])
    })

    it('falls back to the single themeId when themeIds is empty', () => {
      expect(parseQuestionThemeIds({ themeIds: [], themeId: 7 })).toEqual([7])
    })

    it('drops non-positive and non-numeric ids', () => {
      expect(parseQuestionThemeIds({ themeIds: [0, -1, 'x', 4] })).toEqual([4])
    })

    it('returns an empty array when nothing is provided', () => {
      expect(parseQuestionThemeIds({})).toEqual([])
    })
  })

  describe('getQuestionScope', () => {
    it('honours the requested scope for superadmins', () => {
      expect(getQuestionScope(asRequest(superadminUser), THEME_SCOPE_COMPANY)).toBe(
        THEME_SCOPE_COMPANY
      )
    })

    it('defaults superadmins to the global scope', () => {
      expect(getQuestionScope(asRequest(superadminUser))).toBe(THEME_SCOPE_GLOBAL)
    })

    it('forces the company scope for non-superadmins', () => {
      expect(getQuestionScope(asRequest(companyAdminUser), THEME_SCOPE_GLOBAL)).toBe(
        THEME_SCOPE_COMPANY
      )
    })
  })

  describe('getQuestionCompanyId', () => {
    it('returns null for a global scope', () => {
      expect(getQuestionCompanyId(asRequest(superadminUser), THEME_SCOPE_GLOBAL, 9)).toBeNull()
    })

    it('lets superadmins target any company', () => {
      expect(getQuestionCompanyId(asRequest(superadminUser), THEME_SCOPE_COMPANY, 9)).toBe(9)
    })

    it('pins non-superadmins to their own company', () => {
      expect(getQuestionCompanyId(asRequest(companyAdminUser), THEME_SCOPE_COMPANY, 9)).toBe(1)
    })
  })
})
