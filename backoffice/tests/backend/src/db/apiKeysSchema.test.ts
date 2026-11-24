import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { API_KEY_STATUSES, API_KEY_TOKEN_PREFIX } from '@quizzup/shared'

/** Les contraintes de la migration de l'API de réservation restent alignées sur `@quizzup/shared`. */
const migration = readFileSync(
  path.resolve(process.cwd(), 'backend/db/migrations/20261124070000_create_public_booking_api.js'),
  'utf8'
)
const up = migration.slice(0, migration.indexOf('exports.down'))
const down = migration.slice(migration.indexOf('exports.down'))

describe('public booking API migration', () => {
  it('aligns the api_keys status CHECK with API_KEY_STATUSES', () => {
    const listed = /status IN \(([^)]*)\)/.exec(up)?.[1] ?? ''

    expect(listed.split(',').map((value) => Number(value.trim()))).toEqual([...API_KEY_STATUSES])
  })

  it('fits the generated token prefix (qzk_ + 8 characters) in key_prefix', () => {
    const length = Number(/table\.string\('key_prefix', (\d+)\)/.exec(up)?.[1])

    expect(length).toBeGreaterThanOrEqual(API_KEY_TOKEN_PREFIX.length + 8)
  })

  it('stores a SHA-256 hash (64 hex characters) and nothing else of the key', () => {
    expect(up).toContain("table.specificType('key_hash', 'char(64)')")
    expect(up).toContain("table.specificType('request_hash', 'char(64)')")
    expect(up).not.toMatch(/'(secret|token|email|ip)'/)
  })

  it('keeps a safe rollback for the games columns', () => {
    expect(down).toContain('Rollback impossible')
    expect(down).toContain("whereNull('admin_id')")
    expect(down).toContain("NotNull('api_key_id')")
  })

  it('fails fast instead of queueing behind a lock on games', () => {
    expect(up.indexOf("SET LOCAL lock_timeout = '5s'")).toBeGreaterThan(-1)
    expect(up.indexOf("SET LOCAL lock_timeout = '5s'")).toBeLessThan(up.indexOf('createTable'))
  })
})
