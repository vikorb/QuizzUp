import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { API_KEY_TOKEN_PATTERN, API_KEY_TOKEN_PREFIX } from '@quizzup/shared'

import { generateApiKey, hashApiKey } from '@backend/security/apiKeys'

describe('security/apiKeys', () => {
  it('builds a qzk_<8 hex>_<43 base64url> token whose prefix is its first 12 characters', () => {
    const { token, prefix } = generateApiKey()

    expect(token).toMatch(API_KEY_TOKEN_PATTERN)
    expect(token.startsWith(API_KEY_TOKEN_PREFIX)).toBe(true)
    expect(prefix).toBe(token.slice(0, 12))
    expect(prefix).toHaveLength(12)
  })

  it('hashes the whole token with SHA-256 (64 hex characters, never the token itself)', () => {
    const { token, hash } = generateApiKey()

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(hash).toBe(hashApiKey(token))
    expect(hash).not.toContain(token)
  })

  it('gives another hash to another token, and the same hash to the same token', () => {
    expect(hashApiKey('qzk_aaaaaaaa_x')).toBe(hashApiKey('qzk_aaaaaaaa_x'))
    expect(hashApiKey('qzk_aaaaaaaa_x')).not.toBe(hashApiKey('qzk_aaaaaaaa_y'))
  })

  it('draws a different key every time', () => {
    const keys = Array.from({ length: 50 }, () => generateApiKey())

    expect(new Set(keys.map((key) => key.token)).size).toBe(50)
    expect(new Set(keys.map((key) => key.hash)).size).toBe(50)
  })
})
