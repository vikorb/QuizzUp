import { describe, expect, it, vi } from 'vitest'

import { PLAYER_EMAIL_RETENTION_YEARS } from '@quizzup/shared'
import {
  PLAYER_EMAIL_PURGE_LOCK_KEY,
  getPlayerEmailRetentionCutoff,
  purgeExpiredPlayerEmails,
} from '@backend/jobs/purgePlayerEmails'

// La sémantique de la purge (compagnies, casse, 2e joueur, dates) est vérifiée sur un vrai
// PostgreSQL dans `purgePlayerEmails.pg.test.ts` ; ici, la date limite et l'enchaînement SQL.

const NOW = new Date('2026-11-04T12:00:00.000Z')

describe('PLAYER_EMAIL_RETENTION_YEARS', () => {
  it('vaut 3 ans (décision produit)', () => {
    expect(PLAYER_EMAIL_RETENTION_YEARS).toBe(3)
  })
})

describe('getPlayerEmailRetentionCutoff', () => {
  it('recule de 3 ans par défaut, à la milliseconde près', () => {
    expect(getPlayerEmailRetentionCutoff(NOW).toISOString()).toBe('2023-11-04T12:00:00.000Z')
  })

  it('accepte une autre durée', () => {
    expect(getPlayerEmailRetentionCutoff(NOW, 1).toISOString()).toBe('2025-11-04T12:00:00.000Z')
  })

  it('ne modifie pas la date reçue', () => {
    const now = new Date(NOW)
    getPlayerEmailRetentionCutoff(now)

    expect(now.toISOString()).toBe(NOW.toISOString())
  })

  it('recule le 29 février au 28 février quand l’année cible n’est pas bissextile', () => {
    expect(getPlayerEmailRetentionCutoff(new Date('2028-02-29T10:30:00.000Z')).toISOString()).toBe(
      '2025-02-28T10:30:00.000Z'
    )
  })

  it('garde le 29 février quand l’année cible est bissextile', () => {
    expect(
      getPlayerEmailRetentionCutoff(new Date('2028-02-29T10:30:00.000Z'), 4).toISOString()
    ).toBe('2024-02-29T10:30:00.000Z')
  })

  it('ne touche pas aux autres fins de mois', () => {
    expect(getPlayerEmailRetentionCutoff(new Date('2026-03-01T00:00:00.000Z')).toISOString()).toBe(
      '2023-03-01T00:00:00.000Z'
    )
    expect(getPlayerEmailRetentionCutoff(new Date('2026-02-28T23:59:59.999Z')).toISOString()).toBe(
      '2023-02-28T23:59:59.999Z'
    )
  })
})

describe('purgeExpiredPlayerEmails (enchaînement SQL)', () => {
  function fakeKnex(rowCounts: Array<number | null | undefined>) {
    const calls: Array<{ sql: string; bindings: unknown }> = []
    let updates = 0
    const raw = vi.fn((sql: string, bindings?: unknown) => {
      calls.push({ sql, bindings })

      if (sql.includes('pg_advisory_xact_lock')) {
        return Promise.resolve({ rowCount: 1 })
      }

      return Promise.resolve({ rowCount: rowCounts[updates++] })
    })
    const transaction = vi.fn(async (callback: (trx: { raw: typeof raw }) => Promise<number>) =>
      callback({ raw })
    )

    return {
      db: { transaction } as unknown as Parameters<typeof purgeExpiredPlayerEmails>[0],
      calls,
      transaction,
    }
  }

  it('prend le verrou consultatif avant toute modification, dans une seule transaction', async () => {
    const { db, calls, transaction } = fakeKnex([0, 0])

    await purgeExpiredPlayerEmails(db, NOW)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(3)
    expect(calls[0].sql).toContain('pg_advisory_xact_lock')
    expect(calls[0].bindings).toEqual([PLAYER_EMAIL_PURGE_LOCK_KEY])
  })

  it('lance deux UPDATE : 1er joueur puis 2e joueur, avec la date limite et la date courante', async () => {
    const { db, calls } = fakeKnex([0, 0])

    await purgeExpiredPlayerEmails(db, NOW)

    const [, first, second] = calls
    const bindings = { cutoff: new Date('2023-11-04T12:00:00.000Z'), now: NOW }

    expect(first.sql).toMatch(/UPDATE game_participants[\s\S]*SET email = NULL, consent_at = NULL/)
    expect(second.sql).toMatch(
      /UPDATE game_participants[\s\S]*SET second_email = NULL, second_consent_at = NULL/
    )
    expect(first.bindings).toEqual(bindings)
    expect(second.bindings).toEqual(bindings)
  })

  it('regroupe par compagnie et par email normalisé, sur les deux colonnes email', async () => {
    const { db, calls } = fakeKnex([0, 0])

    await purgeExpiredPlayerEmails(db, NOW)

    for (const { sql } of calls.slice(1)) {
      expect(sql).toContain('GROUP BY company_id, email_key')
      expect(sql).toContain('HAVING max(played_at) < :cutoff')
      expect(sql).toContain('UNION ALL')
      expect(sql).toContain('lower(btrim(gp.email))')
      expect(sql).toContain('lower(btrim(gp.second_email))')
      expect(sql).toContain('COALESCE(g.finished_at, g.started_at, g.created_at)')
      expect(sql).toContain('e.company_id = g.company_id')
    }
  })

  it('n’efface que l’email et le consentement (ni nom ni score)', async () => {
    const { db, calls } = fakeKnex([0, 0])

    await purgeExpiredPlayerEmails(db, NOW)

    for (const { sql } of calls.slice(1)) {
      expect(sql).not.toMatch(/display_name\s*=/)
      expect(sql).not.toMatch(/score\s*=/)
    }
  })

  it('renvoie le total des lignes modifiées par les deux UPDATE', async () => {
    const { db } = fakeKnex([3, 2])

    await expect(purgeExpiredPlayerEmails(db, NOW)).resolves.toBe(5)
  })

  it('compte 0 quand le pilote ne renvoie pas de rowCount', async () => {
    const { db } = fakeKnex([null, undefined])

    await expect(purgeExpiredPlayerEmails(db, NOW)).resolves.toBe(0)
  })

  it('utilise la date courante par défaut', async () => {
    const { db, calls } = fakeKnex([0, 0])
    const before = Date.now()

    await purgeExpiredPlayerEmails(db)

    const { now } = calls[1].bindings as { now: Date }

    expect(now.getTime()).toBeGreaterThanOrEqual(before)
    expect(now.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('propage une erreur SQL (la transaction est alors annulée par Knex)', async () => {
    const { db } = fakeKnex([0, 0])
    const failing = {
      transaction: async (cb: (trx: { raw: () => Promise<never> }) => unknown) =>
        cb({ raw: () => Promise.reject(new Error('boom')) }),
    } as unknown as typeof db

    await expect(purgeExpiredPlayerEmails(failing, NOW)).rejects.toThrow('boom')
  })
})
