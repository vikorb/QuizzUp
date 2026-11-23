import path from 'node:path'

import fastify from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { DEMO_REQUEST_ROOMS_MAX } from '@quizzup/shared'
import type { purgeExpiredDemoRequests as PurgeFn } from '@backend/jobs/purgeDemoRequests'
import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/jobs/demoRequests.pg.test.ts
 *
 * ATTENTION : utiliser une base DÉDIÉE (le nom doit finir par `_test`). Les migrations Knex y sont
 * appliquées et les tables `demo_requests`, `admins`, `companies` (et dépendantes) sont vidées avant
 * chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'backend/db/migrations')
const MIGRATION_NAME = '20261124061000_create_demo_requests.js'

const NOW = new Date('2026-11-23T12:00:00.000Z')
// Limite = NOW - 12 mois = 2025-11-23T12:00:00.000Z
const THIRTEEN_MONTHS_AGO = '2025-10-23T12:00:00.000Z'
const ELEVEN_MONTHS_AGO = '2025-12-23T12:00:00.000Z'
const JUST_BEFORE_CUTOFF = '2025-11-23T11:59:59.999Z'
const AT_CUTOFF = '2025-11-23T12:00:00.000Z'

type Db = typeof import('@backend/db').default

describe.skipIf(!PG_INTEGRATION_URL)('demo_requests sur PostgreSQL', () => {
  let db: Db
  let purge: typeof PurgeFn

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default
    purge = (await import('@backend/jobs/purgeDemoRequests')).purgeExpiredDemoRequests

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: MIGRATIONS_DIR })
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  beforeEach(async () => {
    // Base partagée avec les autres tests `*.pg` : ils insèrent des comptes à identifiant explicite
    // sans avancer les séquences. Sans RESTART IDENTITY, nos insertions sans identifiant
    // retomberaient sur ces lignes (companies_pkey / admins_pkey).
    // TRUNCATE (et non DELETE) : c'est lui qui remet les séquences à zéro, voir ci-dessus.
    await db.raw('TRUNCATE demo_requests, admins, companies RESTART IDENTITY CASCADE')
  })

  const baseRow = {
    contact_name: 'Camille Martin',
    center_name: 'Escape Test',
    email: 'camille@example.com',
    rooms_count: 3,
    consent_at: '2026-11-01T10:00:00.000Z',
  }

  const addRequest = async (overrides: Record<string, unknown> = {}): Promise<number> => {
    const [row] = await db('demo_requests')
      .insert({ ...baseRow, ...overrides })
      .returning('id')

    return Number(row.id ?? row)
  }

  describe('table', () => {
    it('fills the defaults and keeps the optional columns null', async () => {
      const id = await addRequest()

      const row = await db('demo_requests').where({ id }).first()

      expect(row).toMatchObject({
        phone: null,
        message: null,
        locale: null,
        processed_at: null,
        processed_by: null,
      })
      expect(row.created_at).toBeInstanceOf(Date)
      expect(row.updated_at).toBeInstanceOf(Date)
    })

    it('accepts 1 and the maximum number of rooms', async () => {
      await expect(addRequest({ rooms_count: 1 })).resolves.toBeGreaterThan(0)
      await expect(addRequest({ rooms_count: DEMO_REQUEST_ROOMS_MAX })).resolves.toBeGreaterThan(0)
    })

    it.each([0, -1, DEMO_REQUEST_ROOMS_MAX + 1])(
      'refuses rooms_count %i with the CHECK constraint',
      async (roomsCount) => {
        await expect(addRequest({ rooms_count: roomsCount })).rejects.toThrow(
          /demo_requests_rooms_count_check/
        )
        await expect(db('demo_requests').count('* as count').first()).resolves.toMatchObject({
          count: 0,
        })
      }
    )

    it('sets processed_by to null when the account is deleted', async () => {
      const [company] = await db('companies')
        .insert({ name: 'Centre demandes pg', email: 'demandes-pg@example.test' })
        .returning('id')
      const companyId = Number(company.id ?? company)
      const [admin] = await db('admins')
        .insert({
          company_id: companyId,
          role: 'superadmin',
          username: 'demandes-pg',
          email: 'demandes-pg-admin@example.test',
          mdp_hash: 'x',
        })
        .returning('id')
      const adminId = Number(admin.id ?? admin)

      try {
        const id = await addRequest({ processed_at: NOW.toISOString(), processed_by: adminId })

        await db('admins').where({ id: adminId }).delete()

        const row = await db('demo_requests').where({ id }).first()

        expect(row.processed_by).toBeNull()
        expect(row.processed_at).toBeInstanceOf(Date)
      } finally {
        await db('admins').where({ id: adminId }).delete()
        await db('companies').where({ id: companyId }).delete()
      }
    })
  })

  describe('routes', () => {
    // Les routes tournent ici sur la vraie base : la requête SQL (alias, tri, comptage, RETURNING)
    // n'est pas vérifiée par la base simulée des tests de route.
    async function createApps(adminId: number) {
      const publicRoutes = (await import('@backend/routes/public')).default
      const consoleRoutes = (await import('@backend/routes/demoRequests')).default

      const publicApp = fastify({ logger: false })
      await publicApp.register(publicRoutes as never, { prefix: '/public/v1' })

      const consoleApp = fastify({ logger: false })
      consoleApp.decorate('authenticate', async (req: { user?: unknown }) => {
        req.user = { sub: String(adminId), role: 'superadmin' }
      })
      await consoleApp.register(consoleRoutes as never)

      return { publicApp, consoleApp }
    }

    it('stores a public request, lists it, marks it processed, then deletes it', async () => {
      const [company] = await db('companies')
        .insert({ name: 'Centre routes pg', email: 'routes-pg@example.test' })
        .returning('id')
      const companyId = Number(company.id ?? company)
      const [admin] = await db('admins')
        .insert({
          company_id: companyId,
          role: 'superadmin',
          username: 'routes-pg',
          email: 'routes-pg-admin@example.test',
          mdp_hash: 'x',
        })
        .returning('id')
      const adminId = Number(admin.id ?? admin)
      const { publicApp, consoleApp } = await createApps(adminId)

      try {
        const created = await publicApp.inject({
          method: 'POST',
          url: '/public/v1/demo-requests',
          payload: {
            name: 'Camille Martin',
            centerName: 'Escape Test',
            email: 'camille@example.com',
            roomsCount: 3,
            consent: true,
          },
        })

        expect(created.statusCode).toBe(202)

        const listed = await consoleApp.inject({ method: 'GET', url: '/demo-requests' })

        expect(listed.statusCode).toBe(200)
        expect(listed.json().pendingCount).toBe(1)
        expect(listed.json().demoRequests).toHaveLength(1)

        const { id, consentAt, createdAt } = listed.json().demoRequests[0]

        expect(listed.json().demoRequests[0]).toMatchObject({
          name: 'Camille Martin',
          centerName: 'Escape Test',
          email: 'camille@example.com',
          phone: null,
          roomsCount: 3,
          message: null,
          locale: null,
          processedAt: null,
          processedBy: null,
        })
        expect(Date.parse(consentAt)).not.toBeNaN()
        expect(Date.parse(createdAt)).not.toBeNaN()

        const processed = await consoleApp.inject({
          method: 'PATCH',
          url: `/demo-requests/${id}`,
          payload: { processed: true },
        })

        expect(processed.statusCode).toBe(200)
        expect(processed.json().demoRequest).toMatchObject({ id, processedBy: adminId })
        expect(Date.parse(processed.json().demoRequest.processedAt)).not.toBeNaN()

        const relisted = await consoleApp.inject({ method: 'GET', url: '/demo-requests' })

        expect(relisted.json().pendingCount).toBe(0)

        const deleted = await consoleApp.inject({ method: 'DELETE', url: `/demo-requests/${id}` })

        expect(deleted.statusCode).toBe(204)
        await expect(db('demo_requests').count('* as count').first()).resolves.toMatchObject({
          count: 0,
        })
      } finally {
        await publicApp.close()
        await consoleApp.close()
        await db('demo_requests').delete()
        await db('admins').where({ id: adminId }).delete()
        await db('companies').where({ id: companyId }).delete()
      }
    })
  })

  describe('purgeExpiredDemoRequests', () => {
    it('deletes a 13-month-old request and keeps an 11-month-old one', async () => {
      const old = await addRequest({ created_at: THIRTEEN_MONTHS_AGO })
      const recent = await addRequest({ created_at: ELEVEN_MONTHS_AGO })

      await expect(purge(db, NOW)).resolves.toBe(1)

      const remaining = await db('demo_requests').select('id')

      expect(remaining.map((row: { id: number }) => Number(row.id))).toEqual([recent])
      expect(remaining.map((row: { id: number }) => Number(row.id))).not.toContain(old)
    })

    it('deletes processed and unprocessed requests alike', async () => {
      await addRequest({ created_at: THIRTEEN_MONTHS_AGO })
      await addRequest({
        created_at: THIRTEEN_MONTHS_AGO,
        processed_at: '2025-10-24T08:00:00.000Z',
      })

      await expect(purge(db, NOW)).resolves.toBe(2)
      await expect(db('demo_requests').count('* as count').first()).resolves.toMatchObject({
        count: 0,
      })
    })

    it('judges the 12 months to the millisecond from created_at', async () => {
      const before = await addRequest({ created_at: JUST_BEFORE_CUTOFF })
      const exactly = await addRequest({ created_at: AT_CUTOFF })

      await expect(purge(db, NOW)).resolves.toBe(1)

      const remaining = await db('demo_requests').select('id')

      expect(remaining.map((row: { id: number }) => Number(row.id))).toEqual([exactly])
      expect(remaining.map((row: { id: number }) => Number(row.id))).not.toContain(before)
    })

    it('does nothing on an empty table or when everything is recent', async () => {
      await expect(purge(db, NOW)).resolves.toBe(0)

      await addRequest({ created_at: ELEVEN_MONTHS_AGO })

      await expect(purge(db, NOW)).resolves.toBe(0)
      await expect(db('demo_requests').count('* as count').first()).resolves.toMatchObject({
        count: 1,
      })
    })
  })

  describe('migration 20261124061000', () => {
    it('refuses to roll back while the table holds requests, then rolls back and replays when empty', async () => {
      await addRequest()

      await expect(
        db.migrate.down({ name: MIGRATION_NAME, directory: MIGRATIONS_DIR })
      ).rejects.toThrow(/Rollback impossible/)
      await expect(db.schema.hasTable('demo_requests')).resolves.toBe(true)
      await expect(db('demo_requests').count('* as count').first()).resolves.toMatchObject({
        count: 1,
      })

      await db('demo_requests').delete()

      try {
        await db.migrate.down({ name: MIGRATION_NAME, directory: MIGRATIONS_DIR })
        await expect(db.schema.hasTable('demo_requests')).resolves.toBe(false)
      } finally {
        await db.migrate.latest({ directory: MIGRATIONS_DIR })
      }

      await expect(db.schema.hasTable('demo_requests')).resolves.toBe(true)
    }, 60_000)
  })
})
