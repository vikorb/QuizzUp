import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'

import type dbModule from '@backend/db'
import type * as securityAdminTotpModule from '@backend/security/adminTotp'
import type * as securityTotpModule from '@backend/security/totp'
import { TOTP_RECOVERY_CODES_COUNT } from '@quizzup/shared'
import bcrypt from 'bcryptjs'
import fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { sealSecret } from '../../../../backend/src/security/secretBox'
import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/security/adminTotp.pg.test.ts
 *
 * Le `mockDb` des autres tests ne sait pas faire de SQL conditionnel : la migration, l'anti-rejeu
 * (UPDATE sur `last_used_step`), l'usage unique d'un code de secours (UPDATE sur `used_at IS NULL`),
 * le verrou après cinq échecs et la révocation des sessions ne se prouvent que sur la vraie base.
 * Les parcours HTTP complets (connexion en deux temps) tournent ici aussi, sur de vraies routes.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `admin_totp`, `admin_totp_recovery_codes`, `admin_sessions`, `admins`, `companies` (et dépendantes)
 * sont vidées avant chaque test. La base est laissée migrée au dernier niveau.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule
type Store = typeof securityAdminTotpModule

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'backend/db/migrations')
const MIGRATION_FILE = path.join(MIGRATIONS_DIR, '20261124060000_create_admin_totp.js')

const SUPERADMIN_PASSWORD = 'root-password'
const SECRET = 'JBSWY3DPEHPK3PXP'

describe.skipIf(!PG_INTEGRATION_URL)('double authentification TOTP sur PostgreSQL', () => {
  let db: Db
  let store: Store
  let totp: typeof securityTotpModule

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: MIGRATIONS_DIR })

    store = await import('@backend/security/adminTotp')
    totp = await import('@backend/security/totp')
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  beforeEach(async () => {
    await db.raw(
      'TRUNCATE admin_totp_recovery_codes, admin_totp, admin_sessions, admins, companies RESTART IDENTITY CASCADE'
    )

    await db('companies').insert({ id: 1, name: 'Éditeur', email: 'c@x.test' })
    await db('admins').insert([
      {
        id: 1,
        company_id: 1,
        role: 'superadmin',
        username: 'root',
        email: 'root@x.test',
        mdp_hash: bcrypt.hashSync(SUPERADMIN_PASSWORD, 4),
      },
      {
        id: 2,
        company_id: 1,
        role: 'admin',
        username: 'alice',
        email: 'alice@x.test',
        mdp_hash: bcrypt.hashSync('alice-password', 4),
      },
    ])
  })

  const row = () => db('admin_totp').where({ admin_id: 1 }).first()
  const confirmedRow = (overrides: Record<string, unknown> = {}) =>
    db('admin_totp').insert({
      admin_id: 1,
      secret_enc: 'v1.x.y.z',
      confirmed_at: new Date(),
      ...overrides,
    })

  describe('migration 20261124060000_create_admin_totp', () => {
    const migration = createRequire(import.meta.url)(MIGRATION_FILE) as {
      up: (knex: Db) => Promise<void>
      down: (knex: Db) => Promise<void>
    }

    // Quoi qu'il arrive, la base reste migrée au dernier niveau pour les autres fichiers.
    afterEach(async () => {
      if (!(await db.schema.hasTable('admin_totp'))) await migration.up(db)
    })

    it('crée les deux tables avec leurs colonnes et leurs valeurs par défaut', async () => {
      const columns = await db('information_schema.columns')
        .whereIn('table_name', ['admin_totp', 'admin_totp_recovery_codes'])
        .select('table_name', 'column_name', 'data_type', 'is_nullable')

      const shape = (table: string) =>
        Object.fromEntries(
          columns
            .filter((column) => column.table_name === table)
            .map((column) => [
              column.column_name,
              `${column.data_type}${column.is_nullable === 'YES' ? '?' : ''}`,
            ])
        )

      expect(shape('admin_totp')).toEqual({
        admin_id: 'bigint',
        secret_enc: 'text',
        confirmed_at: 'timestamp with time zone?',
        last_used_step: 'bigint?',
        failed_attempts: 'smallint',
        locked_until: 'timestamp with time zone?',
        created_at: 'timestamp with time zone',
        updated_at: 'timestamp with time zone',
      })
      expect(shape('admin_totp_recovery_codes')).toEqual({
        id: 'bigint',
        admin_id: 'bigint',
        code_hash: 'character',
        used_at: 'timestamp with time zone?',
        created_at: 'timestamp with time zone',
      })

      await db('admin_totp').insert({ admin_id: 1, secret_enc: 'v1.x.y.z' })
      expect(await row()).toMatchObject({
        confirmed_at: null,
        last_used_step: null,
        failed_attempts: 0,
        locked_until: null,
      })
    })

    it('refuse un second secret pour un admin et un code de secours en double', async () => {
      await db('admin_totp').insert({ admin_id: 1, secret_enc: 'a' })
      await expect(db('admin_totp').insert({ admin_id: 1, secret_enc: 'b' })).rejects.toMatchObject(
        {
          code: '23505',
        }
      )

      const hash = 'a'.repeat(64)
      await db('admin_totp_recovery_codes').insert({ admin_id: 1, code_hash: hash })
      await expect(
        db('admin_totp_recovery_codes').insert({ admin_id: 1, code_hash: hash })
      ).rejects.toMatchObject({ code: '23505' })
      // Le même code chez un autre admin reste possible.
      await db('admin_totp_recovery_codes').insert({ admin_id: 2, code_hash: hash })
    })

    it('supprime les lignes avec leur admin (ON DELETE CASCADE)', async () => {
      await db('admin_totp').insert({ admin_id: 2, secret_enc: 'a' })
      await db('admin_totp_recovery_codes').insert({ admin_id: 2, code_hash: 'b'.repeat(64) })

      await db('admins').where({ id: 2 }).delete()

      expect(await db('admin_totp').count({ n: '*' }).first()).toMatchObject({ n: 0 })
      expect(await db('admin_totp_recovery_codes').count({ n: '*' }).first()).toMatchObject({
        n: 0,
      })
    })

    it('up révoque les sessions superadmin ouvertes, et seulement elles', async () => {
      const longAgo = new Date('2026-01-01T00:00:00Z')
      await migration.down(db)

      await db('admin_sessions').insert([
        { id: '00000000-0000-4000-8000-000000000001', admin_id: 1 },
        { id: '00000000-0000-4000-8000-000000000002', admin_id: 1, revoked_at: longAgo },
        { id: '00000000-0000-4000-8000-000000000003', admin_id: 2 },
      ])

      await migration.up(db)

      const sessions = await db('admin_sessions').orderBy('id')
      expect(sessions[0].revoked_at).toBeInstanceOf(Date)
      expect(sessions[0].revoked_at.getTime()).toBeGreaterThan(longAgo.getTime())
      // Déjà révoquée : date inchangée.
      expect(sessions[1].revoked_at.getTime()).toBe(longAgo.getTime())
      // Admin de centre : intacte.
      expect(sessions[2].revoked_at).toBeNull()
    })

    it('down supprime les deux tables même pleines, et up les recrée', async () => {
      await db('admin_totp').insert({ admin_id: 1, secret_enc: 'a' })
      await db('admin_totp_recovery_codes').insert({ admin_id: 1, code_hash: 'c'.repeat(64) })

      await migration.down(db)

      expect(await db.schema.hasTable('admin_totp')).toBe(false)
      expect(await db.schema.hasTable('admin_totp_recovery_codes')).toBe(false)

      await migration.up(db)

      expect(await db.schema.hasTable('admin_totp')).toBe(true)
      expect(await db('admin_totp').count({ n: '*' }).first()).toMatchObject({ n: 0 })
    })
  })

  describe('UPDATE atomiques du magasin', () => {
    const now = new Date('2026-11-23T10:00:00Z')

    it('anti-rejeu : un pas ne sert qu’une fois, même demandé cinq fois en parallèle', async () => {
      await confirmedRow()

      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.acceptStep(1, 100, now))
      )

      expect(results.filter(Boolean)).toHaveLength(1)
      expect((await row()).last_used_step).toBe(100)
    })

    it('anti-rejeu : refuse le même pas et les pas plus anciens, accepte un pas plus récent', async () => {
      await confirmedRow({ last_used_step: 100 })

      expect(await store.acceptStep(1, 100, now)).toBe(false)
      expect(await store.acceptStep(1, 99, now)).toBe(false)
      expect(await store.acceptStep(1, 101, now)).toBe(true)
      expect((await row()).last_used_step).toBe(101)
    })

    it('n’accepte aucun pas tant que l’enrôlement n’est pas confirmé', async () => {
      await confirmedRow({ confirmed_at: null })

      expect(await store.acceptStep(1, 100, now)).toBe(false)
      expect((await row()).last_used_step).toBeNull()
    })

    it('un pas accepté remet les échecs et le verrou à zéro', async () => {
      await confirmedRow({ failed_attempts: 5, locked_until: new Date(now.getTime() + 60_000) })

      expect(await store.acceptStep(1, 100, now)).toBe(true)
      expect(await row()).toMatchObject({ failed_attempts: 0, locked_until: null })
    })

    it('code de secours : usage unique, même présenté cinq fois en parallèle', async () => {
      await confirmedRow()
      const hash = totp.hashRecoveryCode('abcde-fghij')
      await db('admin_totp_recovery_codes').insert({ admin_id: 1, code_hash: hash })

      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.consumeRecoveryCode(1, hash, now))
      )

      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await store.consumeRecoveryCode(1, hash, now)).toBe(false)
      expect((await db('admin_totp_recovery_codes').first()).used_at).toBeInstanceOf(Date)
    })

    it('code de secours : refuse celui d’un autre admin ou un code inconnu', async () => {
      await confirmedRow()
      const hash = totp.hashRecoveryCode('abcde-fghij')
      await db('admin_totp_recovery_codes').insert([
        { admin_id: 1, code_hash: hash },
        { admin_id: 2, code_hash: totp.hashRecoveryCode('zzzzz-zzzzz') },
      ])

      expect(await store.consumeRecoveryCode(1, totp.hashRecoveryCode('zzzzz-zzzzz'), now)).toBe(
        false
      )
      expect(await store.consumeRecoveryCode(1, totp.hashRecoveryCode('nnnnn-nnnnn'), now)).toBe(
        false
      )
      expect(
        (await db('admin_totp_recovery_codes').where({ admin_id: 1 }).first()).used_at
      ).toBeNull()
    })

    it('code de secours : une réussite remet les échecs à zéro, un échec ne touche à rien', async () => {
      await confirmedRow({ failed_attempts: 3 })
      const hash = totp.hashRecoveryCode('abcde-fghij')
      await db('admin_totp_recovery_codes').insert({ admin_id: 1, code_hash: hash })

      await store.consumeRecoveryCode(1, totp.hashRecoveryCode('nnnnn-nnnnn'), now)
      expect((await row()).failed_attempts).toBe(3)

      expect(await store.consumeRecoveryCode(1, hash, now)).toBe(true)
      expect((await row()).failed_attempts).toBe(0)
    })

    it('enrôlement : deux confirmations simultanées, une seule réussit et il n’y a que dix codes', async () => {
      await store.startEnrollment(1, 'v1.x.y.z')
      const codes = totp.generateRecoveryCodes()

      const results = await Promise.all([
        store.confirmEnrollment(1, 'v1.x.y.z', 7, codes, now),
        store.confirmEnrollment(1, 'v1.x.y.z', 7, totp.generateRecoveryCodes(), now),
      ])

      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await row()).toMatchObject({ last_used_step: 7, failed_attempts: 0 })
      expect((await row()).confirmed_at).toBeInstanceOf(Date)
      expect(await db('admin_totp_recovery_codes').where({ admin_id: 1 })).toHaveLength(
        TOTP_RECOVERY_CODES_COUNT
      )
    })

    it('enrôlement : les codes sont rangés hachés, jamais en clair', async () => {
      await store.startEnrollment(1, 'v1.x.y.z')
      const codes = totp.generateRecoveryCodes()
      await store.confirmEnrollment(1, 'v1.x.y.z', 7, codes, now)

      const hashes = (await db('admin_totp_recovery_codes').where({ admin_id: 1 })).map((code) =>
        code.code_hash.trim()
      )

      expect(hashes.sort()).toEqual(codes.map(totp.hashRecoveryCode).sort())
      for (const code of codes) expect(hashes).not.toContain(code)
    })

    it('enrôlement : le secret se régénère tant qu’il n’est pas confirmé, jamais après', async () => {
      expect(await store.startEnrollment(1, 'premier')).toBe(true)
      expect(await store.startEnrollment(1, 'second')).toBe(true)
      expect((await row()).secret_enc).toBe('second')

      await store.confirmEnrollment(1, 'second', 7, totp.generateRecoveryCodes(), now)

      expect(await store.startEnrollment(1, 'troisieme')).toBe(false)
      expect((await row()).secret_enc).toBe('second')
      expect(await store.confirmEnrollment(1, 'second', 8, totp.generateRecoveryCodes(), now)).toBe(
        false
      )
    })

    it('enrôlement : un secret régénéré entre la lecture et la confirmation est refusé, rien n’est confirmé', async () => {
      await store.startEnrollment(1, 'premier')
      // La route lit S1 et vérifie le code contre S1 ; un autre enrôlement écrit S2 avant l'UPDATE.
      const read = (await store.getAdminTotp(1))?.secretEnc as string
      await store.startEnrollment(1, 'second')

      expect(await store.confirmEnrollment(1, read, 7, totp.generateRecoveryCodes(), now)).toBe(
        false
      )

      expect(await row()).toMatchObject({
        secret_enc: 'second',
        confirmed_at: null,
        last_used_step: null,
      })
      expect(await db('admin_totp_recovery_codes').where({ admin_id: 1 })).toHaveLength(0)

      // Le secret courant, lui, se confirme.
      expect(await store.confirmEnrollment(1, 'second', 7, totp.generateRecoveryCodes(), now)).toBe(
        true
      )
    })

    it('verrou : le 5e échec bloque 15 minutes, le compteur reste à 5, un succès le remet à zéro', async () => {
      await confirmedRow()

      for (let i = 1; i <= 4; i += 1) {
        expect(await store.reserveAttempt(1, now), `essai ${i}`).toBe(true)
        expect(await row(), `essai ${i}`).toMatchObject({ failed_attempts: i, locked_until: null })
      }

      expect(await store.reserveAttempt(1, now)).toBe(true)
      const locked = await row()
      expect(locked.failed_attempts).toBe(5)
      expect(locked.locked_until.getTime()).toBe(now.getTime() + 15 * 60_000)

      // Verrouillé : plus aucun essai réservé, rien ne bouge.
      expect(await store.reserveAttempt(1, now)).toBe(false)
      expect(await row()).toMatchObject({ failed_attempts: 5, locked_until: locked.locked_until })

      await store.acceptStep(1, 100, new Date(now.getTime() + 15 * 60_000 + 1))
      expect(await row()).toMatchObject({ failed_attempts: 0, locked_until: null })
    })

    it('reverrouille aussitôt un essai fait juste après la fin du blocage', async () => {
      await confirmedRow({ failed_attempts: 5, locked_until: new Date(now.getTime() - 1) })
      const later = new Date(now.getTime() + 1000)

      expect(await store.reserveAttempt(1, later)).toBe(true)

      expect((await row()).locked_until.getTime()).toBe(later.getTime() + 15 * 60_000)
    })

    it('ne réserve aucun essai pour un enrôlement non confirmé ou absent', async () => {
      expect(await store.reserveAttempt(1, now)).toBe(false)

      await confirmedRow({ confirmed_at: null })

      expect(await store.reserveAttempt(1, now)).toBe(false)
      expect((await row()).failed_attempts).toBe(0)
    })

    describe('verifySecondFactor', () => {
      const key = randomBytes(32)
      const goodCode = () => totp.totpCode(totp.base32Decode(SECRET), totp.stepAt(now.getTime()))
      const wrongCode = () => (goodCode() === '000000' ? '000001' : '000000')
      const sealedRow = (overrides: Record<string, unknown> = {}) =>
        confirmedRow({ secret_enc: sealSecret(key, 1, SECRET), ...overrides })

      it('10 vérifications parallèles avec des codes faux : 5 comparaisons au plus, les autres reçoivent le blocage', async () => {
        await sealedRow()

        const results = await Promise.all(
          Array.from({ length: 10 }, () => store.verifySecondFactor(1, wrongCode(), key, now))
        )

        expect(results.filter((r) => !r.ok && r.reason === 'invalid')).toHaveLength(5)
        const locked = results.filter((r) => !r.ok && r.reason === 'locked')
        expect(locked).toHaveLength(5)
        for (const result of locked) {
          expect(result).toEqual({ ok: false, reason: 'locked', retryAfterSeconds: 15 * 60 })
        }
        expect(await row()).toMatchObject({ failed_attempts: 5 })
        expect((await row()).locked_until.getTime()).toBe(now.getTime() + 15 * 60_000)
      })

      it('un code de secours faux en rafale est borné de la même façon', async () => {
        await sealedRow()

        const results = await Promise.all(
          Array.from({ length: 10 }, () => store.verifySecondFactor(1, 'nnnnn-nnnnn', key, now))
        )

        expect(results.filter((r) => !r.ok && r.reason === 'invalid')).toHaveLength(5)
        expect(results.filter((r) => !r.ok && r.reason === 'locked')).toHaveLength(5)
      })

      it('un compte verrouillé refuse le bon code, sans le consommer', async () => {
        await sealedRow({ failed_attempts: 5, locked_until: new Date(now.getTime() + 60_000) })
        const hash = totp.hashRecoveryCode('abcde-fghij')
        await db('admin_totp_recovery_codes').insert({ admin_id: 1, code_hash: hash })

        for (const code of [goodCode(), 'abcde-fghij']) {
          expect(await store.verifySecondFactor(1, code, key, now)).toEqual({
            ok: false,
            reason: 'locked',
            retryAfterSeconds: 60,
          })
        }

        expect((await row()).last_used_step).toBeNull()
        expect((await db('admin_totp_recovery_codes').first()).used_at).toBeNull()
      })

      it('le bon code au 5e essai passe, et remet le compteur à zéro', async () => {
        await sealedRow({ failed_attempts: 4 })

        expect(await store.verifySecondFactor(1, goodCode(), key, now)).toEqual({
          ok: true,
          recoveryCode: false,
        })
        expect(await row()).toMatchObject({ failed_attempts: 0, locked_until: null })
      })

      it('un code rejoué compte comme un essai et rend « invalid »', async () => {
        await sealedRow({ last_used_step: totp.stepAt(now.getTime()) })

        expect(await store.verifySecondFactor(1, goodCode(), key, now)).toEqual({
          ok: false,
          reason: 'invalid',
        })
        expect((await row()).failed_attempts).toBe(1)
      })

      it('un enrôlement absent ou non confirmé rend « not_enrolled », sans compter d’essai', async () => {
        expect(await store.verifySecondFactor(1, goodCode(), key, now)).toEqual({
          ok: false,
          reason: 'not_enrolled',
        })

        await sealedRow({ confirmed_at: null })

        expect(await store.verifySecondFactor(1, goodCode(), key, now)).toEqual({
          ok: false,
          reason: 'not_enrolled',
        })
        expect((await row()).failed_attempts).toBe(0)
      })
    })

    it('réinitialisation : efface secret et codes et révoque toutes les sessions de cet admin seulement', async () => {
      await confirmedRow()
      await db('admin_totp_recovery_codes').insert({ admin_id: 1, code_hash: 'd'.repeat(64) })
      const earlier = new Date('2026-01-01T00:00:00Z')
      await db('admin_sessions').insert([
        { id: '00000000-0000-4000-8000-000000000001', admin_id: 1 },
        { id: '00000000-0000-4000-8000-000000000002', admin_id: 1 },
        { id: '00000000-0000-4000-8000-000000000003', admin_id: 1, revoked_at: earlier },
        { id: '00000000-0000-4000-8000-000000000004', admin_id: 2 },
      ])

      await store.resetAdminTotp(1)

      expect(await row()).toBeUndefined()
      expect(await db('admin_totp_recovery_codes')).toHaveLength(0)
      const sessions = await db('admin_sessions').orderBy('id')
      expect(sessions[0].revoked_at).toBeInstanceOf(Date)
      expect(sessions[1].revoked_at).toBeInstanceOf(Date)
      expect(sessions[2].revoked_at.getTime()).toBe(earlier.getTime())
      expect(sessions[3].revoked_at).toBeNull()
    })

    it('compte les codes de secours restants', async () => {
      await confirmedRow()
      await db('admin_totp_recovery_codes').insert([
        { admin_id: 1, code_hash: '1'.repeat(64) },
        { admin_id: 1, code_hash: '2'.repeat(64) },
        { admin_id: 1, code_hash: '3'.repeat(64), used_at: now },
        { admin_id: 2, code_hash: '4'.repeat(64) },
      ])

      expect(await store.countUnusedRecoveryCodes(1)).toBe(2)
    })
  })

  describe('commande totp:reset', () => {
    const backendDir = path.resolve(process.cwd(), 'backend')
    const tsx = path.join(backendDir, 'node_modules/tsx/dist/cli.mjs')

    function run(...args: string[]) {
      return spawnSync(process.execPath, [tsx, 'src/security/resetTotpCli.ts', ...args], {
        cwd: backendDir,
        env: { ...process.env, DATABASE_URL: PG_INTEGRATION_URL },
        encoding: 'utf8',
        timeout: 60_000,
      })
    }

    it('efface le deuxième facteur du superadmin et révoque ses sessions', async () => {
      await confirmedRow()
      await db('admin_totp_recovery_codes').insert({ admin_id: 1, code_hash: 'd'.repeat(64) })
      await db('admin_sessions').insert({ id: '00000000-0000-4000-8000-000000000001', admin_id: 1 })

      const result = run('--username', 'ROOT')

      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain('réinitialisée')
      expect(await row()).toBeUndefined()
      expect(await db('admin_totp_recovery_codes')).toHaveLength(0)
      expect((await db('admin_sessions').first()).revoked_at).toBeInstanceOf(Date)
    }, 90_000)

    it('refuse un identifiant inconnu, un admin de centre et l’absence d’identifiant, sans rien effacer', async () => {
      await db('admin_totp').insert({ admin_id: 2, secret_enc: 'a' })

      for (const args of [['--username', 'nobody'], ['--username', 'alice'], []]) {
        const result = run(...args)

        expect(result.status, args.join(' ')).toBe(1)
        expect(result.stderr).toContain('Réinitialisation TOTP en échec')
      }
      expect(await db('admin_totp').where({ admin_id: 2 }).first()).toBeDefined()
    }, 90_000)
  })

  describe('connexion en deux temps (routes réelles)', () => {
    let app: FastifyInstance
    let logs: string[]
    // Départ à l'heure réelle : les `last_seen_at` posés par la base restent cohérents avec l'horloge simulée.
    let clock: number

    const advance = (seconds: number) => {
      clock += seconds * 1000
      vi.setSystemTime(clock)
    }

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      clock = Math.floor(Date.now() / 30_000) * 30_000 + 5_000
      vi.setSystemTime(clock)

      const { default: authPlugin } = await import('@backend/plugins/auth')
      const { default: authRoutes } = await import('@backend/routes/auth')
      const { default: loginRoutes } = await import('@backend/routes/login')
      const { default: meRoutes } = await import('@backend/routes/me')

      logs = []
      app = fastify({
        logger: { level: 'trace', stream: { write: (line: string) => logs.push(line) } },
      })
      await app.register(authPlugin as never)
      await app.register(authRoutes as never)
      await app.register(loginRoutes as never)
      await app.register(meRoutes as never)
      await app.ready()
    })

    afterEach(async () => {
      vi.useRealTimers()
      await app.close()
    })

    const call = (
      method: 'POST' | 'DELETE' | 'GET',
      url: string,
      payload?: object,
      token?: string
    ) =>
      app.inject({
        method,
        url,
        payload,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })

    const login = async () =>
      (await call('POST', '/login', { identifier: 'root', password: SUPERADMIN_PASSWORD })).json<{
        mfa: string
        challengeToken: string
      }>()

    const codeFor = (secret: string, offsetSteps = 0) =>
      totp.totpCode(totp.base32Decode(secret), totp.stepAt(Date.now()) + offsetSteps)

    /** Enrôle le superadmin : rend son secret, ses codes de secours et le jeton de la session ouverte. */
    async function enroll() {
      const { challengeToken } = await login()
      const started = (await call('POST', '/login/totp/enroll', { challengeToken })).json<{
        secret: string
      }>()
      const confirmed = await call('POST', '/login/totp/enroll/confirm', {
        challengeToken,
        code: codeFor(started.secret),
      })

      expect(confirmed.statusCode, confirmed.body).toBe(200)
      const body = confirmed.json<{ token: string; recoveryCodes: string[] }>()

      return { secret: started.secret, recoveryCodes: body.recoveryCodes, token: body.token }
    }

    it('enrôle le superadmin : clé chiffrée, dix codes hachés, session ouverte, jeton utilisable', async () => {
      const first = await login()
      expect(first.mfa).toBe('enroll')
      expect(await db('admin_sessions')).toHaveLength(0)

      const { secret, recoveryCodes, token } = await enroll()

      expect(recoveryCodes).toHaveLength(TOTP_RECOVERY_CODES_COUNT)
      const stored = await row()
      expect(stored.confirmed_at).toBeInstanceOf(Date)
      expect(stored.secret_enc).toMatch(/^v1\./)
      expect(stored.secret_enc).not.toContain(secret)
      expect(await db('admin_sessions')).toHaveLength(1)

      expect((await call('GET', '/me', undefined, token)).statusCode).toBe(200)
      expect((await login()).mfa).toBe('totp')
    })

    it('anti-rejeu : le code de confirmation ne sert pas à se connecter, ni aucun code déjà utilisé', async () => {
      const { secret } = await enroll()
      const challenge = (await login()).challengeToken

      // Même pas de 30 s que le code de confirmation.
      const sameStep = await call('POST', '/login/totp', {
        challengeToken: challenge,
        code: codeFor(secret),
      })
      expect(sameStep.statusCode).toBe(401)

      advance(30)
      const code = codeFor(secret)
      const accepted = await call('POST', '/login/totp', { challengeToken: challenge, code })
      expect(accepted.statusCode, accepted.body).toBe(200)

      const replay = await call('POST', '/login/totp', { challengeToken: challenge, code })
      const wrong = await call('POST', '/login/totp', { challengeToken: challenge, code: '000000' })

      // Un code rejoué et un code faux : exactement la même réponse.
      expect(replay.statusCode).toBe(401)
      expect(replay.statusCode).toBe(wrong.statusCode)
      expect(replay.body).toBe(wrong.body)
      expect(replay.json()).toEqual({ error: 'totp_invalid' })
    })

    it('fenêtre ±1 : accepte le pas précédent et le suivant, refuse deux pas d’écart', async () => {
      const { secret } = await enroll()
      const challenge = (await login()).challengeToken
      const submit = (offset: number) =>
        call('POST', '/login/totp', { challengeToken: challenge, code: codeFor(secret, offset) })

      // Les pas −2 et +2 sont refusés (et comptent comme deux échecs).
      expect((await submit(-2)).statusCode).toBe(401)
      expect((await submit(2)).statusCode).toBe(401)
      // Le pas suivant est accepté, puis plus aucun pas antérieur.
      expect((await submit(1)).statusCode).toBe(200)
      expect((await submit(0)).statusCode).toBe(401)
    })

    it('bloque au 5e échec (429 même avec le bon code), puis rouvre après 15 minutes', async () => {
      const { secret } = await enroll()
      advance(30)
      const challenge = (await login()).challengeToken
      const submit = (code: string) =>
        call('POST', '/login/totp', { challengeToken: challenge, code })

      for (let i = 1; i <= 5; i += 1) {
        const wrong = await submit('000000')
        expect(wrong.statusCode, `échec ${i}`).toBe(401)
        expect(wrong.json()).toEqual({ error: 'totp_invalid' })
      }

      const blocked = await submit(codeFor(secret))
      expect(blocked.statusCode).toBe(429)
      expect(blocked.json()).toEqual({ error: 'too_many_attempts' })
      expect(Number(blocked.headers['retry-after'])).toBe(15 * 60)
      expect(await db('admin_sessions')).toHaveLength(1)

      // Le défi ne dure que 5 minutes : on en demande un neuf à chaque étape (la connexion n'est pas bloquée).
      // Le blocage tient jusqu'au bout : à 14 min 59 s, encore bloqué.
      advance(14 * 60 + 59)
      const later = (await login()).challengeToken
      const stillBlocked = await call('POST', '/login/totp', {
        challengeToken: later,
        code: codeFor(secret),
      })
      expect(stillBlocked.statusCode).toBe(429)
      expect(Number(stillBlocked.headers['retry-after'])).toBe(1)

      // Puis le blocage prend fin.
      advance(2)
      const fresh = (await login()).challengeToken
      const accepted = await call('POST', '/login/totp', {
        challengeToken: fresh,
        code: codeFor(secret),
      })
      expect(accepted.statusCode, accepted.body).toBe(200)
      expect(await row()).toMatchObject({ failed_attempts: 0, locked_until: null })
    })

    it('un code de secours ne sert qu’une fois, normalisé, et annonce ce qui reste', async () => {
      const { recoveryCodes } = await enroll()
      const challenge = (await login()).challengeToken
      const submit = (code: string) =>
        call('POST', '/login/totp', { challengeToken: challenge, code })

      const first = await submit(recoveryCodes[0])
      expect(first.statusCode, first.body).toBe(200)
      expect(first.json()).toMatchObject({ recoveryCodesRemaining: 9 })

      const again = await submit(recoveryCodes[0])
      expect(again.statusCode).toBe(401)
      expect(again.json()).toEqual({ error: 'totp_invalid' })

      // Saisie en majuscules, sans tiret, avec des espaces autour : même code, autre présentation.
      const typed = ` ${recoveryCodes[1].toUpperCase().replace('-', '')} `
      const second = await submit(typed)
      expect(second.statusCode, second.body).toBe(200)
      expect(second.json()).toMatchObject({ recoveryCodesRemaining: 8 })

      expect(await db('admin_totp_recovery_codes').whereNotNull('used_at')).toHaveLength(2)
    })

    it('DELETE /me/totp : un code faux ne change rien, un code juste efface tout et révoque les sessions', async () => {
      const { secret, token } = await enroll()
      const other = (await login()).challengeToken
      advance(30)
      const second = await call('POST', '/login/totp', {
        challengeToken: other,
        code: codeFor(secret),
      })
      const secondToken = second.json<{ token: string }>().token
      // Une session d'un admin de centre, pour vérifier qu'elle survit.
      await db('admin_sessions').insert({ id: '00000000-0000-4000-8000-0000000000aa', admin_id: 2 })

      const wrong = await call('DELETE', '/me/totp', { code: '000000' }, token)
      expect(wrong.statusCode).toBe(401)
      expect(await row()).toBeDefined()
      expect(
        await db('admin_sessions').whereNull('revoked_at').where({ admin_id: 1 })
      ).toHaveLength(2)

      advance(30)
      const done = await call('DELETE', '/me/totp', { code: codeFor(secret) }, token)
      expect(done.statusCode, done.body).toBe(204)

      expect(await row()).toBeUndefined()
      expect(await db('admin_totp_recovery_codes')).toHaveLength(0)
      // Toutes les sessions du superadmin sont révoquées : les deux jetons ne servent plus.
      expect(
        await db('admin_sessions').whereNull('revoked_at').where({ admin_id: 1 })
      ).toHaveLength(0)
      for (const stale of [token, secondToken]) {
        const response = await call('GET', '/me', undefined, stale)
        expect(response.statusCode).toBe(401)
        expect(response.json()).toEqual({ error: 'session_invalid' })
      }
      expect(
        await db('admin_sessions').whereNull('revoked_at').where({ admin_id: 2 })
      ).toHaveLength(1)

      // Le prochain login repasse par l'enrôlement.
      expect((await login()).mfa).toBe('enroll')
    })

    it('DELETE /me/totp accepte un code de secours', async () => {
      const { recoveryCodes, token } = await enroll()

      const done = await call('DELETE', '/me/totp', { code: recoveryCodes[3] }, token)

      expect(done.statusCode, done.body).toBe(204)
      expect(await row()).toBeUndefined()
    })

    it('un secret altéré en base n’ouvre jamais de session : erreur serveur sans fuite', async () => {
      const { secret } = await enroll()
      const stored = await row()
      const parts = stored.secret_enc.split('.')
      const tampered = Buffer.from(parts[3], 'base64')
      tampered[0] ^= 1
      parts[3] = tampered.toString('base64')
      await db('admin_totp')
        .where({ admin_id: 1 })
        .update({ secret_enc: parts.join('.') })
      advance(30)
      const challenge = (await login()).challengeToken

      const response = await call('POST', '/login/totp', {
        challengeToken: challenge,
        code: codeFor(secret),
      })

      expect(response.statusCode).toBe(500)
      expect(response.body).not.toContain(secret)
      expect(await db('admin_sessions')).toHaveLength(1)
    })

    it('un chiffré recopié sur la ligne d’un autre admin ne se déchiffre pas', async () => {
      await enroll()
      const stored = await row()
      // Le même chiffré, rangé chez un second superadmin : les données associées ne correspondent plus.
      await db('admins').insert({
        id: 3,
        company_id: 1,
        role: 'superadmin',
        username: 'root2',
        email: 'root2@x.test',
        mdp_hash: bcrypt.hashSync('root2-password', 4),
      })
      await db('admin_totp').insert({
        admin_id: 3,
        secret_enc: stored.secret_enc,
        confirmed_at: new Date(),
      })
      const loginRoot2 = await call('POST', '/login', {
        identifier: 'root2',
        password: 'root2-password',
      })
      const challenge = loginRoot2.json<{ challengeToken: string }>().challengeToken

      const response = await call('POST', '/login/totp', {
        challengeToken: challenge,
        code: '123456',
      })

      expect(response.statusCode).toBe(500)
    })

    it('ne journalise ni secret, ni code, ni jeton, ni code de secours', async () => {
      const { secret, recoveryCodes, token } = await enroll()
      const challenge = (await login()).challengeToken
      const code = codeFor(secret, 1)
      await call('POST', '/login/totp', { challengeToken: challenge, code: '000000' })
      await call('POST', '/login/totp', { challengeToken: challenge, code: recoveryCodes[0] })
      await call('POST', '/login/totp', { challengeToken: challenge, code })

      const journal = logs.join('')

      expect(journal).toContain('request completed')
      for (const sensitive of [
        secret,
        challenge,
        token,
        code,
        ...recoveryCodes,
        SUPERADMIN_PASSWORD,
      ]) {
        expect(journal).not.toContain(sensitive)
      }
    })
  })
})
