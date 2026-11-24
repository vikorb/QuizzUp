import path from 'node:path'

import type { FastifyInstance } from 'fastify'
import fastify from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { VOUCHER_CODE_PATTERN } from '@quizzup/shared'
import { assertTestDatabase } from '../../../setup/assertTestDatabase'
import { authHeaders, companyAdminUser, createRouteApp, type TestUser } from '../_helpers/testApp'
import { otherCompanyAdmin, staffUser } from '../_helpers/vouchers'

/**
 * Bons de fidélisation sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts tests/backend/src/routes/vouchers/vouchers.pg.test.ts
 *
 * Base DÉDIÉE (le nom doit finir par `_test`) : les migrations y sont appliquées et les tables des
 * bons, des parties, des salles, des comptes et des compagnies sont vidées avant chaque test. Ce
 * fichier vérifie ce qu'un faux de base ne sait pas montrer : les utilisations simultanées d'un même
 * bon, les index uniques, les filtres d'état en SQL et la pagination.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL
if (PG_INTEGRATION_URL) process.env.DATABASE_URL = PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default

const DAY_MS = 86_400_000
const CODE = '7K2M-9QXD'

describe.skipIf(!PG_INTEGRATION_URL)('bons de fidélisation sur PostgreSQL', () => {
  let db: Db
  let app: FastifyInstance
  let publicApp: FastifyInstance

  beforeAll(async () => {
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })

    const vouchersRoutes = (await import('@backend/routes/vouchers')).default
    const publicRoutes = (await import('@backend/routes/public')).default
    const { PUBLIC_API_PREFIX } = await import('@backend/routes/public/_shared')

    app = await createRouteApp(vouchersRoutes)
    publicApp = fastify({ logger: false })
    await publicApp.register(publicRoutes as never, { prefix: PUBLIC_API_PREFIX })
    await publicApp.ready()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await publicApp?.close()
    await db?.destroy()
  })

  beforeEach(async () => {
    await db.raw(
      'TRUNCATE vouchers, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
    )
    await db('companies').insert([
      {
        id: 1,
        name: 'Centre 1',
        email: 'c1@x.test',
        voucher_label: 'Une partie offerte',
        voucher_validity_days: 30,
      },
      { id: 2, name: 'Centre 2', email: 'c2@x.test', voucher_label: 'Un cocktail offert' },
    ])
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
      { id: 3, company_id: 1, role: 'user', username: 'staff3', email: 'a3@x.test', mdp_hash: 'x' },
      {
        id: 9,
        company_id: 2,
        role: 'admin',
        username: 'admin2',
        email: 'a2@x.test',
        mdp_hash: 'x',
      },
    ])
    await db('rooms').insert([
      { id: 1, company_id: 1, name: 'Salle 1' },
      { id: 2, company_id: 2, name: 'Salle 2' },
    ])
    await db('games').insert([
      { id: 1, company_id: 1, room_id: 1, admin_id: 2, seed: 1, state: 'finished' },
      { id: 2, company_id: 1, room_id: 1, admin_id: 2, seed: 2, state: 'running' },
      { id: 3, company_id: 2, room_id: 2, admin_id: 9, seed: 3, state: 'finished' },
    ])
    await db('game_participants').insert([
      { id: 1, game_id: 1, podium: 1, display_name: 'Léa', second_display_name: 'Noé' },
      { id: 2, game_id: 1, podium: 2, display_name: 'Sam' },
      { id: 3, game_id: 1, podium: 3, display_name: 'Eva' },
      { id: 4, game_id: 2, podium: 1, display_name: 'Max' },
      { id: 5, game_id: 3, podium: 1, display_name: 'Zoé' },
    ])
  })

  const call = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    user: TestUser | null,
    payload?: unknown
  ) =>
    app.inject({
      method,
      url,
      headers: user ? authHeaders(user) : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    })

  const issue = (participantId: number, user = companyAdminUser, gameId = 1, companyId = 1) =>
    call('POST', `/companies/${companyId}/games/${gameId}/vouchers`, user, { participantId })
  const redeem = (code: string, user: TestUser = staffUser) =>
    call('POST', '/companies/1/vouchers/redeem', user, { code })
  const cancel = (id: number, user = companyAdminUser) =>
    call('PATCH', `/companies/1/vouchers/${id}/status`, user, { status: 0 })

  const insertVoucher = async (overrides: Record<string, unknown> = {}) => {
    const [row] = await db('vouchers')
      .insert({
        company_id: 1,
        game_id: 1,
        participant_id: 1,
        code: CODE,
        label: 'Une partie offerte',
        expires_at: new Date(Date.now() + 30 * DAY_MS),
        created_by: 2,
        ...overrides,
      })
      .returning('*')

    return row as Record<string, unknown> & { id: number }
  }

  const statuses = (responses: Array<{ statusCode: number }>) =>
    responses.map((response) => response.statusCode).sort((a, b) => a - b)

  describe('émission', () => {
    it('enregistre un bon avec ses valeurs par défaut et un code du bon format', async () => {
      const response = await issue(1)
      const { voucher } = response.json()

      expect(response.statusCode).toBe(201)
      expect(voucher.code).toMatch(VOUCHER_CODE_PATTERN)
      expect(voucher).toMatchObject({
        state: 'valid',
        label: 'Une partie offerte',
        redeemedAt: null,
        redeemedBy: null,
        displayName: 'Léa',
        secondDisplayName: 'Noé',
      })

      const stored = await db('vouchers').first()

      expect(stored).toMatchObject({
        company_id: 1,
        game_id: 1,
        participant_id: 1,
        created_by: 2,
        status: 1,
        redeemed_at: null,
      })
      expect(new Date(stored.expires_at).getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS)
      expect(new Date(stored.expires_at).getTime() - Date.now()).toBeLessThan(31 * DAY_MS)
    })

    it('n’émet qu’un bon quand deux requêtes visent le même pupitre en même temps', async () => {
      const responses = await Promise.all([issue(1), issue(1), issue(1), issue(1)])

      expect(statuses(responses)).toEqual([201, 409, 409, 409])
      expect(
        responses.filter((response) => response.statusCode === 409).map((r) => r.json())
      ).toEqual(Array(3).fill({ error: 'voucher_already_issued' }))
      expect(await db('vouchers').count('* as n')).toEqual([{ n: 1 }])
    })

    it('donne des codes différents à des pupitres émis en même temps', async () => {
      const responses = await Promise.all([issue(1), issue(2), issue(3)])

      expect(statuses(responses)).toEqual([201, 201, 201])
      expect(new Set((await db('vouchers').select('code')).map((row) => row.code)).size).toBe(3)
    })

    it('refuse un second bon pour un pupitre dont le bon est annulé', async () => {
      const { id } = await insertVoucher({ status: 0 })

      const response = await issue(1)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({ error: 'voucher_already_issued' })
      expect(id).toBeGreaterThan(0)
    })

    it('émet de nouveau pour un pupitre dont le bon a été supprimé', async () => {
      await insertVoucher({ status: 2, deleted_at: new Date() })

      expect((await issue(1)).statusCode).toBe(201)
    })

    it('refuse une partie qui n’est pas terminée et un pupitre d’une autre partie', async () => {
      expect((await issue(4, companyAdminUser, 2)).json()).toEqual({ error: 'game_not_finished' })
      expect((await issue(4, companyAdminUser, 1)).json()).toEqual({
        error: 'participant_not_found',
      })
      expect(await db('vouchers').count('* as n')).toEqual([{ n: 0 }])
    })

    it('refuse l’émission quand le centre n’a pas réglé de libellé', async () => {
      await db('companies').where('id', 1).update({ voucher_label: null })

      expect((await issue(1)).json()).toEqual({ error: 'vouchers_disabled' })
    })
  })

  describe('utilisation simultanée', () => {
    it('ne valide qu’une fois un bon présenté dix fois en même temps', async () => {
      await insertVoucher()

      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          redeem(CODE, index % 2 ? staffUser : companyAdminUser)
        )
      )

      expect(statuses(responses)).toEqual([200, ...Array(9).fill(409)])

      for (const response of responses.filter((r) => r.statusCode === 409)) {
        expect(response.json()).toEqual({ error: 'voucher_already_redeemed' })
      }

      const winner = responses.find((response) => response.statusCode === 200)!.json().voucher
      const stored = await db('vouchers').first('redeemed_at', 'redeemed_by')

      expect(winner.state).toBe('redeemed')
      expect(stored.redeemed_by).toBe(winner.redeemedBy)
      expect(new Date(stored.redeemed_at).toISOString()).toBe(winner.redeemedAt)
    })

    it('ne laisse jamais un bon à la fois annulé et utilisé quand l’annulation et l’utilisation se croisent', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await db('vouchers').delete()
        const code = `AAAA-000${attempt}`
        const { id } = await insertVoucher({ code })

        const [redeemed, cancelled] = await Promise.all([redeem(code), cancel(id)])

        const stored = await db('vouchers').where('id', id).first('status', 'redeemed_at')
        const outcome = [redeemed.statusCode, cancelled.statusCode]

        // Soit l'utilisation passe avant (l'annulation est refusée), soit l'inverse.
        expect(outcome.join(), `tentative ${attempt} : ${JSON.stringify(stored)}`).toMatch(
          /^(200,409|409,200)$/
        )

        if (redeemed.statusCode === 200) {
          expect(stored.redeemed_at).not.toBeNull()
          expect(stored.status).toBe(1)
          expect(cancelled.json()).toEqual({ error: 'voucher_already_redeemed' })
        } else {
          expect(stored.redeemed_at).toBeNull()
          expect(stored.status).toBe(0)
          expect(redeemed.json()).toEqual({ error: 'voucher_cancelled' })
        }
      }
    })

    it('refuse un bon périmé sans le modifier', async () => {
      await insertVoucher({ expires_at: new Date(Date.now() - 1000) })

      const response = await redeem(CODE)

      expect(response.statusCode).toBe(410)
      expect(response.json()).toEqual({ error: 'voucher_expired' })
      expect(await db('vouchers').first('redeemed_at', 'redeemed_by')).toEqual({
        redeemed_at: null,
        redeemed_by: null,
      })
    })

    it('accepte le code tel que le saisit un joueur', async () => {
      await insertVoucher()

      expect((await redeem(' 7k2m 9qxd ')).statusCode).toBe(200)
    })

    it('répond 404 pour le code d’une autre compagnie et ne touche pas à son bon', async () => {
      await insertVoucher({ company_id: 2, game_id: 3, participant_id: 5, created_by: 9 })

      const response = await redeem(CODE)

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'voucher_not_found' })
      expect((await db('vouchers').first('redeemed_at')).redeemed_at).toBeNull()

      // Même refus pour l'admin de l'autre compagnie sur la compagnie 1 : 403, pas de fuite.
      const intoOther = await call('POST', '/companies/1/vouchers/redeem', otherCompanyAdmin, {
        code: CODE,
      })

      expect(intoOther.statusCode).toBe(403)
    })
  })

  describe('liste', () => {
    async function seedOneOfEach() {
      const past = new Date(Date.now() - DAY_MS)

      await insertVoucher({ code: 'AAAA-0001', participant_id: 1 })
      await insertVoucher({ code: 'AAAA-0002', participant_id: 2, expires_at: past })
      await insertVoucher({
        code: 'AAAA-0003',
        participant_id: 3,
        redeemed_at: past,
        redeemed_by: 3,
        expires_at: past,
      })
      await insertVoucher({ code: 'AAAA-0004', game_id: 2, participant_id: 4, status: 0 })
      await insertVoucher({
        code: 'AAAA-0005',
        game_id: 2,
        participant_id: 4,
        status: 2,
        deleted_at: past,
      })
      await insertVoucher({
        code: 'AAAA-0006',
        company_id: 2,
        game_id: 3,
        participant_id: 5,
        created_by: 9,
      })
    }

    const codesOf = (response: { json: () => { vouchers: Array<{ code: string }> } }) =>
      response.json().vouchers.map((voucher) => voucher.code)

    it('filtre par état en SQL, sans compter les bons supprimés ni ceux d’une autre compagnie', async () => {
      await seedOneOfEach()

      const all = await call('GET', '/companies/1/vouchers', companyAdminUser)

      expect(all.json().total).toBe(4)
      expect(codesOf(all).sort()).toEqual(['AAAA-0001', 'AAAA-0002', 'AAAA-0003', 'AAAA-0004'])

      const expected = {
        valid: ['AAAA-0001'],
        expired: ['AAAA-0002'],
        redeemed: ['AAAA-0003'],
        cancelled: ['AAAA-0004'],
      }

      for (const [state, codes] of Object.entries(expected)) {
        const response = await call('GET', `/companies/1/vouchers?state=${state}`, companyAdminUser)

        expect(codesOf(response), state).toEqual(codes)
        expect(response.json().total, state).toBe(codes.length)
      }
    })

    it('filtre par partie', async () => {
      await seedOneOfEach()

      const response = await call('GET', '/companies/1/vouchers?gameId=2', companyAdminUser)

      expect(codesOf(response)).toEqual(['AAAA-0004'])
    })

    it('pagine du plus récent au plus ancien, avec un total qui ignore la page', async () => {
      const sameSecond = new Date('2027-03-01T10:00:00.000Z')

      // Même date de création : l'identifiant départage, donc deux pages ne se chevauchent jamais.
      await insertVoucher({ code: 'BBBB-0001', participant_id: 1, created_at: sameSecond })
      await insertVoucher({ code: 'BBBB-0002', participant_id: 2, created_at: sameSecond })
      await insertVoucher({ code: 'BBBB-0003', participant_id: 3, created_at: sameSecond })
      await insertVoucher({
        code: 'BBBB-0004',
        game_id: 2,
        participant_id: 4,
        created_at: sameSecond,
      })

      const first = await call('GET', '/companies/1/vouchers?limit=2', companyAdminUser)
      const second = await call('GET', '/companies/1/vouchers?limit=2&offset=2', companyAdminUser)

      expect(codesOf(first)).toEqual(['BBBB-0004', 'BBBB-0003'])
      expect(codesOf(second)).toEqual(['BBBB-0002', 'BBBB-0001'])
      expect(first.json().total).toBe(4)
      expect(second.json().total).toBe(4)
    })

    it('ne montre à l’admin de la compagnie B que ses propres bons', async () => {
      await seedOneOfEach()

      const own = await call('GET', '/companies/2/vouchers', otherCompanyAdmin)
      const other = await call('GET', '/companies/1/vouchers', otherCompanyAdmin)

      expect(codesOf(own)).toEqual(['AAAA-0006'])
      expect(other.statusCode).toBe(403)
    })
  })

  describe('annulation', () => {
    it('annule un bon puis répond 200 de nouveau, sans le rendre utilisable', async () => {
      const { id } = await insertVoucher()

      expect((await cancel(id)).statusCode).toBe(200)
      expect((await cancel(id)).statusCode).toBe(200)

      const response = await redeem(CODE)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({ error: 'voucher_cancelled' })
    })

    it('ne laisse pas l’admin d’une autre compagnie annuler le bon', async () => {
      const { id } = await insertVoucher()

      const response = await call(
        'PATCH',
        `/companies/2/vouchers/${id}/status`,
        otherCompanyAdmin,
        {
          status: 0,
        }
      )

      expect(response.statusCode).toBe(404)
      expect((await db('vouchers').where('id', id).first('status')).status).toBe(1)
    })
  })

  describe('recherche publique', () => {
    const lookup = (code: string, remoteAddress = '203.0.113.50') =>
      publicApp.inject({
        method: 'POST',
        url: '/public/v1/vouchers/lookup',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ code }),
        remoteAddress,
      })

    it('montre au porteur le libellé, le centre et l’état, sans le nom du joueur', async () => {
      await insertVoucher()

      const response = await lookup('7k2m9qxd', '203.0.113.51')

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        label: 'Une partie offerte',
        companyName: 'Centre 1',
        state: 'valid',
      })
      expect(response.body).not.toMatch(/Léa|Noé/)
    })

    it('suit l’utilisation du bon', async () => {
      await insertVoucher()
      await redeem(CODE)

      expect((await lookup(CODE, '203.0.113.52')).json().state).toBe('redeemed')
    })

    it('répond 404 pour un code inconnu, supprimé ou d’une compagnie supprimée', async () => {
      await insertVoucher({
        code: 'AAAA-0001',
        participant_id: 1,
        status: 2,
        deleted_at: new Date(),
      })
      await insertVoucher({
        code: 'AAAA-0002',
        company_id: 2,
        game_id: 3,
        participant_id: 5,
        created_by: 9,
      })
      await db('companies').where('id', 2).update({ status: 2, deleted_at: new Date() })

      for (const code of ['ZZZZ-ZZZZ', 'AAAA-0001', 'AAAA-0002', 'nope']) {
        const response = await lookup(code, '203.0.113.53')

        expect(response.statusCode).toBe(404)
        expect(response.json()).toEqual({ error: 'voucher_not_found' })
      }
    })
  })
})
