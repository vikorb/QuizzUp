import { describe, expect, it } from 'vitest'

import { parseCorsOrigin } from '../../../../backend/src/utils/cors'

describe('utils/cors parseCorsOrigin', () => {
  it('accepts every origin when unset, empty or "*"', () => {
    expect(parseCorsOrigin(undefined)).toBe(true)
    expect(parseCorsOrigin('')).toBe(true)
    expect(parseCorsOrigin('*')).toBe(true)
  })

  it('splits a comma-separated list and ignores blanks', () => {
    expect(parseCorsOrigin('http://localhost:4173')).toEqual(['http://localhost:4173'])
    expect(parseCorsOrigin(' http://localhost:4173 , http://localhost:4174, ')).toEqual([
      'http://localhost:4173',
      'http://localhost:4174',
    ])
  })
})
