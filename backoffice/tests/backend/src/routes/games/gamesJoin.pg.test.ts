import path from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
 *     tests/backend/src/routes/games/gamesJoin.pg.test.ts
 *
 * Le `mockDb` n'applique ni les index, ni les verrous : la coexistence d'une partie en attente et
 * d'une partie en cours, la course sur un pupitre et les droits réels de la matrice ne se prouvent
 * que sur la vraie base.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `game_registrations`, `game_participants`, `games`, `rooms`, `admins`, `companies` sont vidées
 * avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

const TRUNCATE_TABLES =
  'TRUNCATE game_registrations, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'

type Db = typeof import('@backend/db').default
type Json = Record<string, any>
type Trx = Parameters<Parameters<Db['transaction']>[0]>[0]

const staffUser: TestUser = { ...companyAdminUser, role: 'user', sid: 'sid-staff' }
const roomAccount: TestUser = {
  ...companyAdminUser,
  role: 'room',
  sid: 'sid-room',
}
// Le compte de la salle 1 : c'est lui qui appelle `/room/games/:id/start`.
const roomDesk = { ...roomAccount, room_id: 1 } as TestUser
const otherCompanyAdmin: TestUser = {
  ...companyAdminUser,
  id: 3,
  adminId: 3,
  sub: '3',
  company_id: 2,
  companyId: 2,
}

describe.skipIf(!PG_INTEGRATION_URL)('accueil des joueurs sur PostgreSQL', () => {
  let db: Db
  let app: FastifyInstance
  let roomApp: FastifyInstance

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })

    const gamesRoutes = (await import('@backend/routes/games')).default
    app = await createRouteApp(gamesRoutes)
    roomApp = await createRouteApp((await import('@backend/routes/room')).default)
  }, 120_000)

  // Base partagée avec les autres `*.pg.test.ts` : on ne laisse aucune ligne derrière nous.
  afterAll(async () => {
    await app?.close()
    await roomApp?.close()
    await db?.raw(TRUNCATE_TABLES)
    await db?.destroy()
  })

  beforeEach(async () => {
    await db.raw(TRUNCATE_TABLES)

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
      { id: 1, company_id: 1, name: 'Salle 1', config: JSON.stringify({ desksCount: 3 }) },
      { id: 2, company_id: 1, name: 'Salle 2' },
      { id: 3, company_id: 2, name: 'Salle 3' },
    ])
  })

  function request(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
    user: TestUser = companyAdminUser
  ) {
    return app.inject({ method, url, headers: authHeaders(user), payload })
  }

  const createGame = (extra: Record<string, unknown> = {}, roomId = 1) =>
    request('POST', '/companies/1/games', { roomId, participants: [], openJoin: true, ...extra })

  function insertGame(state: string, extra: Record<string, unknown> = {}) {
    return db('games')
      .insert({ company_id: 1, room_id: 1, admin_id: 2, seed: 1, state, ...extra })
      .returning('id')
      .then(([row]) => Number(row.id))
  }

  async function insertRegistration(
    gameId: number,
    displayName: string,
    extra: Record<string, unknown> = {}
  ) {
    const [row] = await db('game_registrations')
      .insert({
        game_id: gameId,
        display_name: displayName,
        email: `${displayName.toLowerCase()}@exemple.fr`,
        consent_at: db.fn.now(),
        ...extra,
      })
      .returning('id')

    return Number(row.id)
  }

  const accept = (gameId: number, registrationId: number, podium?: number, user?: TestUser) =>
    request(
      'POST',
      `/companies/1/games/${gameId}/registrations/${registrationId}/accept`,
      podium === undefined ? undefined : { podium },
      user
    )

  const startRoom = (gameId: number, podiums?: number[]) =>
    roomApp.inject({
      method: 'POST',
      url: `/room/games/${gameId}/start`,
      headers: authHeaders(roomDesk),
      payload: podiums === undefined ? undefined : { podiums },
    })

  /** Tient le verrou de la partie dans une transaction, comme le ferait une autre requête. */
  async function holdGameLock(gameId: number, whileHeld?: (trx: Trx) => Promise<unknown>) {
    let release!: () => void
    let locked!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const isLocked = new Promise<void>((resolve) => (locked = resolve))
    const done = db.transaction(async (trx) => {
      await trx('games').where('id', gameId).forUpdate().first('id')
      locked()
      await gate
      await whileHeld?.(trx)
    })

    await isLocked

    return { release, done }
  }

  /** Attend que `count` requêtes soient bloquées en base sur un verrou (pas d'attente à l'aveugle). */
  const waitForBlocked = (count: number) =>
    vi.waitFor(async () => {
      const { rows } = await db.raw(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      )

      expect(rows[0].n).toBe(count)
    }, 5000)

  const podiumsOf = async (gameId: number) =>
    (await db('game_participants').where('game_id', gameId).orderBy('podium').select('podium')).map(
      (row) => Number(row.podium)
    )

  describe('lancement par la salle : joueurs chargés', () => {
    it('refuse le lancement avec une liste périmée (joueur ajouté après le relevé), la partie reste en attente', async () => {
      const gameId = await insertGame('pending')
      await db('game_participants').insert([
        { game_id: gameId, podium: 1, display_name: 'Léa' },
        { game_id: gameId, podium: 2, display_name: 'Noé' },
      ])
      const loaded = [1, 2]

      const added = await request('POST', `/companies/1/games/${gameId}/participants`, {
        podium: 3,
        displayName: 'Zoé',
      })
      const stale = await startRoom(gameId, loaded)

      expect(added.statusCode).toBe(201)
      expect(stale.statusCode).toBe(409)
      expect(parseJson(stale)).toEqual({ error: 'game_participants_changed' })
      expect(await db('games').where('id', gameId).first()).toMatchObject({
        state: 'pending',
        started_at: null,
      })

      const fresh = await startRoom(gameId, [3, 1, 2])

      expect(fresh.statusCode).toBe(200)
      expect(parseJson<Json>(fresh).game.state).toBe('running')
      expect(await podiumsOf(gameId)).toEqual([1, 2, 3])
    })

    it('garde l’ancien comportement sans pupitres : la partie démarre', async () => {
      const gameId = await insertGame('pending')
      await db('game_participants').insert({ game_id: gameId, podium: 1, display_name: 'Léa' })

      const response = await startRoom(gameId)

      expect(response.statusCode).toBe(200)
      expect(await db('games').where('id', gameId).first()).toMatchObject({ state: 'running' })
    })

    it('attend le verrou de la partie, puis compare avec la liste validée entre-temps', async () => {
      const gameId = await insertGame('pending')
      await db('game_participants').insert([
        { game_id: gameId, podium: 1, display_name: 'Léa' },
        { game_id: gameId, podium: 2, display_name: 'Noé' },
      ])
      const held = await holdGameLock(gameId, (trx) =>
        trx('game_participants').insert({ game_id: gameId, podium: 3, display_name: 'Zoé' })
      )

      const start = startRoom(gameId, [1, 2])
      await waitForBlocked(1)
      held.release()
      await held.done
      const response = await start

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_participants_changed' })
      expect(await db('games').where('id', gameId).first()).toMatchObject({ state: 'pending' })
      expect(await podiumsOf(gameId)).toEqual([1, 2, 3])
    })

    it('validation d’une demande et lancement en parallèle : jamais une partie lancée avec une liste périmée', async () => {
      const gameId = await insertGame('pending')
      await db('game_participants').insert([
        { game_id: gameId, podium: 1, display_name: 'Léa' },
        { game_id: gameId, podium: 2, display_name: 'Noé' },
      ])
      const registrationId = await insertRegistration(gameId, 'Zoé')
      const held = await holdGameLock(gameId)

      const accepted = accept(gameId, registrationId, 3)
      const started = startRoom(gameId, [1, 2])
      await waitForBlocked(2)
      held.release()
      await held.done
      const [acceptResponse, startResponse] = await Promise.all([accepted, started])
      const game = await db('games').where('id', gameId).first()

      // Soit la validation passe d'abord (le lancement voit 3 joueurs et refuse), soit le
      // lancement passe d'abord (la validation trouve la partie en cours) : jamais les deux.
      if (startResponse.statusCode === 200) {
        expect(acceptResponse.statusCode).toBe(409)
        expect(parseJson(acceptResponse)).toEqual({ error: 'game_not_pending' })
        expect(game.state).toBe('running')
        expect(await podiumsOf(gameId)).toEqual([1, 2])
      } else {
        expect(acceptResponse.statusCode).toBe(201)
        expect(startResponse.statusCode).toBe(409)
        expect(parseJson(startResponse)).toEqual({ error: 'game_participants_changed' })
        expect(game.state).toBe('pending')
        expect(await podiumsOf(gameId)).toEqual([1, 2, 3])
      }
    })
  })

  describe('une partie en attente et une partie en cours dans la même salle', () => {
    it('crée une partie en attente alors qu’une partie tourne, puis refuse une deuxième en attente', async () => {
      await insertGame('running', { started_at: db.fn.now() })

      const pending = await createGame()
      const second = await createGame()

      expect(pending.statusCode).toBe(201)
      expect(parseJson<Json>(pending).game).toMatchObject({ state: 'pending' })
      expect(second.statusCode).toBe(409)
      expect(parseJson(second)).toEqual({ error: 'room_busy' })
      expect(await db('games').orderBy('id').select('state')).toEqual([
        { state: 'running' },
        { state: 'pending' },
      ])
    })

    it('laisse passer une seule de deux créations simultanées en attente', async () => {
      const responses = await Promise.all([createGame(), createGame()])

      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409])
      expect(parseJson(responses.find((response) => response.statusCode === 409)!)).toEqual({
        error: 'room_busy',
      })
      expect(await db('games').count({ count: '*' })).toEqual([{ count: 1 }])
    })

    it('ouvre une session programmée pendant qu’une partie tourne, et refuse si une partie attend', async () => {
      const soon = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + 20 * 60_000)
      const later = new Date(soon.getTime() + 30 * 60_000)
      const schedule = async (startsAt: Date) =>
        parseJson<Json>(
          await createGame({
            participants: [],
            openJoin: false,
            scheduledAt: startsAt.toISOString(),
            durationMinutes: 20,
          })
        ).game.id as number
      const first = await schedule(soon)
      const second = await schedule(later)
      await insertGame('running', { started_at: db.fn.now() })

      const opened = await request('POST', `/companies/1/games/${first}/open`)
      const busy = await request('POST', `/companies/1/games/${second}/open`)

      expect(opened.statusCode).toBe(200)
      expect(parseJson<Json>(opened).game.state).toBe('pending')
      expect(busy.statusCode).toBe(409)
      expect(parseJson(busy)).toEqual({ error: 'room_busy' })
    })

    it('refuse en base une deuxième partie en attente ou en cours dans la salle', async () => {
      await insertGame('pending')
      await insertGame('running')

      await expect(insertGame('pending')).rejects.toMatchObject({
        code: '23505',
        constraint: 'games_room_id_pending_unique',
      })
      await expect(insertGame('running')).rejects.toMatchObject({
        code: '23505',
        constraint: 'games_room_id_running_unique',
      })
      await expect(
        insertGame('pending', { status: 2, deleted_at: db.fn.now() })
      ).resolves.toBeTypeOf('number')
    })
  })

  describe('lien et demandes', () => {
    it('crée la partie avec son lien, le lit, le ferme et le rouvre avec un autre jeton', async () => {
      const created = await createGame()
      const { game } = parseJson<Json>(created)
      const url = `/companies/1/games/${game.id}`

      const read = await request('GET', url)
      const closed = await request('DELETE', `${url}/join`)
      const closedAgain = await request('DELETE', `${url}/join`)
      const afterClose = parseJson<Json>(await request('GET', url)).game
      const reopened = await request('POST', `${url}/join`)

      expect(created.statusCode).toBe(201)
      expect(game.join.url).toMatch(/\/rejoindre\/#[\w-]{43}$/)
      expect(parseJson<Json>(read).game.join).toEqual(game.join)
      expect(closed.statusCode).toBe(204)
      expect(closedAgain.statusCode).toBe(204)
      expect(afterClose.join).toBeNull()
      expect(parseJson<Json>(reopened).join.url).not.toBe(game.join.url)
      expect(await db('games').where('id', game.id).first()).toMatchObject({
        join_token: reopened.json().join.url.split('#')[1],
      })
    })

    it('refuse le lien d’une partie lancée', async () => {
      const gameId = await insertGame('running')

      const response = await request('POST', `/companies/1/games/${gameId}/join`)

      expect(response.statusCode).toBe(409)
      expect(parseJson(response)).toEqual({ error: 'game_not_pending' })
    })

    it('liste les demandes dans l’ordre d’arrivée, e-mails masqués pour le rôle user', async () => {
      const gameId = await insertGame('pending')
      const zoe = await insertRegistration(gameId, 'Zoé', {
        created_at: '2027-03-10T07:58:00.000Z',
      })
      const lea = await insertRegistration(gameId, 'Léa', {
        created_at: '2027-03-10T07:55:00.000Z',
        marketing_consent_at: '2027-03-10T07:55:00.000Z',
      })
      const url = `/companies/1/games/${gameId}/registrations`

      const asAdmin = parseJson<Json>(await request('GET', url)).registrations
      const asStaff = await request('GET', url, undefined, staffUser)

      expect(asAdmin.map((registration: Json) => registration.id)).toEqual([lea, zoe])
      expect(asAdmin[0]).toMatchObject({
        email: 'léa@exemple.fr',
        hasEmail: true,
        marketingConsent: true,
      })
      expect(asStaff.statusCode).toBe(200)
      expect(asStaff.body).not.toContain('@exemple.fr')
      expect(parseJson<Json>(asStaff).registrations[0]).toMatchObject({
        email: null,
        hasEmail: true,
      })
    })

    it('compte les demandes dans la partie, et le rôle user ne reçoit pas l’e-mail à la validation', async () => {
      const gameId = await insertGame('pending')
      const registrationId = await insertRegistration(gameId, 'Léa')

      const counted = parseJson<Json>(await request('GET', `/companies/1/games/${gameId}`)).game
      const accepted = await accept(gameId, registrationId, undefined, staffUser)

      expect(counted.pendingRegistrationsCount).toBe(1)
      expect(accepted.statusCode).toBe(201)
      expect(accepted.body).not.toContain('@exemple.fr')
      expect(parseJson<Json>(accepted).participant).toMatchObject({
        podium: 1,
        email: null,
        hasEmail: true,
      })
      expect(await db('game_participants').where('game_id', gameId).first()).toMatchObject({
        email: 'léa@exemple.fr',
      })
      expect(await db('game_registrations').where('game_id', gameId)).toHaveLength(0)
    })

    it('refuse une demande : elle disparaît de la base', async () => {
      const gameId = await insertGame('pending')
      const registrationId = await insertRegistration(gameId, 'Léa')
      const url = `/companies/1/games/${gameId}/registrations/${registrationId}`

      const refused = await request('DELETE', url)
      const again = await request('DELETE', url)

      expect(refused.statusCode).toBe(204)
      expect(again.statusCode).toBe(404)
      expect(parseJson(again)).toEqual({ error: 'registration_not_found' })
      expect(await db('game_registrations')).toHaveLength(0)
    })
  })

  describe('validation d’une demande : pupitre et concurrence', () => {
    it('prend le plus petit pupitre libre, puis répond room_full quand la salle est pleine', async () => {
      const gameId = await insertGame('pending')
      await db('game_participants').insert({ game_id: gameId, podium: 2, display_name: 'Hugo' })
      const first = await insertRegistration(gameId, 'Léa')
      const second = await insertRegistration(gameId, 'Noé')
      const third = await insertRegistration(gameId, 'Zoé')

      const responses = [
        await accept(gameId, first),
        await accept(gameId, second),
        await accept(gameId, third),
      ]

      expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 409])
      expect(parseJson<Json>(responses[0]!).participant.podium).toBe(1)
      expect(parseJson<Json>(responses[1]!).participant.podium).toBe(3)
      expect(parseJson(responses[2]!)).toEqual({ error: 'room_full' })
      expect(await db('game_registrations').where('game_id', gameId)).toHaveLength(1)
    })

    it('refuse un pupitre pris ou absent de la salle sans perdre la demande', async () => {
      const gameId = await insertGame('pending')
      await db('game_participants').insert({ game_id: gameId, podium: 2, display_name: 'Hugo' })
      const registrationId = await insertRegistration(gameId, 'Léa')

      const taken = await accept(gameId, registrationId, 2)
      const absent = await accept(gameId, registrationId, 4)

      expect(taken.statusCode).toBe(409)
      expect(parseJson(taken)).toEqual({ error: 'podium_taken' })
      expect(absent.statusCode).toBe(400)
      expect(parseJson(absent)).toEqual({ error: 'podium_not_in_room', desksCount: 3 })
      expect(await db('game_registrations').where('game_id', gameId)).toHaveLength(1)
    })

    it('course sur le même pupitre : une validation passe, l’autre répond podium_taken', async () => {
      const gameId = await insertGame('pending')
      const first = await insertRegistration(gameId, 'Léa')
      const second = await insertRegistration(gameId, 'Noé')

      const responses = await Promise.all([accept(gameId, first, 2), accept(gameId, second, 2)])

      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409])
      expect(parseJson(responses.find((response) => response.statusCode === 409)!)).toEqual({
        error: 'podium_taken',
      })
      expect(await db('game_participants').where('game_id', gameId)).toHaveLength(1)
      expect(await db('game_registrations').where('game_id', gameId)).toHaveLength(1)
    })

    it('course sans pupitre choisi : deux validations ne prennent jamais le même pupitre', async () => {
      const gameId = await insertGame('pending')
      const first = await insertRegistration(gameId, 'Léa')
      const second = await insertRegistration(gameId, 'Noé')

      const responses = await Promise.all([accept(gameId, first), accept(gameId, second)])

      expect(responses.map((response) => response.statusCode)).toEqual([201, 201])
      expect(
        responses.map((response) => parseJson<Json>(response).participant.podium).sort()
      ).toEqual([1, 2])
      expect(await db('game_registrations').where('game_id', gameId)).toHaveLength(0)
    })

    it('refuse la validation, l’ajout et le retrait dès que la partie n’est plus en attente', async () => {
      const gameId = await insertGame('running')
      const registrationId = await insertRegistration(gameId, 'Léa')
      const [{ id: participantId }] = await db('game_participants')
        .insert({ game_id: gameId, podium: 1, display_name: 'Hugo' })
        .returning('id')

      const accepted = await accept(gameId, registrationId)
      const added = await request('POST', `/companies/1/games/${gameId}/participants`, {
        podium: 2,
        displayName: 'Ana',
      })
      const removed = await request(
        'DELETE',
        `/companies/1/games/${gameId}/participants/${participantId}`
      )

      for (const response of [accepted, added, removed]) {
        expect(response.statusCode).toBe(409)
        expect(parseJson(response)).toEqual({ error: 'game_not_pending' })
      }
      expect(await db('game_participants').where('game_id', gameId)).toHaveLength(1)
      expect(await db('game_registrations').where('game_id', gameId)).toHaveLength(1)
    })
  })

  describe('participants ajoutés au comptoir', () => {
    it('ajoute puis retire un joueur, deux ajouts simultanés sur un pupitre : un seul passe', async () => {
      const gameId = await insertGame('pending')
      const url = `/companies/1/games/${gameId}/participants`
      const body = (displayName: string) => ({ podium: 1, displayName })

      const responses = await Promise.all([
        request('POST', url, body('Hugo')),
        request('POST', url, body('Ana')),
      ])
      const created = responses.find((response) => response.statusCode === 201)!
      const refused = responses.find((response) => response.statusCode === 409)!
      const participantId = parseJson<Json>(created).participant.id

      const removed = await request('DELETE', `${url}/${participantId}`)
      const again = await request('DELETE', `${url}/${participantId}`)

      expect(created).toBeDefined()
      expect(parseJson(refused)).toEqual({ error: 'podium_taken' })
      expect(removed.statusCode).toBe(204)
      expect(again.statusCode).toBe(404)
      expect(parseJson(again)).toEqual({ error: 'participant_not_found' })
      expect(await db('game_participants').where('game_id', gameId)).toHaveLength(0)
    })

    it('refuse un pupitre absent de la salle', async () => {
      const gameId = await insertGame('pending')

      const response = await request('POST', `/companies/1/games/${gameId}/participants`, {
        podium: 4,
        displayName: 'Hugo',
      })

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'podium_not_in_room', desksCount: 3 })
    })
  })

  describe('droits', () => {
    it('refuse un admin de la compagnie A sur la partie de la compagnie B, sans rien modifier', async () => {
      const gameId = await insertGame('pending', {
        join_token: 'x'.repeat(43),
        join_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      const registrationId = await insertRegistration(gameId, 'Léa')
      const [{ id: participantId }] = await db('game_participants')
        .insert({ game_id: gameId, podium: 1, display_name: 'Hugo' })
        .returning('id')
      const base = `/companies/1/games/${gameId}`
      const calls: Array<['GET' | 'POST' | 'DELETE', string, Record<string, unknown>?]> = [
        ['GET', base],
        ['POST', `${base}/join`],
        ['DELETE', `${base}/join`],
        ['GET', `${base}/registrations`],
        ['POST', `${base}/registrations/${registrationId}/accept`],
        ['DELETE', `${base}/registrations/${registrationId}`],
        ['POST', `${base}/participants`, { podium: 2, displayName: 'Ana' }],
        ['DELETE', `${base}/participants/${participantId}`],
      ]

      for (const [method, url, payload] of calls) {
        const asOtherAdmin = await request(method, url, payload, otherCompanyAdmin)
        const asSuperadminElsewhere = await request(
          method,
          url.replace('/companies/1/', '/companies/2/'),
          payload,
          superadminUser
        )

        expect(asOtherAdmin.statusCode, `${method} ${url}`).toBe(403)
        expect(asSuperadminElsewhere.statusCode, `${method} ${url} (superadmin)`).toBe(404)
      }

      expect(await db('games').where('id', gameId).first()).toMatchObject({
        join_token: 'x'.repeat(43),
      })
      expect(await db('game_registrations')).toHaveLength(1)
      expect(await db('game_participants')).toHaveLength(1)
    })

    it('refuse le compte de salle et l’appel sans connexion sur les nouvelles routes', async () => {
      const gameId = await insertGame('pending')
      const base = `/companies/1/games/${gameId}`

      for (const [method, url] of [
        ['POST', `${base}/join`],
        ['DELETE', `${base}/join`],
        ['GET', `${base}/registrations`],
        ['POST', `${base}/registrations/1/accept`],
        ['DELETE', `${base}/registrations/1`],
        ['POST', `${base}/participants`],
        ['DELETE', `${base}/participants/1`],
      ] as const) {
        const asRoom = await request(method, url, undefined, roomAccount)
        const anonymous = await app.inject({ method, url })

        expect(asRoom.statusCode, `${method} ${url}`).toBe(403)
        expect(anonymous.statusCode, `${method} ${url} (anonyme)`).toBe(401)
      }
    })
  })
})
