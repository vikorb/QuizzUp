import path from 'node:path'

import type dbModule from '@backend/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Migration `add_marketing_consent_to_game_participants` (consentement aux offres, distinct de la
 * conservation de l'email). Test PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE, cf.
 * purgePlayerEmails.pg.test.ts) : colonnes, CHECK, `down` et absence de reprise des anciens
 * consentements.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL
const MIGRATION = '20261124010000_add_marketing_consent_to_game_participants.js'
const CONSENT_DATE = '2026-11-20T10:00:00.000Z'

type Db = typeof dbModule

describe.skipIf(!PG_INTEGRATION_URL)('consentement aux offres sur PostgreSQL', () => {
  let db: Db
  const directory = path.resolve(process.cwd(), 'backend/db/migrations')

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory })
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  beforeEach(async () => {
    await db.raw(
      'TRUNCATE game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
    )
    await db('companies').insert({ id: 1, name: 'Centre 1', email: 'c1@x.test' })
    await db('admins').insert({
      id: 1,
      company_id: 1,
      role: 'admin',
      username: 'admin1',
      email: 'admin1@x.test',
      mdp_hash: 'x',
    })
    await db('rooms').insert({ id: 1, company_id: 1, name: 'Salle 1' })
    await db('games').insert({
      id: 1,
      company_id: 1,
      room_id: 1,
      admin_id: 1,
      seed: 1,
      state: 'finished',
    })
  })

  async function columnInfo() {
    const { rows } = await db.raw(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'game_participants' AND column_name LIKE '%marketing_consent_at'
       ORDER BY column_name`
    )

    return rows as { column_name: string; data_type: string; is_nullable: string }[]
  }

  it('crée les deux colonnes, horodatées avec fuseau et nulles par défaut', async () => {
    expect(await columnInfo()).toEqual([
      {
        column_name: 'marketing_consent_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
      {
        column_name: 'second_marketing_consent_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
    ])

    await db('game_participants').insert({ game_id: 1, podium: 1, display_name: 'Léa' })

    expect(await db('game_participants').first()).toMatchObject({
      marketing_consent_at: null,
      second_marketing_consent_at: null,
    })
  })

  it('accepte le consentement aux offres d’un joueur qui a un email', async () => {
    await db('game_participants').insert({
      game_id: 1,
      podium: 1,
      display_name: 'Léa',
      email: 'lea@x.test',
      consent_at: CONSENT_DATE,
      marketing_consent_at: CONSENT_DATE,
      second_display_name: 'Noé',
      second_email: 'noe@x.test',
      second_consent_at: CONSENT_DATE,
      second_marketing_consent_at: CONSENT_DATE,
    })

    expect(await db('game_participants').first()).toMatchObject({
      marketing_consent_at: new Date(CONSENT_DATE),
      second_marketing_consent_at: new Date(CONSENT_DATE),
    })
  })

  it('refuse un consentement aux offres sans email (1er joueur)', async () => {
    await expect(
      db('game_participants').insert({
        game_id: 1,
        podium: 1,
        display_name: 'Léa',
        marketing_consent_at: CONSENT_DATE,
      })
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'game_participants_marketing_consent_email_check',
    })
  })

  it('refuse un consentement aux offres sans email (2e joueur)', async () => {
    await expect(
      db('game_participants').insert({
        game_id: 1,
        podium: 1,
        display_name: 'Léa',
        second_display_name: 'Noé',
        second_marketing_consent_at: CONSENT_DATE,
      })
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'game_participants_second_marketing_consent_email_check',
    })
  })

  it('down : refusé tant qu’un consentement aux offres existe, puis retire colonnes et CHECK', async () => {
    await db('game_participants').insert({
      game_id: 1,
      podium: 1,
      display_name: 'Léa',
      email: 'lea@x.test',
      consent_at: CONSENT_DATE,
      marketing_consent_at: CONSENT_DATE,
    })

    await expect(db.migrate.down({ directory, name: MIGRATION })).rejects.toThrow(
      /Rollback impossible/
    )
    expect(await columnInfo()).toHaveLength(2)

    await db('game_participants').update({ marketing_consent_at: null })
    await db.migrate.down({ directory, name: MIGRATION })

    expect(await columnInfo()).toEqual([])
    const { rows } = await db.raw(
      `SELECT conname FROM pg_constraint WHERE conname LIKE 'game_participants_%marketing_consent_email_check'`
    )
    expect(rows).toEqual([])
  })

  it('up après un down : les anciens consentements ne valent pas pour les offres', async () => {
    // L'état précédent le test (colonnes retirées) vient du test « down » ; on le rétablit au besoin.
    if ((await columnInfo()).length === 2) {
      await db.migrate.down({ directory, name: MIGRATION })
    }

    await db('game_participants').insert({
      game_id: 1,
      podium: 1,
      display_name: 'Léa',
      email: 'lea@x.test',
      consent_at: CONSENT_DATE,
    })

    await db.migrate.latest({ directory })

    expect(await columnInfo()).toHaveLength(2)
    expect(await db('game_participants').first()).toMatchObject({
      email: 'lea@x.test',
      consent_at: new Date(CONSENT_DATE),
      marketing_consent_at: null,
      second_marketing_consent_at: null,
    })
  })
})
