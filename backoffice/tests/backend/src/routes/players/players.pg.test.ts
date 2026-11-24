import path from 'node:path'

import type dbModule from '@backend/db'
import { PLAYER_ERASED_NAME } from '@quizzup/shared'
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
import { otherCompanyAdmin, staffUser } from '../_helpers/vouchers'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts --no-file-parallelism \
 *     tests/backend/src/routes/players/players.pg.test.ts
 *
 * Les requêtes d'agrégation et d'effacement de `routes/players` ne se prouvent pas avec le
 * `mockDb`. Les contrôles d'accès sont ceux de l'application (matrice de permissions réelle).
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `companies`, `admins`, `rooms`, `games` (et dépendantes) sont vidées avant chaque test, puis
 * après le dernier.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule
type Row = Record<string, unknown>
type PlayerBody = {
  email: string | null
  displayName: string
  sessions: number
  lastPlayedAt: string | null
  bestScore: number | null
  marketingConsent: boolean
}
type ListBody = { players: PlayerBody[]; total: number; anonymousPlayers: number }

const OCT = '2026-10-01T18:00:00.000Z'
const NOV = '2026-11-01T18:00:00.000Z'

describe.skipIf(!PG_INTEGRATION_URL)('routes des joueurs sur PostgreSQL', () => {
  let db: Db
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })

    const playersRoutes = (await import('@backend/routes/players')).default
    app = await createRouteApp(playersRoutes)
  }, 120_000)

  afterAll(async () => {
    await app?.close()

    // Laisse la base vide : le fichier suivant prépare ses propres données.
    await db?.raw(
      'TRUNCATE game_registrations, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
    )
    await db?.destroy()
  })

  const now = () => new Date()

  async function addGame(id: number, company: number, room: number, state: string, at: string) {
    await db('games').insert({
      id,
      company_id: company,
      room_id: room,
      admin_id: company,
      seed: 1,
      state,
      started_at: state === 'pending' ? null : new Date(at),
      finished_at: state === 'finished' ? new Date(at) : null,
      created_at: new Date(at),
    })
  }

  async function addParticipant(row: {
    game: number
    podium: number
    name: string
    email?: string
    marketing?: boolean
    second?: { name: string; email?: string; marketing?: boolean }
    score?: number
  }) {
    await db('game_participants').insert({
      game_id: row.game,
      podium: row.podium,
      display_name: row.name,
      email: row.email ?? null,
      consent_at: row.email ? now() : null,
      marketing_consent_at: row.email && row.marketing ? now() : null,
      second_display_name: row.second?.name ?? null,
      second_email: row.second?.email ?? null,
      second_consent_at: row.second?.email ? now() : null,
      second_marketing_consent_at: row.second?.email && row.second.marketing ? now() : null,
      score: row.score ?? 0,
    })
  }

  async function addRegistration(row: {
    game: number
    name: string
    email: string
    marketing?: boolean
    second?: { name: string; email: string }
  }) {
    await db('game_registrations').insert({
      game_id: row.game,
      display_name: row.name,
      email: row.email,
      consent_at: now(),
      marketing_consent_at: row.marketing ? now() : null,
      second_display_name: row.second?.name ?? null,
      second_email: row.second?.email ?? null,
      second_consent_at: row.second ? now() : null,
    })
  }

  /**
   * Compagnie 1 :
   *  - partie 1 (octobre) : pupitre 1 Alice a@ (offres) avec Bob b@ (sans offres), 30 points ;
   *    pupitre 2 sans e-mail ; pupitre 3 sans e-mail avec un 2e joueur sans e-mail.
   *  - partie 2 (novembre) : pupitre 1 « Alice N » A@ en majuscules (offres), 50 points, avec
   *    Carl c@ (offres) nommé `=1+1` ;
   *  - partie 3 (en attente) : une demande d'inscription de a@ (offres) avec Dan d@ en 2e joueur.
   * Compagnie 2 : partie 4 où a@ (offres) a 99 points, et une demande de a@.
   */
  beforeEach(async () => {
    await db.raw(
      'TRUNCATE game_registrations, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
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

    await addGame(1, 1, 1, 'finished', OCT)
    await addGame(2, 1, 1, 'finished', NOV)
    await addGame(3, 1, 2, 'pending', NOV)
    await addGame(4, 2, 3, 'finished', NOV)

    await addParticipant({
      game: 1,
      podium: 1,
      name: 'Alice',
      email: 'a@x.test',
      marketing: true,
      second: { name: 'Bob', email: 'b@x.test' },
      score: 30,
    })
    await addParticipant({ game: 1, podium: 2, name: 'Sans mail', score: 10 })
    await addParticipant({
      game: 1,
      podium: 3,
      name: 'Anonyme',
      second: { name: 'Anonyme 2' },
      score: 5,
    })
    await addParticipant({
      game: 2,
      podium: 1,
      name: 'Alice N',
      email: 'A@X.TEST',
      marketing: true,
      second: { name: '=1+1', email: 'c@x.test', marketing: true },
      score: 50,
    })
    await addRegistration({
      game: 3,
      name: 'Alice',
      email: 'a@x.test',
      marketing: true,
      second: { name: 'Dan', email: 'd@x.test' },
    })
    await addParticipant({
      game: 4,
      podium: 1,
      name: 'Alice',
      email: 'a@x.test',
      marketing: true,
      score: 99,
    })
    await addRegistration({ game: 4, name: 'Alice', email: 'a@x.test', marketing: true })
  })

  function get(url: string, user: TestUser = companyAdminUser) {
    return app.inject({ method: 'GET', url, headers: authHeaders(user) })
  }

  function post(url: string, email: string, user: TestUser = companyAdminUser) {
    return app.inject({ method: 'POST', url, headers: authHeaders(user), payload: { email } })
  }

  const participants = (game: number) =>
    db('game_participants').where('game_id', game).orderBy('podium') as Promise<Row[]>

  const registrations = (game: number) => db('game_registrations').where('game_id', game)

  describe('GET /companies/:companyId/players', () => {
    it('groups the players by normalized e-mail, newest first, from both players of a desk', async () => {
      const response = await get('/companies/1/players')
      const body = parseJson<ListBody>(response)

      expect(response.statusCode).toBe(200)
      expect(body.total).toBe(3)
      // Même date pour a@ et c@ (même pupitre) : le plus récent des deux sur ce pupitre d'abord.
      expect(body.players.map((player) => player.email)).toEqual([
        'c@x.test',
        'a@x.test',
        'b@x.test',
      ])
      expect(body.players[1]).toEqual({
        email: 'a@x.test',
        // Nom de la dernière partie, meilleur score des deux, deux parties jouées.
        displayName: 'Alice N',
        sessions: 2,
        lastPlayedAt: NOV,
        bestScore: 50,
        marketingConsent: true,
      })
      expect(body.players[0]).toMatchObject({ displayName: '=1+1', sessions: 1, bestScore: 50 })
      expect(body.players[2]).toMatchObject({
        displayName: 'Bob',
        sessions: 1,
        bestScore: 30,
        marketingConsent: false,
      })
    })

    it('counts the players without an e-mail of finished games, and nobody from another company', async () => {
      const body = parseJson<ListBody>(await get('/companies/1/players'))

      // Pupitre 2, pupitre 3 et son 2e joueur ; la demande en attente et la compagnie 2 ne comptent pas.
      expect(body.anonymousPlayers).toBe(3)
    })

    it('hides the e-mails from the user role but keeps the rest', async () => {
      const body = parseJson<ListBody>(await get('/companies/1/players', staffUser))

      expect(body.total).toBe(3)
      expect(body.players.map((player) => player.email)).toEqual([null, null, null])
      expect(body.players[1]!.displayName).toBe('Alice N')
      expect(JSON.stringify(body)).not.toContain('@x.test')
    })

    it('searches the name only, and takes % and _ for plain characters', async () => {
      const byName = parseJson<ListBody>(await get('/companies/1/players?search=ALICE'))
      const byEmail = parseJson<ListBody>(await get('/companies/1/players?search=a@x'))
      const wildcard = parseJson<ListBody>(await get('/companies/1/players?search=%25'))
      const underscore = parseJson<ListBody>(await get('/companies/1/players?search=_'))

      expect(byName.players.map((player) => player.email)).toEqual(['a@x.test'])
      expect(byName.total).toBe(1)
      expect(byEmail.total).toBe(0)
      expect(wildcard.total).toBe(0)
      expect(underscore.total).toBe(0)
    })

    it('pages the list and still reports the whole total', async () => {
      const body = parseJson<ListBody>(await get('/companies/1/players?limit=1&offset=1'))

      expect(body.players.map((player) => player.email)).toEqual(['a@x.test'])
      expect(body.total).toBe(3)
    })

    it('lists only the players of the company asked for, and refuses the other companies', async () => {
      const own = parseJson<ListBody>(await get('/companies/2/players', otherCompanyAdmin))

      expect(own.players).toEqual([
        {
          email: 'a@x.test',
          displayName: 'Alice',
          sessions: 1,
          lastPlayedAt: NOV,
          bestScore: 99,
          marketingConsent: true,
        },
      ])
      expect((await get('/companies/1/players', otherCompanyAdmin)).statusCode).toBe(403)
      expect((await get('/companies/2/players', companyAdminUser)).statusCode).toBe(403)
      expect((await get('/companies/2/players', superadminUser)).statusCode).toBe(200)
    })

    it('counts only finished, non-deleted games in the stats, and still lists the others', async () => {
      await addGame(5, 1, 1, 'running', '2026-11-15T18:00:00.000Z')
      await addParticipant({
        game: 5,
        podium: 1,
        name: 'Carl',
        email: 'c@x.test',
        marketing: true,
        second: { name: 'Eve', email: 'e@x.test', marketing: true },
        score: 90,
      })
      await addGame(6, 1, 1, 'finished', '2026-11-20T18:00:00.000Z')
      await db('games').where('id', 6).update({ status: 2, deleted_at: now() })
      await addParticipant({ game: 6, podium: 1, name: 'Fay', email: 'f@x.test', score: 80 })

      const body = parseJson<ListBody>(await get('/companies/1/players'))
      const byEmail = (email: string) => body.players.find((player) => player.email === email)

      // Carl joue en cours de partie (90 points) : ni sa date ni son score ne comptent.
      expect(byEmail('c@x.test')).toMatchObject({
        displayName: 'Carl',
        sessions: 1,
        lastPlayedAt: NOV,
        bestScore: 50,
      })
      // Joueurs sans partie jouée : listés, à zéro, sans date ni score.
      expect(byEmail('e@x.test')).toMatchObject({
        sessions: 0,
        lastPlayedAt: null,
        bestScore: null,
      })
      expect(byEmail('f@x.test')).toMatchObject({
        sessions: 0,
        lastPlayedAt: null,
        bestScore: null,
      })
      expect(body.total).toBe(5)
      // Les joueurs sans partie jouée passent après les autres.
      expect(body.players.slice(-2).map((player) => player.email)).toEqual(
        expect.arrayContaining(['e@x.test', 'f@x.test'])
      )
    })

    it('follows the last game for the consent: an address that stopped accepting is not an offer contact', async () => {
      await addGame(5, 1, 1, 'finished', '2026-11-10T18:00:00.000Z')
      await addParticipant({ game: 5, podium: 1, name: 'Carl', email: 'c@x.test' })

      const body = parseJson<ListBody>(await get('/companies/1/players'))

      expect(body.players.find((player) => player.email === 'c@x.test')).toMatchObject({
        marketingConsent: false,
        sessions: 2,
      })
    })
  })

  describe('GET /companies/:companyId/players/export.csv', () => {
    it('exports only the players who accept the offers, a formula neutralized', async () => {
      const response = await get('/companies/1/players/export.csv')
      const lines = response.body.split('\r\n')

      expect(response.statusCode).toBe(200)
      expect(response.body.startsWith('\uFEFFemail;prenom;derniere_partie;parties;')).toBe(true)
      expect(lines).toHaveLength(4)
      expect(lines[1]!.startsWith(`a@x.test;Alice N;${NOV};2;`)).toBe(true)
      expect(lines[2]!.startsWith(`c@x.test;'=1+1;${NOV};1;`)).toBe(true)
      expect(response.body).not.toContain('b@x.test')
      expect(response.body).not.toContain('d@x.test')
      expect(lines[3]).toBe('')
    })

    it('keeps every game in the export, played or not', async () => {
      await addGame(5, 1, 1, 'running', '2026-11-15T18:00:00.000Z')
      await addParticipant({
        game: 5,
        podium: 1,
        name: 'Carl',
        email: 'c@x.test',
        marketing: true,
        second: { name: 'Eve', email: 'e@x.test', marketing: true },
      })

      const lines = (await get('/companies/1/players/export.csv')).body.split('\r\n')

      expect(
        lines.some((line) => line.startsWith('c@x.test;Carl;2026-11-15T18:00:00.000Z;2;'))
      ).toBe(true)
      expect(
        lines.some((line) => line.startsWith('e@x.test;Eve;2026-11-15T18:00:00.000Z;1;'))
      ).toBe(true)
    })

    it('refuses the user role, even in his own company, and another company', async () => {
      expect((await get('/companies/1/players/export.csv', staffUser)).statusCode).toBe(403)
      expect((await get('/companies/1/players/export.csv', otherCompanyAdmin)).statusCode).toBe(403)
    })

    it('exports the players of the company in the URL only', async () => {
      const response = await get('/companies/2/players/export.csv', otherCompanyAdmin)

      expect(response.body.split('\r\n')).toHaveLength(3)
      expect(response.body).toContain('a@x.test;Alice;')
      expect(response.body).not.toContain('c@x.test')
    })
  })

  describe('POST /companies/:companyId/players/unsubscribe', () => {
    it('withdraws the consent in every game and pending request of the company, and nowhere else', async () => {
      const response = await post('/companies/1/players/unsubscribe', ' A@X.test ')

      expect(response.statusCode).toBe(200)
      expect((await participants(1))[0]).toMatchObject({
        email: 'a@x.test',
        marketing_consent_at: null,
      })
      expect((await participants(2))[0]).toMatchObject({ marketing_consent_at: null })
      expect((await registrations(3))[0]).toMatchObject({ marketing_consent_at: null })

      // L'adresse reste stockée, avec son consentement à la conservation.
      expect((await participants(2))[0]!.consent_at).not.toBeNull()
      // Le 2e joueur du pupitre garde ses réglages ; la compagnie 2 n'est pas touchée.
      expect((await participants(2))[0]!.second_marketing_consent_at).not.toBeNull()
      expect((await participants(4))[0]!.marketing_consent_at).not.toBeNull()
      expect((await registrations(4))[0]!.marketing_consent_at).not.toBeNull()

      const players = parseJson<ListBody>(await get('/companies/1/players')).players
      expect(players.find((player) => player.email === 'a@x.test')?.marketingConsent).toBe(false)
    })

    it('withdraws the consent of a second player', async () => {
      await post('/companies/1/players/unsubscribe', 'c@x.test')

      expect((await participants(2))[0]).toMatchObject({
        second_email: 'c@x.test',
        second_marketing_consent_at: null,
      })
    })

    it('answers the same for a known and an unknown address', async () => {
      const known = await post('/companies/1/players/unsubscribe', 'a@x.test')
      const unknown = await post('/companies/1/players/unsubscribe', 'personne@x.test')
      const other = await post('/companies/1/players/unsubscribe', 'a@x.test')

      expect(unknown.statusCode).toBe(known.statusCode)
      expect(unknown.body).toBe(known.body)
      expect(other.body).toBe(known.body)
    })

    it('refuses the user role and another company, and leaves the data alone', async () => {
      expect(
        (await post('/companies/1/players/unsubscribe', 'a@x.test', staffUser)).statusCode
      ).toBe(403)
      expect(
        (await post('/companies/1/players/unsubscribe', 'a@x.test', otherCompanyAdmin)).statusCode
      ).toBe(403)

      expect((await participants(1))[0]!.marketing_consent_at).not.toBeNull()
      expect((await participants(2))[0]!.marketing_consent_at).not.toBeNull()
    })
  })

  describe('POST /companies/:companyId/players/erase', () => {
    it('erases the address, the consents and the name everywhere in the company, scores kept', async () => {
      const response = await post('/companies/1/players/erase', ' A@x.TEST ')

      expect(response.statusCode).toBe(200)
      // Deux pupitres et une demande en attente.
      expect(parseJson(response)).toEqual({ erased: 3 })

      const [first] = await participants(1)
      const [second] = await participants(2)

      expect(first).toMatchObject({
        display_name: PLAYER_ERASED_NAME,
        email: null,
        consent_at: null,
        marketing_consent_at: null,
        score: 30,
        // Le 2e joueur du pupitre est un autre joueur : il reste.
        second_display_name: 'Bob',
        second_email: 'b@x.test',
      })
      expect(second).toMatchObject({
        display_name: PLAYER_ERASED_NAME,
        email: null,
        consent_at: null,
        marketing_consent_at: null,
        score: 50,
        second_email: 'c@x.test',
      })
      expect(await registrations(3)).toEqual([])
    })

    it('erases a second player and keeps the first one and the score of the desk', async () => {
      const response = await post('/companies/1/players/erase', 'c@x.test')

      expect(response.statusCode).toBe(200)
      expect((await participants(2))[0]).toMatchObject({
        display_name: 'Alice N',
        email: 'A@X.TEST',
        second_display_name: PLAYER_ERASED_NAME,
        second_email: null,
        second_consent_at: null,
        second_marketing_consent_at: null,
        score: 50,
      })
    })

    it('keeps the pending request of a third party and clears only its 2nd player', async () => {
      const response = await post('/companies/1/players/erase', 'd@x.test')

      expect(parseJson(response)).toEqual({ erased: 1 })
      expect(await registrations(3)).toEqual([
        expect.objectContaining({
          display_name: 'Alice',
          email: 'a@x.test',
          marketing_consent_at: expect.any(Date),
          second_display_name: null,
          second_email: null,
          second_consent_at: null,
          second_marketing_consent_at: null,
        }),
      ])
      expect((await participants(1))[0]!.email).toBe('a@x.test')
    })

    it('rolls everything back when a write fails: requests, desks, nothing half erased', async () => {
      await db.raw(
        `CREATE FUNCTION players_test_fail() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'echec simule'; END $$ LANGUAGE plpgsql`
      )
      await db.raw(
        `CREATE TRIGGER players_test_fail BEFORE UPDATE ON game_participants
         FOR EACH ROW EXECUTE FUNCTION players_test_fail()`
      )

      try {
        const response = await post('/companies/1/players/erase', 'a@x.test')

        expect(response.statusCode).toBe(500)
      } finally {
        await db.raw('DROP TRIGGER IF EXISTS players_test_fail ON game_participants')
        await db.raw('DROP FUNCTION IF EXISTS players_test_fail()')
      }

      // La suppression de la demande, faite avant l'écriture qui échoue, est annulée.
      expect(await registrations(3)).toHaveLength(1)
      expect((await participants(1))[0]).toMatchObject({ email: 'a@x.test', display_name: 'Alice' })
      expect((await participants(2))[0]).toMatchObject({ email: 'A@X.TEST' })
    })

    it('leaves nothing of the address in the company: no row, not in the list, not in the export', async () => {
      await post('/companies/1/players/erase', 'a@x.test')

      const stored = await db.raw(
        `SELECT
           (SELECT count(*) FROM game_participants gp JOIN games g ON g.id = gp.game_id
             WHERE g.company_id = 1 AND (lower(gp.email) = 'a@x.test' OR lower(gp.second_email) = 'a@x.test')) AS participants,
           (SELECT count(*) FROM game_registrations gr JOIN games g ON g.id = gr.game_id
             WHERE g.company_id = 1 AND (lower(gr.email) = 'a@x.test' OR lower(gr.second_email) = 'a@x.test')) AS registrations`
      )
      const list = parseJson<ListBody>(await get('/companies/1/players'))
      const csv = (await get('/companies/1/players/export.csv')).body

      expect(Number(stored.rows[0].participants)).toBe(0)
      expect(Number(stored.rows[0].registrations)).toBe(0)
      expect(list.players.map((player) => player.email)).toEqual(['c@x.test', 'b@x.test'])
      // Les pupitres effacés comptent désormais parmi les joueurs sans e-mail.
      expect(list.anonymousPlayers).toBe(5)
      expect(csv).not.toContain('a@x.test')
    })

    it('leaves the other company alone', async () => {
      await post('/companies/1/players/erase', 'a@x.test')

      expect((await participants(4))[0]).toMatchObject({
        display_name: 'Alice',
        email: 'a@x.test',
        score: 99,
      })
      expect(await registrations(4)).toHaveLength(1)
    })

    it('answers 404 player_not_found for an unknown address and writes nothing', async () => {
      const before = await participants(1)
      const response = await post('/companies/1/players/erase', 'personne@x.test')

      expect(response.statusCode).toBe(404)
      expect(parseJson(response)).toEqual({ error: 'player_not_found' })
      expect(await participants(1)).toEqual(before)
    })

    it('answers 404 when the address only exists in another company', async () => {
      await db('game_participants').where('game_id', 4).update({ email: 'seule@x.test' })

      expect((await post('/companies/1/players/erase', 'seule@x.test')).statusCode).toBe(404)
      expect((await participants(4))[0]!.email).toBe('seule@x.test')
    })

    it('refuses the user role and another company, and erases nothing', async () => {
      expect((await post('/companies/1/players/erase', 'a@x.test', staffUser)).statusCode).toBe(403)
      expect(
        (await post('/companies/1/players/erase', 'a@x.test', otherCompanyAdmin)).statusCode
      ).toBe(403)

      expect((await participants(1))[0]!.email).toBe('a@x.test')
      expect(await registrations(3)).toHaveLength(1)
    })

    it('lets a superadmin erase in the company of the URL', async () => {
      const response = await post('/companies/2/players/erase', 'a@x.test', superadminUser)

      expect(response.statusCode).toBe(200)
      expect((await participants(4))[0]!.email).toBeNull()
      expect((await participants(1))[0]!.email).toBe('a@x.test')
    })
  })
})
