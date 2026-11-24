import { describe, expect, it } from 'vitest'

import { parseCorsOrigin, parsePublicOrigins } from '../../../../backend/src/utils/cors'

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

describe('utils/cors parsePublicOrigins', () => {
  it('returns nothing when both variables are empty or unset', () => {
    expect(parsePublicOrigins(undefined, undefined)).toEqual([])
    expect(parsePublicOrigins('', '  ')).toEqual([])
  })

  it('keeps VITRINE_ORIGINS and adds the origin of PUBLIC_APP_URL, path and slash dropped', () => {
    expect(
      parsePublicOrigins(' https://vitrine.example.org , ', 'https://app.example.org/rejoindre/')
    ).toEqual(['https://vitrine.example.org', 'https://app.example.org'])
    expect(parsePublicOrigins('', 'http://localhost:4173')).toEqual(['http://localhost:4173'])
  })

  it('adds no duplicate when PUBLIC_APP_URL is already listed', () => {
    expect(parsePublicOrigins('https://app.example.org', 'https://app.example.org/')).toEqual([
      'https://app.example.org',
    ])
  })

  it('ignores a PUBLIC_APP_URL that is not a URL or has no origin', () => {
    expect(parsePublicOrigins('https://vitrine.example.org', 'not a url')).toEqual([
      'https://vitrine.example.org',
    ])
    expect(parsePublicOrigins('', 'data:text/plain,hello')).toEqual([])
    expect(parsePublicOrigins('', '/relative/path')).toEqual([])
  })
})
