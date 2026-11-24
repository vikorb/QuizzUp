import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  VOUCHER_CODE_PATTERN,
  VOUCHER_LABEL_MAX_LENGTH,
  VOUCHER_STATUSES,
  VOUCHER_VALIDITY_DEFAULT_DAYS,
  VOUCHER_VALIDITY_MAX_DAYS,
  VOUCHER_VALIDITY_MIN_DAYS,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

/** Les contraintes de la migration `vouchers` restent alignées sur les constantes partagées. */
const migration = readFileSync(
  path.resolve(process.cwd(), 'backend/db/migrations/20261124030100_create_vouchers.js'),
  'utf8'
  // Sous Windows, git peut rendre le fichier en CRLF : le test compare des lignes en LF.
).replaceAll('\r\n', '\n')

describe('vouchers migration', () => {
  it('aligns the validity bounds and the default with the shared constants', () => {
    expect(migration).toContain(
      `CHECK (voucher_validity_days BETWEEN ${VOUCHER_VALIDITY_MIN_DAYS} AND ${VOUCHER_VALIDITY_MAX_DAYS})`
    )
    expect(migration).toContain(`.defaultTo(${VOUCHER_VALIDITY_DEFAULT_DAYS})`)
  })

  it('aligns the label lengths with VOUCHER_LABEL_MAX_LENGTH', () => {
    expect(migration).toContain(`table.string('voucher_label', ${VOUCHER_LABEL_MAX_LENGTH})`)
    expect(migration).toContain(`table.string('label', ${VOUCHER_LABEL_MAX_LENGTH}).notNullable()`)
  })

  it('aligns the code CHECK with VOUCHER_CODE_PATTERN', () => {
    const checked = /code ~ '([^']*)'/.exec(migration)?.[1]

    expect(checked).toBe(VOUCHER_CODE_PATTERN.source)
  })

  it('aligns the status CHECK with VOUCHER_STATUSES', () => {
    const listed = /status IN \(([^)]*)\)/.exec(migration)?.[1] ?? ''

    expect(listed.split(',').map((value) => Number(value.trim()))).toEqual([...VOUCHER_STATUSES])
  })

  it('keeps one voucher per desk among the not-deleted ones, and a unique code', () => {
    expect(migration).toContain('ON vouchers(game_id, participant_id)\n    WHERE status <> 2')
    expect(migration).toContain("table.unique(['code'], { indexName: 'vouchers_code_unique' })")
  })

  it('never deletes a voucher with its desk, game or company (RESTRICT)', () => {
    for (const table of ['companies', 'games', 'game_participants']) {
      expect(migration).toMatch(
        new RegExp(`inTable\\('${table}'\\)\\s*\\.onDelete\\('RESTRICT'\\)`)
      )
    }
  })

  it('refuses to roll back while vouchers exist', () => {
    expect(migration).toContain('Rollback impossible')
  })
})
