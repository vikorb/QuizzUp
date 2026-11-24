import path from 'node:path'

import type dbModule from '@backend/db'
import type routesCompaniesRoomsLogsModule from '@backend/routes/companies/rooms/logs'
import type { pruneRoomLogs as pruneRoomLogsType } from '@backend/routes/room/_logs'
import type routesRoomLogsModule from '@backend/routes/room/logs'
import { ROOM_LOG_MAX_PER_ROOM } from '@quizzup/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'
import { authHeaders, createRouteApp, type TestUser } from '../routes/_helpers/testApp'

/**
 * Journaux d'erreurs des salles sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts tests/backend/src/db/roomLogs.pg.test.ts
 *
 * Base DÉDIÉE (le nom doit finir par `_test`) : les migrations y sont appliquées et `room_logs`,
 * `rooms`, `admins`, `companies` sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL
if (PG_INTEGRATION_URL) process.env.DATABASE_URL = PG_INTEGRATION_URL

type Db = typeof dbModule

const DAY_MS = 86_400_000

const roomUser = (companyId: number, roomId: number) =>
  ({
    sub: String(100 + roomId),
    id: 100 + roomId,
    company_id: companyId,
    role: 'room',
    room_id: roomId,
    sid: `sid-room-${roomId}`,
  }) as TestUser

const admin = (companyId: number) =>
  ({
    sub: String(companyId),
    id: companyId,
    company_id: companyId,
    role: 'admin',
    sid: `sid-admin-${companyId}`,
  }) as TestUser

describe.skipIf(!PG_INTEGRATION_URL)('journaux des salles sur PostgreSQL', () => {
  let db: Db
  let pruneRoomLogs: typeof pruneRoomLogsType
  let roomLogsRoutes: typeof routesRoomLogsModule
  let companyRoomLogsRoutes: typeof routesCompaniesRoomsLogsModule

  beforeAll(async () => {
    db = (await import('@backend/db')).default
    pruneRoomLogs = (await import('@backend/routes/room/_logs')).pruneRoomLogs
    roomLogsRoutes = (await import('@backend/routes/room/logs')).default
    companyRoomLogsRoutes = (await import('@backend/routes/companies/rooms/logs')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  beforeEach(async () => {
    delete process.env.ROOM_LOG_RETENTION_DAYS
    await db.raw('TRUNCATE room_logs, rooms, admins, companies RESTART IDENTITY CASCADE')

    for (const id of [1, 2]) {
      await db('companies').insert({ id, name: `Centre ${id}`, email: `c${id}@x.test` })
      await db('rooms').insert({ id, company_id: id, name: `Salle ${id}` })
    }
  })

  const log = (roomId: number, overrides: Record<string, unknown> = {}) => ({
    company_id: roomId,
    room_id: roomId,
    level: 'error',
    code: 'dmx_output_error',
    message: 'Interface DMX débranchée',
    app_version: '1.0.0',
    occurred_at: new Date(),
    ...overrides,
  })

  const countOf = async (roomId: number) =>
    Number((await db('room_logs').where('room_id', roomId).count('* as n'))[0]!.n)

  describe('contraintes', () => {
    it('applique les valeurs par défaut', async () => {
      const [row] = await db('room_logs').insert(log(1)).returning(['occurrences', 'created_at'])

      expect(row!.occurrences).toBe(1)
      expect(row!.created_at).toBeInstanceOf(Date)
    })

    it.each([
      ['un niveau inconnu', { level: 'info' }],
      ['zéro occurrence', { occurrences: 0 }],
      ['un contexte de plus de 1 Ko', { context: JSON.stringify({ route: 'x'.repeat(1100) }) }],
      ['un code de plus de 64 caractères', { code: 'a'.repeat(65) }],
      ['un message de plus de 300 caractères', { message: 'm'.repeat(301) }],
    ])('refuse %s', async (_name, overrides) => {
      await expect(db('room_logs').insert(log(1, overrides))).rejects.toThrow()
    })

    it('supprime les journaux avec leur salle', async () => {
      await db('room_logs').insert([log(1), log(2)])

      await db('rooms').where('id', 1).delete()

      expect(await countOf(1)).toBe(0)
      expect(await countOf(2)).toBe(1)
    })
  })

  describe('nettoyage', () => {
    it('efface au bout de 30 jours, pour la salle seulement', async () => {
      await db('room_logs').insert([
        log(1, { code: 'vieux', created_at: new Date(Date.now() - 31 * DAY_MS) }),
        log(1, { code: 'recent', created_at: new Date(Date.now() - 29 * DAY_MS) }),
        log(2, { code: 'vieux_autre_salle', created_at: new Date(Date.now() - 400 * DAY_MS) }),
      ])

      await pruneRoomLogs(db, 1)

      const rows = await db('room_logs').orderBy('id').select('code')
      expect(rows.map((row) => row.code)).toEqual(['recent', 'vieux_autre_salle'])
    })

    it('respecte ROOM_LOG_RETENTION_DAYS', async () => {
      process.env.ROOM_LOG_RETENTION_DAYS = '7'
      await db('room_logs').insert([
        log(1, { code: 'huit_jours', created_at: new Date(Date.now() - 8 * DAY_MS) }),
        log(1, { code: 'six_jours', created_at: new Date(Date.now() - 6 * DAY_MS) }),
      ])

      await pruneRoomLogs(db, 1)

      expect((await db('room_logs').select('code')).map((row) => row.code)).toEqual(['six_jours'])
    })

    it('garde les 5 000 lignes les plus récentes de la salle', async () => {
      await db.raw(
        `INSERT INTO room_logs (company_id, room_id, level, code, message, app_version, occurred_at)
         SELECT 1, 1, 'error', 'bulk', 'n' || g, '1.0.0', now() FROM generate_series(1, ?) g`,
        [ROOM_LOG_MAX_PER_ROOM + 3]
      )
      await db('room_logs').insert(log(2))

      await pruneRoomLogs(db, 1)

      expect(await countOf(1)).toBe(ROOM_LOG_MAX_PER_ROOM)
      const oldest = await db('room_logs').where('room_id', 1).orderBy('id').first('message')
      // Les 3 premières (n1 à n3) sont parties.
      expect(oldest!.message).toBe('n4')
      expect(await countOf(2)).toBe(1)
    })

    it('ne touche à rien quand tout est récent et sous le plafond', async () => {
      await db('room_logs').insert([log(1), log(1)])

      await pruneRoomLogs(db, 1)

      expect(await countOf(1)).toBe(2)
    })
  })

  describe('routes', () => {
    it("enregistre un envoi de la salle et le rend à l'admin de la compagnie", async () => {
      const salle = await createRouteApp(roomLogsRoutes)
      const personnel = await createRouteApp(companyRoomLogsRoutes)

      const posted = await salle.inject({
        method: 'POST',
        url: '/room/logs',
        headers: authHeaders(roomUser(1, 1)),
        payload: {
          appVersion: '1.2.3',
          entries: [
            {
              level: 'error',
              code: 'dmx_output_error',
              message: 'Pas de réponse de lea@exemple.fr',
              context: { driver: 'usbpro', desk: 2, name: 'Léa' },
              occurrences: 4,
              occurredAt: '2026-11-20T10:00:00.000Z',
            },
            {
              level: 'warn',
              code: 'gamepad_lost',
              message: 'Manette perdue',
              occurredAt: '2026-11-20T10:01:00.000Z',
            },
          ],
        } as never,
      })

      expect(posted.statusCode).toBe(204)

      const read = await personnel.inject({
        method: 'GET',
        url: '/companies/1/rooms/1/logs',
        headers: authHeaders(admin(1)),
      })

      expect(read.statusCode).toBe(200)
      const { logs } = read.json() as { logs: Array<Record<string, unknown>> }

      expect(logs.map((row) => row.code)).toEqual(['gamepad_lost', 'dmx_output_error'])
      expect(logs[0]).toMatchObject({
        level: 'warn',
        context: null,
        occurrences: 1,
        appVersion: '1.2.3',
      })
      expect(logs[1]).toMatchObject({
        message: 'Pas de réponse de [email]',
        context: { driver: 'usbpro', desk: 2 },
        occurrences: 4,
        occurredAt: '2026-11-20T10:00:00.000Z',
      })
      expect(JSON.stringify(logs)).not.toContain('exemple.fr')
      expect(JSON.stringify(logs)).not.toContain('Léa')

      // Une autre compagnie ne lit rien, et la salle 2 n'a reçu aucune ligne.
      const other = await personnel.inject({
        method: 'GET',
        url: '/companies/1/rooms/1/logs',
        headers: authHeaders(admin(2)),
      })
      expect(other.statusCode).toBe(403)
      expect(await countOf(2)).toBe(0)

      await salle.close()
      await personnel.close()
    })

    it('pagine avec before et limit, du plus récent au plus ancien', async () => {
      await db('room_logs').insert(
        ['a', 'b', 'c', 'd', 'e'].map((code) =>
          log(1, { code, level: code === 'c' ? 'warn' : 'error' })
        )
      )
      const personnel = await createRouteApp(companyRoomLogsRoutes)
      const read = async (query: string) => {
        const response = await personnel.inject({
          method: 'GET',
          url: `/companies/1/rooms/1/logs${query}`,
          headers: authHeaders(admin(1)),
        })

        return (response.json() as { logs: Array<{ id: number; code: string }> }).logs
      }

      const first = await read('?limit=2')
      const next = await read(`?limit=2&before=${first[1]!.id}`)

      expect(first.map((row) => row.code)).toEqual(['e', 'd'])
      expect(next.map((row) => row.code)).toEqual(['c', 'b'])
      expect((await read('?level=warn')).map((row) => row.code)).toEqual(['c'])

      await personnel.close()
    })

    it('nettoie à chaque insertion et limite à 6 envois par minute', async () => {
      await db('room_logs').insert(
        log(1, { code: 'perime', created_at: new Date(Date.now() - 40 * DAY_MS) })
      )
      const salle = await createRouteApp(roomLogsRoutes)
      const send = () =>
        salle.inject({
          method: 'POST',
          url: '/room/logs',
          headers: authHeaders(roomUser(1, 1)),
          payload: {
            appVersion: '1',
            entries: [
              { level: 'warn', code: 'x', message: 'm', occurredAt: new Date().toISOString() },
            ],
          } as never,
        })

      expect((await send()).statusCode).toBe(204)
      expect(await db('room_logs').where('code', 'perime')).toHaveLength(0)

      for (let index = 0; index < 5; index += 1) {
        expect((await send()).statusCode).toBe(204)
      }
      expect((await send()).statusCode).toBe(429)

      await salle.close()
    })
  })
})
