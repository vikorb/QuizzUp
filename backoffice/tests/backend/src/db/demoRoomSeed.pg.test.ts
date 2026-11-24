import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import type dbModule from '@backend/db'
import { roomScheduleSchema } from '@backend/routes/companies/rooms/_schemas'
import { computeRoomSlots, type RoomSchedule } from '@quizzup/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Seed de démonstration `quizz_content_demo_room.js` : la salle de démo est réservable par l'API
 * publique. Les réglages se vérifient sans base ; le rejeu du seed se prouve sur PostgreSQL
 * (`PG_INTEGRATION_URL`, base DÉDIÉE dont le nom finit par `_test`, cf. publicBookingApi.pg.test.ts).
 */
const require = createRequire(import.meta.url)
const demoSeed = require(
  path.resolve(process.cwd(), 'backend/db/seeds/quizz_content_demo_room.js')
) as {
  DEMO_ROOM_SCHEDULE: RoomSchedule
  seed: (knex: Db) => Promise<void>
}

describe('réglages de créneaux de la salle de démo', () => {
  it('passent la validation du backoffice sans être modifiés', () => {
    expect(roomScheduleSchema.parse(demoSeed.DEMO_ROOM_SCHEDULE)).toEqual(
      demoSeed.DEMO_ROOM_SCHEDULE
    )
  })

  it('ouvrent la réservation publique avec des créneaux chaque jour de la semaine', () => {
    expect(demoSeed.DEMO_ROOM_SCHEDULE.publicBooking).toBe(true)

    // 2027-03-01 est un lundi : sept jours consécutifs, midi UTC avant l'ouverture.
    for (let day = 1; day <= 7; day += 1) {
      const slots = computeRoomSlots({
        schedule: demoSeed.DEMO_ROOM_SCHEDULE,
        date: `2027-03-0${day}`,
        now: new Date('2027-02-01T12:00:00.000Z'),
      })

      expect(slots.map((slot) => slot.localTime)).toEqual([
        '10:00',
        '11:00',
        '12:00',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
        '18:00',
        '19:00',
      ])
    }
  })
})

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule

describe.skipIf(!PG_INTEGRATION_URL)('seed de démo sur PostgreSQL', () => {
  let db: Db
  let storageDir: string
  const savedEnv = { ...process.env }

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  }, 30_000)

  beforeEach(async () => {
    storageDir = mkdtempSync(path.join(os.tmpdir(), 'quizzup-demo-seed-'))
    process.env.MEDIA_STORAGE_DIR = storageDir
    delete process.env.DEMO_SEED

    await db.raw(
      'TRUNCATE api_keys, games, question_themes, answers, questions, themes, rooms, admins, companies RESTART IDENTITY CASCADE'
    )
  }, 30_000)

  afterEach(() => {
    process.env = { ...savedEnv, DATABASE_URL: PG_INTEGRATION_URL }
    rmSync(storageDir, { recursive: true, force: true })
  })

  const count = async (table: string) => Number((await db(table).count({ n: '*' }).first())?.n)

  it('crée la salle de démo réservable, sans aucune clé d’API', async () => {
    await demoSeed.seed(db)

    const rooms = await db('rooms').select('name', 'schedule', 'status')

    expect(rooms).toEqual([{ name: 'Salle 1', schedule: demoSeed.DEMO_ROOM_SCHEDULE, status: 1 }])
    expect(await count('api_keys')).toBe(0)
  }, 60_000)

  it('rejoué, ne crée aucun doublon', async () => {
    await demoSeed.seed(db)
    const before = await Promise.all(
      ['companies', 'admins', 'rooms', 'themes', 'questions', 'answers'].map(count)
    )

    await demoSeed.seed(db)
    const after = await Promise.all(
      ['companies', 'admins', 'rooms', 'themes', 'questions', 'answers'].map(count)
    )

    expect(before).toEqual([1, 2, 1, 2, 20, 80])
    expect(after).toEqual(before)
  }, 120_000)

  it('ne rétablit pas des créneaux désactivés ou modifiés au backoffice', async () => {
    await demoSeed.seed(db)

    await db('rooms').update({ schedule: null })
    await demoSeed.seed(db)
    expect((await db('rooms').first('schedule'))?.schedule).toBeNull()

    const custom = { ...demoSeed.DEMO_ROOM_SCHEDULE, slotMinutes: 90 }
    await db('rooms').update({ schedule: custom })
    await demoSeed.seed(db)
    expect((await db('rooms').first('schedule'))?.schedule).toEqual(custom)
  }, 180_000)

  it('ne crée rien avec DEMO_SEED=false', async () => {
    process.env.DEMO_SEED = 'false'

    await demoSeed.seed(db)

    expect(await count('companies')).toBe(0)
    expect(await count('rooms')).toBe(0)
  })
})
