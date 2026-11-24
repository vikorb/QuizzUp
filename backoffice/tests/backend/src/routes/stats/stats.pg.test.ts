import path from 'node:path'

import type dbModule from '@backend/db'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../../setup/assertTestDatabase'
import {
  authHeaders,
  companyAdminUser,
  companyUser,
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
 *     tests/backend/src/routes/stats/stats.pg.test.ts
 *
 * Le `mockDb` des autres tests ne sait ni agréger ni changer de fuseau : chaque indicateur de
 * `GET /companies/:companyId/stats` se prouve ici, sur un jeu de données fixe.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `companies`, `admins`, `rooms`, `games` (et dépendantes) sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule
type StatsBody = {
  period: { from: string; to: string; timeZone: string }
  sessions: {
    finished: number
    aborted: number
    abandonRate: number | null
    medianDurationSeconds: number | null
    byRoom: Array<{ roomId: number; roomName: string; finished: number; aborted: number }>
  }
  players: {
    total: number
    averagePerSession: number | null
    withEmail: number
    emailRate: number | null
    withMarketingConsent: number
    marketingConsentRate: number | null
    distinctEmails: number
    returningEmails: number
  }
  busiestSlots: Array<{ weekday: number; hour: number; sessions: number }>
}

// Période du jeu de données : mars à novembre 2026, heure de Paris.
const PERIOD = 'from=2026-03-01T00:00:00%2B01:00&to=2026-12-01T00:00:00%2B01:00'

describe.skipIf(!PG_INTEGRATION_URL)('GET /companies/:companyId/stats sur PostgreSQL', () => {
  let db: Db
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })

    const statsRoutes = (await import('@backend/routes/stats')).default
    app = await createRouteApp(statsRoutes)
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await db?.destroy()
  })

  type SeedPlayer = {
    email?: string
    marketing?: boolean
    second?: { name: string; email?: string; marketing?: boolean }
  }

  type SeedGame = {
    id: number
    company?: number
    room?: number
    state?: string
    started?: string | null
    minutes?: number
    created?: string
    deleted?: boolean
    players?: SeedPlayer[]
  }

  /** Une partie terminée de `minutes` minutes par défaut ; les joueurs sont numérotés par pupitre. */
  async function addGame({
    id,
    company = 1,
    room = company === 1 ? 1 : 3,
    state = 'finished',
    started = null,
    minutes = 30,
    created = '2026-01-01T10:00:00.000Z',
    deleted = false,
    players = [],
  }: SeedGame) {
    const startedAt = started ? new Date(started) : null

    await db('games').insert({
      id,
      company_id: company,
      room_id: room,
      admin_id: company,
      seed: 1,
      state,
      started_at: startedAt,
      finished_at:
        state === 'finished' && startedAt ? new Date(startedAt.getTime() + minutes * 60_000) : null,
      cancelled_at: state === 'cancelled' ? created : null,
      created_at: created,
      status: deleted ? 2 : 1,
      deleted_at: deleted ? created : null,
    })

    for (const [index, player] of players.entries()) {
      const email = player.email ?? null
      const secondEmail = player.second?.email ?? null

      await db('game_participants').insert({
        game_id: id,
        podium: index + 1,
        display_name: `Joueur ${id}-${index + 1}`,
        email,
        consent_at: email ? new Date() : null,
        marketing_consent_at: email && player.marketing ? new Date() : null,
        second_display_name: player.second?.name ?? null,
        second_email: secondEmail,
        second_consent_at: secondEmail ? new Date() : null,
        second_marketing_consent_at: secondEmail && player.second?.marketing ? new Date() : null,
      })
    }
  }

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
      { id: 1, company_id: 1, name: 'Salle A' },
      { id: 2, company_id: 1, name: 'Salle B' },
      { id: 3, company_id: 2, name: 'Salle C' },
    ])
  })

  /**
   * Jeu de données de la compagnie 1 (fuseau Europe/Paris, passage à l'heure d'été le 29 mars 2026
   * à 02:00 → 03:00). Adresses fictives, jamais lues par l'API.
   *
   *  1  A  terminée  sam. 28/03 23:30Z (= dim. 00:30 hiver)   40 min  a@ (offres) + b@ au 2e joueur, 1 sans e-mail
   *  2  A  terminée  dim. 29/03 01:30Z (= dim. 03:30 été)     20 min  A@ en majuscules, seule
   *  3  B  terminée  dim. 05/07 22:30Z (= lun. 00:30 été)     60 min  c@, a@ en double (pupitre et 2e joueur)
   *  4  A  arrêtée   10/05 démarrée, avec un joueur
   *  5  A  arrêtée   jamais démarrée (création 11/05) → pas un abandon, exclue
   *  6  A  terminée  mais supprimée                  → exclue
   *  7  A  annulée                                    → exclue
   *  8  A  terminée  en 2025, hors période            → exclue
   *  9  compagnie 2, terminée dans la période         → exclue de la compagnie 1
   */
  async function seedDataset() {
    await addGame({
      id: 1,
      started: '2026-03-28T23:30:00Z',
      minutes: 40,
      players: [
        {
          email: 'a@x.test',
          marketing: true,
          second: { name: 'Second 1', email: 'b@x.test' },
        },
        {},
      ],
    })
    await addGame({
      id: 2,
      started: '2026-03-29T01:30:00Z',
      minutes: 20,
      players: [{ email: 'A@X.TEST' }],
    })
    await addGame({
      id: 3,
      room: 2,
      started: '2026-07-05T22:30:00Z',
      minutes: 60,
      players: [
        { email: 'c@x.test' },
        { email: 'a@x.test', second: { name: 'Second 3', email: 'a@x.test' } },
      ],
    })
    await addGame({
      id: 4,
      state: 'aborted',
      started: '2026-05-10T10:00:00Z',
      players: [{ email: 'd@x.test', marketing: true }],
    })
    await addGame({ id: 5, state: 'aborted', created: '2026-05-11T10:00:00Z' })
    await addGame({
      id: 6,
      started: '2026-04-01T10:00:00Z',
      deleted: true,
      players: [{ email: 'e@x.test' }],
    })
    await addGame({ id: 7, state: 'cancelled', created: '2026-04-02T10:00:00Z' })
    await addGame({ id: 8, started: '2025-01-01T10:00:00Z', players: [{ email: 'f@x.test' }] })
    await addGame({ id: 9, company: 2, started: '2026-04-03T10:00:00Z', players: [{}] })
  }

  async function stats(
    query = PERIOD,
    { user = companyAdminUser, companyId = 1 }: { user?: TestUser; companyId?: number } = {}
  ) {
    return app.inject({
      method: 'GET',
      url: `/companies/${companyId}/stats?${query}`,
      headers: authHeaders(user),
    })
  }

  async function statsBody(query = PERIOD, options = {}) {
    const response = await stats(query, options)

    expect(response.statusCode).toBe(200)

    return parseJson<StatsBody>(response)
  }

  it('compte les sessions terminées et arrêtées par salle, sans les parties supprimées, annulées ou hors période', async () => {
    await seedDataset()

    const { sessions } = await statsBody(`${PERIOD}&tz=Europe/Paris`)

    expect(sessions.finished).toBe(3)
    expect(sessions.aborted).toBe(1)
    expect(sessions.byRoom).toEqual([
      { roomId: 1, roomName: 'Salle A', finished: 2, aborted: 1 },
      { roomId: 2, roomName: 'Salle B', finished: 1, aborted: 0 },
    ])
  })

  it('calcule le taux d’abandon : arrêtées sur terminées et arrêtées', async () => {
    await seedDataset()

    // Partie 4 seule : la partie 5, arrêtée sans avoir démarré, n'en est pas un.
    expect((await statsBody()).sessions.abandonRate).toBe(0.25)
  })

  it('calcule la durée réelle médiane des sessions terminées', async () => {
    await seedDataset()

    // 20, 40 et 60 minutes : la médiane est la session du milieu.
    expect((await statsBody()).sessions.medianDurationSeconds).toBe(2400)
  })

  it('moyenne de deux durées quand leur nombre est pair', async () => {
    await addGame({ id: 1, started: '2026-04-01T10:00:00Z', minutes: 20 })
    await addGame({ id: 2, started: '2026-04-02T10:00:00Z', minutes: 41 })

    expect((await statsBody()).sessions.medianDurationSeconds).toBe(1830)
  })

  it('compte les joueurs accueillis (pupitres et seconds joueurs) des sessions terminées et leur moyenne', async () => {
    await seedDataset()

    const { players } = await statsBody()

    // Parties 1 (3 joueurs), 2 (1) et 3 (3) ; la partie arrêtée n'est pas comptée.
    expect(players.total).toBe(7)
    expect(players.averagePerSession).toBe(2.3)
  })

  it('calcule la part de joueurs qui laissent un e-mail et celle qui acceptent les offres', async () => {
    await seedDataset()

    const { players } = await statsBody()

    expect(players.withEmail).toBe(6)
    expect(players.emailRate).toBe(0.8571)
    expect(players.withMarketingConsent).toBe(1)
    expect(players.marketingConsentRate).toBe(0.1429)
  })

  it('repère les joueurs fidèles : e-mails normalisés vus dans au moins deux sessions', async () => {
    await seedDataset()

    const { players } = await statsBody()

    // a@ est vue dans les sessions 1, 2 (en majuscules) et 3 (deux fois, comptée une fois) ;
    // b@ et c@ une seule fois. d@ appartient à une session arrêtée.
    expect(players.distinctEmails).toBe(3)
    expect(players.returningEmails).toBe(1)
  })

  it('une même adresse sur deux pupitres d’une session ne la rend pas fidèle', async () => {
    await addGame({
      id: 1,
      started: '2026-04-01T10:00:00Z',
      players: [{ email: 'a@x.test' }, { email: 'a@x.test' }],
    })

    const { players } = await statsBody()

    expect(players).toMatchObject({ distinctEmails: 1, returningEmails: 0 })
  })

  it('range les créneaux dans le fuseau demandé, avant et après le passage à l’heure d’été', async () => {
    await seedDataset()

    const paris = await statsBody(`${PERIOD}&tz=Europe/Paris`)
    const utc = await statsBody(`${PERIOD}&tz=UTC`)

    // Lundi = 1, dimanche = 7. Session 3 : lundi 00 h en été (UTC+2), pas dimanche 23 h.
    // Session 1 : dimanche 0 h en hiver (UTC+1). Session 2 : dimanche 3 h (02 h 30 n'existe pas).
    expect(paris.busiestSlots).toEqual([
      { weekday: 1, hour: 0, sessions: 1 },
      { weekday: 7, hour: 0, sessions: 1 },
      { weekday: 7, hour: 3, sessions: 1 },
    ])
    expect(utc.busiestSlots).toEqual([
      { weekday: 6, hour: 23, sessions: 1 },
      { weekday: 7, hour: 1, sessions: 1 },
      { weekday: 7, hour: 22, sessions: 1 },
    ])
    expect(paris.period.timeZone).toBe('Europe/Paris')
  })

  it('classe les créneaux du plus chargé au moins chargé', async () => {
    await addGame({ id: 1, started: '2026-04-04T18:00:00Z' })
    await addGame({ id: 2, started: '2026-04-11T18:30:00Z' })
    await addGame({ id: 3, started: '2026-04-06T08:00:00Z' })

    expect((await statsBody()).busiestSlots).toEqual([
      { weekday: 6, hour: 18, sessions: 2 },
      { weekday: 1, hour: 8, sessions: 1 },
    ])
  })

  it('ne garde que les dix créneaux les plus chargés', async () => {
    for (let hour = 0; hour < 12; hour += 1) {
      await addGame({
        id: hour + 1,
        started: `2026-04-07T${String(hour).padStart(2, '0')}:00:00Z`,
      })
    }

    expect((await statsBody()).busiestSlots).toHaveLength(10)
  })

  it('inclut la borne basse et exclut la borne haute', async () => {
    await seedDataset()

    const first = await statsBody('from=2026-03-28T23:30:00Z&to=2026-03-29T01:30:00Z')

    expect(first.sessions).toMatchObject({ finished: 1, aborted: 0 })
  })

  it('ne compte pas comme abandon une partie arrêtée avant d’avoir démarré', async () => {
    await seedDataset()

    // La fenêtre ne contient que la partie 5 (arrêtée le 11/05 sans avoir démarré).
    const { sessions } = await statsBody('from=2026-05-11T00:00:00Z&to=2026-05-12T00:00:00Z')

    expect(sessions).toEqual({
      finished: 0,
      aborted: 0,
      abandonRate: null,
      medianDurationSeconds: null,
      byRoom: [],
    })
  })

  it('filtre par salle, y compris les e-mails fidèles', async () => {
    await seedDataset()

    const roomB = await statsBody(`${PERIOD}&roomId=2`)

    expect(roomB.sessions).toMatchObject({ finished: 1, aborted: 0, medianDurationSeconds: 3600 })
    expect(roomB.sessions.byRoom).toEqual([
      { roomId: 2, roomName: 'Salle B', finished: 1, aborted: 0 },
    ])
    expect(roomB.players).toMatchObject({ total: 3, distinctEmails: 2, returningEmails: 0 })
    expect(roomB.busiestSlots).toEqual([{ weekday: 7, hour: 22, sessions: 1 }])
  })

  it('renvoie des zéros et des valeurs nulles sans aucune session', async () => {
    const body = await statsBody()

    expect(body.sessions).toEqual({
      finished: 0,
      aborted: 0,
      abandonRate: null,
      medianDurationSeconds: null,
      byRoom: [],
    })
    expect(body.players).toEqual({
      total: 0,
      averagePerSession: null,
      withEmail: 0,
      emailRate: null,
      withMarketingConsent: 0,
      marketingConsentRate: null,
      distinctEmails: 0,
      returningEmails: 0,
    })
    expect(body.busiestSlots).toEqual([])
  })

  it('prend 30 jours avant maintenant par défaut', async () => {
    const day = 24 * 60 * 60 * 1000
    const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString()

    await addGame({ id: 1, started: iso(-5) })
    await addGame({ id: 2, started: iso(-29) })
    await addGame({ id: 3, started: iso(-45) })

    const body = parseJson<StatsBody>(await stats(''))

    expect(body.sessions.finished).toBe(2)
    expect(new Date(body.period.to).getTime() - new Date(body.period.from).getTime()).toBe(30 * day)
    expect(body.period.timeZone).toBe('UTC')
  })

  it('ne montre ni ne compte jamais la compagnie voisine', async () => {
    await seedDataset()

    const own = await statsBody()
    const otherAsAdmin = await stats(PERIOD, { companyId: 2 })
    const otherAsSuperadmin = await statsBody(PERIOD, { user: superadminUser, companyId: 2 })
    const roomOfOther = await statsBody(`${PERIOD}&roomId=3`)

    expect(own.sessions.byRoom.map((room) => room.roomId)).toEqual([1, 2])
    expect(otherAsAdmin.statusCode).toBe(403)
    expect(otherAsSuperadmin.sessions.byRoom).toEqual([
      { roomId: 3, roomName: 'Salle C', finished: 1, aborted: 0 },
    ])
    expect(otherAsSuperadmin.players.total).toBe(1)
    // La salle d'une autre compagnie, demandée par sa propre compagnie : rien.
    expect(roomOfOther.sessions.byRoom).toEqual([])
  })

  it('refuse le rôle user : les statistiques sont réservées à l’admin et au superadmin', async () => {
    await seedDataset()

    const staff = await stats(PERIOD, { user: { ...companyUser, company_id: 1, companyId: 1 } })

    expect(staff.statusCode).toBe(403)
  })

  it('ne laisse sortir aucune donnée d’un joueur', async () => {
    await seedDataset()

    const raw = (await stats(`${PERIOD}&tz=Europe/Paris`)).body

    expect(raw).not.toMatch(/x\.test|Joueur \d|Second \d|@/)
  })

  it('refuse en 400 un nom de fuseau que PostgreSQL ne connaît pas, même si Intl le connaît', async () => {
    await seedDataset()

    for (const tz of ['US/Pacific-New', 'Mars/Olympus', '%2B02:00']) {
      const response = await stats(`${PERIOD}&tz=${tz}`)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'stats_timezone_invalid' })
    }
  })

  it('accepte les fuseaux que PostgreSQL connaît, sans tenir compte de la casse', async () => {
    await seedDataset()

    for (const tz of ['PST8PDT', 'EST5EDT', 'europe/paris', 'utc']) {
      expect((await stats(`${PERIOD}&tz=${tz}`)).statusCode).toBe(200)
    }
  })

  it('accepte un fuseau au décalage de demi-heure', async () => {
    await seedDataset()

    const body = await statsBody(`${PERIOD}&tz=Asia/Kolkata`)

    // Session 3 : 22:30Z + 5 h 30 = lundi 04 h.
    expect(body.busiestSlots).toContainEqual({ weekday: 1, hour: 4, sessions: 1 })
  })
})
