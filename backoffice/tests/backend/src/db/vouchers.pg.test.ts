import { createRequire } from 'node:module'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Migration `create_vouchers` sur PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE dont le nom finit par
 * `_test`) : `up` est joué par `migrate.latest`, `down` puis `up` dans une transaction annulée, puis
 * le `down` réel (refus tant qu'un bon existe ou qu'un centre a réglé ses bons). Les tables sont
 * vidées avant chaque test et la base est laissée au dernier niveau de migration.
 */
const require = createRequire(import.meta.url)
const migration = require(
  path.resolve(process.cwd(), 'backend/db/migrations/20261124030100_create_vouchers.js')
) as {
  up: (knex: Db) => Promise<void>
  down: (knex: Db) => Promise<void>
}

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default

const DAY_MS = 86_400_000
const CODE = '7K2M-9QXD'

describe.skipIf(!PG_INTEGRATION_URL)('create_vouchers sur PostgreSQL', () => {
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

  // Base partagée avec les autres fichiers `*.pg.test.ts` : on ne dépend pas de ce qu'ils laissent.
  beforeEach(async () => {
    await db.raw(
      'TRUNCATE vouchers, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
    )
    await db('companies').insert([
      { id: 1, name: 'Centre 1', email: 'c1@x.test' },
      { id: 2, name: 'Centre 2', email: 'c2@x.test' },
    ])
    await db('admins').insert([
      {
        id: 1,
        company_id: 1,
        role: 'admin',
        username: 'admin1',
        email: 'a1@x.test',
        mdp_hash: 'x',
      },
      { id: 3, company_id: 1, role: 'user', username: 'staff3', email: 'a3@x.test', mdp_hash: 'x' },
    ])
    await db('rooms').insert({ id: 1, company_id: 1, name: 'Salle 1' })
    await db('games').insert({
      id: 1,
      company_id: 1,
      room_id: 1,
      admin_id: 1,
      seed: 1,
      state: 'finished',
    })
    await db('game_participants').insert([
      { id: 1, game_id: 1, podium: 1, display_name: 'Léa' },
      { id: 2, game_id: 1, podium: 2, display_name: 'Noé' },
    ])
  })

  const voucher = (overrides: Record<string, unknown> = {}) => ({
    company_id: 1,
    game_id: 1,
    participant_id: 1,
    code: CODE,
    label: 'Une partie offerte',
    expires_at: new Date(Date.now() + 30 * DAY_MS),
    created_by: 1,
    ...overrides,
  })

  const ROLLBACK = new Error('rollback voulu')

  async function voucherObjects(trx: Db) {
    const { rows } = await trx.raw(`
      select
        to_regclass('vouchers') as vouchers,
        (select count(*) from information_schema.columns
          where table_name = 'companies'
            and column_name in ('voucher_label', 'voucher_validity_days')) as company_columns
    `)

    return rows[0] as { vouchers: string | null; company_columns: number }
  }

  describe('réglages des centres', () => {
    it('laisse les bons désactivés (libellé nul) et la validité à 90 jours par défaut', async () => {
      expect(
        await db('companies').where('id', 1).first('voucher_label', 'voucher_validity_days')
      ).toEqual({
        voucher_label: null,
        voucher_validity_days: 90,
      })
    })

    it('accepte une validité de 1 à 730 jours et refuse le reste', async () => {
      for (const days of [1, 730]) {
        await db('companies').where('id', 1).update({ voucher_validity_days: days })
      }

      for (const days of [0, 731, -1]) {
        await expect(
          db('companies').where('id', 1).update({ voucher_validity_days: days })
        ).rejects.toMatchObject({ code: '23514' })
      }

      await expect(
        db('companies').where('id', 1).update({ voucher_validity_days: null })
      ).rejects.toMatchObject({ code: '23502' })
    })

    it('limite le libellé à 120 caractères', async () => {
      await db('companies')
        .where('id', 1)
        .update({ voucher_label: 'x'.repeat(120) })

      await expect(
        db('companies')
          .where('id', 1)
          .update({ voucher_label: 'x'.repeat(121) })
      ).rejects.toMatchObject({ code: '22001' })
    })
  })

  describe('table vouchers', () => {
    it('applique les valeurs par défaut : actif, ni utilisé ni supprimé', async () => {
      const [row] = await db('vouchers').insert(voucher()).returning('*')

      expect(row).toMatchObject({
        status: 1,
        redeemed_at: null,
        redeemed_by: null,
        updated_at: null,
        deleted_at: null,
      })
      expect(row.created_at).toBeInstanceOf(Date)
      expect(typeof row.id).toBe('number')
      expect(typeof row.company_id).toBe('number')
    })

    it('garde un code unique, même entre deux centres', async () => {
      await db('vouchers').insert(voucher())

      await expect(
        db('vouchers').insert(voucher({ company_id: 2, participant_id: 2 }))
      ).rejects.toMatchObject({ code: '23505', constraint: 'vouchers_code_unique' })
    })

    it.each([
      ['en minuscules', '7k2m-9qxd'],
      ['sans tiret', '7K2M9QXD'],
      ['avec la lettre U', '7K2M-9QXU'],
      ['avec la lettre O', '7K2M-9QXO'],
      ['trop court', '7K2M-9QX'],
      ['trop long', '7K2M-9QXD0'],
      ['vide', ''],
    ])('refuse un code %s', async (_name, code) => {
      await expect(db('vouchers').insert(voucher({ code }))).rejects.toThrow()
    })

    it('refuse un code mal formé par la contrainte CHECK', async () => {
      await expect(db('vouchers').insert(voucher({ code: '7k2m-9qxd' }))).rejects.toMatchObject({
        code: '23514',
        constraint: 'vouchers_code_check',
      })
    })

    it('limite le libellé copié à 120 caractères et le refuse nul', async () => {
      await expect(
        db('vouchers').insert(voucher({ label: 'x'.repeat(121) }))
      ).rejects.toMatchObject({ code: '22001' })
      await expect(db('vouchers').insert(voucher({ label: null }))).rejects.toMatchObject({
        code: '23502',
      })
    })

    describe('un bon par pupitre', () => {
      it('refuse un second bon actif ou annulé pour le même pupitre de la même partie', async () => {
        await db('vouchers').insert(voucher())

        for (const status of [1, 0]) {
          await expect(
            db('vouchers').insert(voucher({ code: 'AAAA-0001', status }))
          ).rejects.toMatchObject({
            code: '23505',
            constraint: 'vouchers_game_id_participant_id_active_unique',
          })
        }

        await db('vouchers').where('code', CODE).update({ status: 0 })

        await expect(db('vouchers').insert(voucher({ code: 'AAAA-0001' }))).rejects.toMatchObject({
          constraint: 'vouchers_game_id_participant_id_active_unique',
        })
      })

      it('accepte un autre pupitre, et un nouveau bon une fois l’ancien supprimé', async () => {
        await db('vouchers').insert(voucher())
        await db('vouchers').insert(voucher({ code: 'AAAA-0001', participant_id: 2 }))

        await db('vouchers').where('code', CODE).update({ status: 2, deleted_at: db.fn.now() })

        await expect(db('vouchers').insert(voucher({ code: 'AAAA-0002' }))).resolves.toBeDefined()
      })
    })

    describe('contraintes CHECK', () => {
      it('refuse un statut inconnu', async () => {
        await expect(db('vouchers').insert(voucher({ status: 3 }))).rejects.toMatchObject({
          code: '23514',
          constraint: 'vouchers_status_check',
        })
      })

      it('lie la date de suppression au statut supprimé', async () => {
        await expect(db('vouchers').insert(voucher({ status: 2 }))).rejects.toMatchObject({
          constraint: 'vouchers_deleted_at_check',
        })
        await expect(
          db('vouchers').insert(voucher({ status: 1, deleted_at: new Date() }))
        ).rejects.toMatchObject({ constraint: 'vouchers_deleted_at_check' })
        await expect(
          db('vouchers').insert(voucher({ status: 2, deleted_at: new Date() }))
        ).resolves.toBeDefined()
      })

      it('refuse un utilisateur sans date d’utilisation', async () => {
        await expect(db('vouchers').insert(voucher({ redeemed_by: 3 }))).rejects.toMatchObject({
          constraint: 'vouchers_redeemed_by_check',
        })
        await expect(
          db('vouchers').insert(voucher({ redeemed_by: 3, redeemed_at: new Date() }))
        ).resolves.toBeDefined()
      })
    })

    describe('clés étrangères', () => {
      it('empêche de supprimer le pupitre, la partie ou la compagnie d’un bon', async () => {
        await db('vouchers').insert(voucher())

        await expect(db('game_participants').where('id', 1).delete()).rejects.toMatchObject({
          code: '23503',
        })
        await expect(db('games').where('id', 1).delete()).rejects.toMatchObject({ code: '23503' })
        await expect(db('companies').where('id', 1).delete()).rejects.toMatchObject({
          code: '23503',
        })
      })

      it('refuse un pupitre, une partie ou un créateur inconnus', async () => {
        for (const overrides of [{ participant_id: 99 }, { game_id: 99 }, { created_by: 99 }]) {
          await expect(
            db('vouchers').insert(voucher({ code: 'AAAA-0003', ...overrides }))
          ).rejects.toMatchObject({ code: '23503' })
        }
      })

      it('garde le bon utilisé quand le compte qui l’a validé disparaît (SET NULL)', async () => {
        await db('vouchers').insert(voucher({ redeemed_at: new Date(), redeemed_by: 3 }))

        await db('admins').where('id', 3).delete()

        expect(
          await db('vouchers').where('code', CODE).first('redeemed_at', 'redeemed_by')
        ).toMatchObject({
          redeemed_by: null,
        })
      })

      it('empêche de supprimer le compte qui a émis un bon', async () => {
        await db('vouchers').insert(voucher())

        await expect(db('admins').where('id', 1).delete()).rejects.toMatchObject({ code: '23503' })
      })
    })
  })

  describe('migration', () => {
    it('down retire la table et les deux colonnes, et up les ramène', async () => {
      await expect(
        db.transaction(async (trx) => {
          await migration.down(trx)
          expect(await voucherObjects(trx)).toEqual({ vouchers: null, company_columns: 0 })

          await migration.up(trx)
          expect(await voucherObjects(trx)).toEqual({ vouchers: 'vouchers', company_columns: 2 })

          throw ROLLBACK
        })
      ).rejects.toBe(ROLLBACK)

      // Le retour arrière annulé ne touche pas à la base réelle.
      expect(await voucherObjects(db)).toEqual({ vouchers: 'vouchers', company_columns: 2 })
    })

    describe('retour arrière réel (down)', () => {
      const target = { directory, name: '20261124030100_create_vouchers.js' }

      // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
      afterEach(async () => {
        await db.migrate.latest({ directory })
      })

      it('refuse tant qu’un bon existe, sans toucher à rien', async () => {
        await db('vouchers').insert(voucher())

        await expect(db.migrate.down(target)).rejects.toThrow(
          /Rollback impossible : des bons existent \(vouchers\)\./
        )
        expect(await voucherObjects(db)).toEqual({ vouchers: 'vouchers', company_columns: 2 })
        expect(await db('vouchers').count('* as n')).toEqual([{ n: 1 }])
      })

      it('refuse tant qu’un centre a réglé son libellé, puis passe une fois effacé', async () => {
        await db('companies').where('id', 1).update({ voucher_label: 'Une partie offerte' })

        await expect(db.migrate.down(target)).rejects.toThrow(
          /Rollback impossible : des compagnies ont réglé leurs bons \(voucher_label\)\./
        )
        expect(await voucherObjects(db)).toEqual({ vouchers: 'vouchers', company_columns: 2 })

        await db('companies').where('id', 1).update({ voucher_label: null })
        await db.migrate.down(target)

        expect(await voucherObjects(db)).toEqual({ vouchers: null, company_columns: 0 })

        await db.migrate.latest({ directory })

        expect(await voucherObjects(db)).toEqual({ vouchers: 'vouchers', company_columns: 2 })
      })
    })
  })
})
