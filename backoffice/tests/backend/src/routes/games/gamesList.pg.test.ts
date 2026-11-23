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
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/routes/games/gamesList.pg.test.ts
 *
 * Le `mockDb` des autres tests ne fait ni de vrai SQL ni de fuseau : bornes de période, tri et
 * total de `GET /companies/:companyId/games` ne se prouvent que sur la vraie base.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `companies`, `admins`, `rooms`, `games` (et dépendantes) sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default
type ListBody = { games: Array<{ id: number; roomName: string }>; total: number }

describe.skipIf(!PG_INTEGRATION_URL)('GET /companies/:companyId/games sur PostgreSQL', () => {
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
      await db('admins').insert({
        id: companyId,
        company_id: companyId,
        role: 'admin',
        username: `admin${companyId}`,
        email: `admin${companyId}@x.test`,
        mdp_hash: 'x',
      })
    }

    await db('rooms').insert([
      { id: 1, company_id: 1, name: 'Salle 1' },
      { id: 2, company_id: 1, name: 'Salle 2' },
      { id: 3, company_id: 2, name: 'Salle 3' },
    ])
  })

  type SeedGame = {
    id: number
    company?: number
    room?: number
    state?: string
    created?: string
    started?: string | null
    deleted?: boolean
  }

  /** Parties `finished` par défaut : seules les parties en attente ou en cours occupent une salle. */
  async function addGame({
    id,
    company = 1,
    room = company === 1 ? 1 : 3,
    state = 'finished',
    created = '2026-11-01T10:00:00.000Z',
    started = null,
    deleted = false,
  }: SeedGame) {
    await db('games').insert({
      id,
      company_id: company,
      room_id: room,
      admin_id: company,
      seed: 1,
      state,
      started_at: started,
      cancelled_at: state === 'cancelled' ? created : null,
      scheduled_at: state === 'scheduled' ? created : null,
      scheduled_end_at: state === 'scheduled' ? '2027-01-01T11:00:00.000Z' : null,
      created_at: created,
      status: deleted ? 2 : 1,
      deleted_at: deleted ? created : null,
    })
  }

  async function list(query = '', user: TestUser = companyAdminUser, companyId = 1) {
    return app.inject({
      method: 'GET',
      url: `/companies/${companyId}/games${query}`,
      headers: authHeaders(user),
    })
  }

  const ids = (response: Awaited<ReturnType<typeof list>>) =>
    parseJson<ListBody>(response).games.map((game) => game.id)

  it('inclut la borne basse et exclut la borne haute (intervalle semi-ouvert)', async () => {
    await addGame({ id: 1, created: '2026-11-05T09:00:00.000Z' })
    await addGame({ id: 2, created: '2026-11-06T00:00:00.000Z' })

    expect(ids(await list('?from=2026-11-05T09:00:00.000Z'))).toEqual([2, 1])
    expect(ids(await list('?to=2026-11-05T09:00:00.000Z'))).toEqual([])
    expect(ids(await list('?to=2026-11-05T09:00:00.001Z'))).toEqual([1])
    // Jours consécutifs : la partie de minuit pile n'apparaît que dans le second.
    expect(ids(await list('?from=2026-11-05T00:00:00Z&to=2026-11-06T00:00:00Z'))).toEqual([1])
    expect(ids(await list('?from=2026-11-06T00:00:00Z&to=2026-11-07T00:00:00Z'))).toEqual([2])
  })

  it('filtre sur la date de démarrage, sinon sur la date de création', async () => {
    await addGame({ id: 1, created: '2026-11-01T10:00:00.000Z' })
    await addGame({
      id: 2,
      created: '2026-11-01T11:00:00.000Z',
      started: '2026-11-05T09:00:00.000Z',
    })

    expect(ids(await list('?from=2026-11-05T00:00:00Z'))).toEqual([2])
    expect(ids(await list('?to=2026-11-02T00:00:00Z'))).toEqual([1])
  })

  it('interprète le fuseau : le jour local de Paris n’est pas le jour UTC', async () => {
    // 23:30 UTC le 5 = 00:30 le 6 à Paris (UTC+1 en novembre).
    await addGame({ id: 1, created: '2026-11-05T23:30:00.000Z' })

    const day5 = '?from=2026-11-05T00:00:00%2B01:00&to=2026-11-06T00:00:00%2B01:00'
    const day6 = '?from=2026-11-06T00:00:00%2B01:00&to=2026-11-07T00:00:00%2B01:00'

    expect(ids(await list(day5))).toEqual([])
    expect(ids(await list(day6))).toEqual([1])
  })

  it('refuse l’année 0000 en 400 au lieu d’une erreur PostgreSQL', async () => {
    await addGame({ id: 1 })

    for (const query of ['?from=0000-01-01T00:00:00Z', '?to=0000-01-01T00:00:00Z']) {
      const response = await list(query)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'invalid_params' })
    }
  })

  it('renvoie un total indépendant de la page, et exclut les parties supprimées', async () => {
    for (let id = 1; id <= 5; id += 1) {
      await addGame({ id })
    }
    await addGame({ id: 6, deleted: true })

    const middle = parseJson<ListBody>(await list('?limit=2&offset=2'))
    const beyond = parseJson<ListBody>(await list('?limit=2&offset=20'))

    expect(middle.games).toHaveLength(2)
    expect(middle.total).toBe(5)
    expect(beyond).toMatchObject({ games: [], total: 5 })
  })

  it('trie par date de partie décroissante puis par id décroissant, sans chevauchement de pages', async () => {
    const same = '2026-11-03T10:00:00.000Z'

    await addGame({ id: 1, created: same })
    await addGame({ id: 2, created: same })
    await addGame({ id: 3, created: same })
    // Créée avant, démarrée après : la date retenue est celle du démarrage, elle passe en tête.
    await addGame({
      id: 4,
      created: '2026-11-01T10:00:00.000Z',
      started: '2026-11-04T10:00:00.000Z',
    })
    await addGame({ id: 5, created: '2026-11-02T10:00:00.000Z' })

    const pages = [
      ...ids(await list('?limit=2&offset=0')),
      ...ids(await list('?limit=2&offset=2')),
      ...ids(await list('?limit=2&offset=4')),
    ]

    expect(pages).toEqual([4, 3, 2, 1, 5])
  })

  it('filtre par état, y compris les états des sessions programmées', async () => {
    await addGame({ id: 1, state: 'finished' })
    await addGame({ id: 2, state: 'scheduled', room: 2 })
    await addGame({ id: 3, state: 'cancelled', room: 2 })

    expect(ids(await list('?state=scheduled'))).toEqual([2])
    expect(ids(await list('?state=cancelled'))).toEqual([3])
    expect(ids(await list('?state=finished'))).toEqual([1])
    expect(parseJson<ListBody>(await list()).total).toBe(3)
  })

  it('ne montre jamais les parties d’une autre compagnie', async () => {
    await addGame({ id: 1, company: 1 })
    await addGame({ id: 2, company: 2 })

    const otherCompany = await list('', companyAdminUser, 2)
    const otherRoom = parseJson<ListBody>(await list('?roomId=3'))
    const asSuperadmin = parseJson<ListBody>(await list('', superadminUser, 2))

    expect(ids(await list())).toEqual([1])
    expect(otherCompany.statusCode).toBe(403)
    expect(otherRoom).toMatchObject({ games: [], total: 0 })
    expect(asSuperadmin.games.map((game) => game.id)).toEqual([2])
    expect(asSuperadmin.games[0]!.roomName).toBe('Salle 3')
    expect(asSuperadmin.total).toBe(1)
  })
})
