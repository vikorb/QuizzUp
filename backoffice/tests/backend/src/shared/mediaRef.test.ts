import { QUESTION_MEDIA_REF_MAX_LENGTH, QUESTION_MEDIA_REF_PATTERN } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

describe('QUESTION_MEDIA_REF_PATTERN', () => {
  it.each(['1', '123456', '9'.repeat(QUESTION_MEDIA_REF_MAX_LENGTH)])('accepts %s', (ref) => {
    expect(QUESTION_MEDIA_REF_PATTERN.test(ref)).toBe(true)
  })

  it.each([
    '',
    'abc',
    '12a',
    '-1',
    '1.5',
    ' 12',
    '12\n',
    '12/../x',
    '9'.repeat(QUESTION_MEDIA_REF_MAX_LENGTH + 1),
  ])('refuses %j', (ref) => {
    expect(QUESTION_MEDIA_REF_PATTERN.test(ref)).toBe(false)
  })

  it('can be called again and again (no state kept between calls)', () => {
    expect(QUESTION_MEDIA_REF_PATTERN.test('42')).toBe(true)
    expect(QUESTION_MEDIA_REF_PATTERN.test('42')).toBe(true)
  })
})
