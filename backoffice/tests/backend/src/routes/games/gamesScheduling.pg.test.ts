import path from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../../setup/assertTestDatabase'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts --no-file-parallelism \
 *     tests/backend/src/routes/games/gamesScheduling.pg.test.ts
 *
 * Le `mockDb` n'applique aucune contrainte : le créneau déjà pris (contrainte d'exclusion,
 * SQLSTATE 23P01 → `slot_taken`) et deux créations simultanées ne se prouvent que sur la vraie base.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `companies`, `admins`, `rooms`, `games` (et dépendantes) sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default
type GameBody = { game: { id: number; state: string; scheduledAt: string; scheduledEndAt: string } }

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** Début d'une session `hours` heures après la prochaine heure pleine, à la minute près. */
function inHours(hours: number): Date {
  return new Date(Math.ceil(Date.now() / HOUR_MS) * HOUR_MS + hours * HOUR_MS)
}

describe.skipIf(!PG_INTEGRATION_URL)('sessions programmées sur PostgreSQL', () => {
  let db: Db
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })

    const gamesRoutes = (await import('@backend/routes/games')).default
    app = await createRouteApp(gamesRoutes)
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await db?.destroy()
  })

  beforeEach(async () => {
    await db.raw(
      'TRUNCATE game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
    )

    for (const companyId of [1, 2]) {
      await db('companies').insert({
        id: companyId,
        name: `Centre ${companyId}`,
        email: `c${companyId}@x.test`,
      })
    }

    await db('admins').insert([
      {
        id: 1,
        company_id: 1,
        role: 'superadmin',
        username: 'root',
        email: 'r@x.test',
        mdp_hash: 'x',
      },
      {
        id: 2,
        company_id: 1,
        role: 'admin',
        username: 'admin1',
        email: 'a1@x.test',
        mdp_hash: 'x',
      },
      {
        id: 3,
        company_id: 2,
        role: 'admin',
        username: 'admin2',
        email: 'a2@x.test',
        mdp_hash: 'x',
      },
    ])
    await db('rooms').insert([
      { id: 1, company_id: 1, name: 'Salle 1' },
      { id: 2, company_id: 1, name: 'Salle 2' },
      { id: 3, company_id: 2, name: 'Salle 3' },
    ])
  })

  function request(
    method: 'POST' | 'PATCH',
    url: string,
    payload?: Record<string, unknown>,
    user: TestUser = companyAdminUser
  ) {
    return app.inject({ method, url, headers: authHeaders(user), payload })
  }

  function schedule(startsAt: Date, extra: Record<string, unknown> = {}, roomId = 1) {
    return request('POST', '/companies/1/games', {
      roomId,
      scheduledAt: startsAt.toISOString(),
      durationMinutes: 60,
      ...extra,
    })
  }

  it('lets one of two simultaneous creations on the same slot through', async () => {
    const startsAt = inHours(48)

    const responses = await Promise.all([schedule(startsAt), schedule(startsAt)])

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409])
    const refused = responses.find((response) => response.statusCode === 409)!
    expect(parseJson(refused)).toEqual({ error: 'slot_taken' })
    expect(await db('games').count({ count: '*' })).toEqual([{ count: 1 }])
  })

  it('refuses an overlapping session, accepts back-to-back ones and other rooms', async () => {
    const startsAt = inHours(48)

    const first = await schedule(startsAt)
    const overlapping = await schedule(new Date(startsAt.getTime() + 30 * MINUTE_MS))
    const backToBack = await schedule(new Date(startsAt.getTime() + HOUR_MS))
    const otherRoom = await schedule(startsAt, {}, 2)

    expect(first.statusCode).toBe(201)
    expect(overlapping.statusCode).toBe(409)
    expect(parseJson(overlapping)).toEqual({ error: 'slot_taken' })
    expect(backToBack.statusCode).toBe(201)
    expect(otherRoom.statusCode).toBe(201)
  })

  it('frees the slot on cancel and erases the emails of the players at once', async () => {
    const startsAt = inHours(48)
    const created = await schedule(startsAt, {
      participants: [
        {
          podium: 1,
          displayName: 'Léa',
          email: 'lea@exemple.fr',
          emailConsent: true,
          marketingConsent: true,
          secondPlayer: { displayName: 'Noé', email: 'noe@exemple.fr', emailConsent: true },
        },
      ],
    })
    const { id } = parseJson<GameBody>(created).game

    const cancelled = await request('POST', `/companies/1/games/${id}/cancel`)
    const again = await request('POST', `/companies/1/games/${id}/cancel`)
    const reused = await schedule(startsAt)

    expect(cancelled.statusCode).toBe(200)
    expect(parseJson<GameBody>(cancelled).game.state).toBe('cancelled')
    expect(again.statusCode).toBe(200)
    expect(reused.statusCode).toBe(201)
    expect(await db('game_participants').where('game_id', id).first()).toMatchObject({
      display_name: 'Léa',
      second_display_name: 'Noé',
      email: null,
      consent_at: null,
      marketing_consent_at: null,
      second_email: null,
      second_consent_at: null,
      second_marketing_consent_at: null,
    })
    expect(await db('games').where('id', id).first()).toMatchObject({ status: 1 })
  })

  it('refuses to move a session onto a taken slot, and moves it onto a free one', async () => {
    const startsAt = inHours(48)
    await schedule(startsAt)
    const moving = parseJson<GameBody>(await schedule(new Date(startsAt.getTime() + 3 * HOUR_MS)))
    const url = `/companies/1/games/${moving.game.id}`

    const taken = await request('PATCH', url, { scheduledAt: startsAt.toISOString() })
    const free = await request('PATCH', url, {
      scheduledAt: new Date(startsAt.getTime() + 5 * HOUR_MS).toISOString(),
      participants: [{ podium: 1, displayName: 'Hugo' }],
    })

    expect(taken.statusCode).toBe(409)
    expect(parseJson(taken)).toEqual({ error: 'slot_taken' })
    expect(free.statusCode).toBe(200)
    expect(parseJson<GameBody>(free).game.scheduledAt).toBe(
      new Date(startsAt.getTime() + 5 * HOUR_MS).toISOString()
    )
    expect(await db('game_participants').where('game_id', moving.game.id)).toHaveLength(1)
  })

  it('opens a session within the hour and answers room_busy for the next one', async () => {
    const soon = new Date(Math.ceil(Date.now() / MINUTE_MS) * MINUTE_MS + 20 * MINUTE_MS)
    const later = new Date(soon.getTime() + 30 * MINUTE_MS)
    const farAway = inHours(72)
    const first = parseJson<GameBody>(await schedule(soon, { durationMinutes: 20 })).game
    const second = parseJson<GameBody>(await schedule(later, { durationMinutes: 20 })).game
    const third = parseJson<GameBody>(await schedule(farAway)).game
    const open = (id: number, companyId = 1, user: TestUser = companyAdminUser) =>
      request('POST', `/companies/${companyId}/games/${id}/open`, undefined, user)

    const tooEarly = await open(third.id)
    const opened = await open(first.id)
    const busy = await open(second.id)
    const secondFromOtherCompany = await open(second.id, 2)

    expect(tooEarly.statusCode).toBe(409)
    expect(parseJson(tooEarly)).toEqual({ error: 'session_not_open_yet' })
    expect(opened.statusCode).toBe(200)
    expect(parseJson<GameBody>(opened).game.state).toBe('pending')
    expect(busy.statusCode).toBe(409)
    expect(parseJson(busy)).toEqual({ error: 'room_busy' })
    expect(secondFromOtherCompany.statusCode).toBe(403)
    expect(await db('games').orderBy('id').select('state')).toEqual([
      { state: 'pending' },
      { state: 'scheduled' },
      { state: 'scheduled' },
    ])
  })

  it('answers room_busy when a game is running in the room, the unique index refuses', async () => {
    const soon = new Date(Math.ceil(Date.now() / MINUTE_MS) * MINUTE_MS + 20 * MINUTE_MS)
    const { id } = parseJson<GameBody>(await schedule(soon, { durationMinutes: 20 })).game
    await db('games').insert({ company_id: 1, room_id: 1, admin_id: 2, seed: 1, state: 'running' })

    const busy = await request('POST', `/companies/1/games/${id}/open`)

    expect(busy.statusCode).toBe(409)
    expect(parseJson(busy)).toEqual({ error: 'room_busy' })
    expect(await db('games').where('id', id).first()).toMatchObject({ state: 'scheduled' })
  })

  it('answers 404 to a superadmin opening a game through another company', async () => {
    const soon = new Date(Math.ceil(Date.now() / MINUTE_MS) * MINUTE_MS + 20 * MINUTE_MS)
    const { id } = parseJson<GameBody>(await schedule(soon, { durationMinutes: 20 })).game

    const response = await request(
      'POST',
      `/companies/2/games/${id}/open`,
      undefined,
      superadminUser
    )

    expect(response.statusCode).toBe(404)
    expect(await db('games').where('id', id).first()).toMatchObject({ state: 'scheduled' })
  })
})
