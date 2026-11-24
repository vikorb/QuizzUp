import '../_helpers/registerDbMock'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  VOUCHER_LIST_DEFAULT_LIMIT,
  VOUCHER_LIST_MAX_LIMIT,
  VOUCHER_STATES,
  VOUCHER_STATUS_DELETED,
  VOUCHER_STATUS_INACTIVE,
} from '@quizzup/shared'
import vouchersRoutes from '@backend/routes/vouchers'
import { vouchersListQuerySchema } from '@backend/routes/vouchers/_schemas'
import { resetDb } from '../_helpers/mockDb'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'
import {
  DAY_MS,
  otherCompanyAdmin,
  seedGame,
  seedVoucher,
  staffUser,
  VOUCHER_NOW,
} from '../_helpers/vouchers'

type ListBody = { vouchers: Array<Record<string, unknown>>; total: number }

let app: FastifyInstance

const PAST = new Date(VOUCHER_NOW.getTime() - DAY_MS)

beforeEach(async () => {
  resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(VOUCHER_NOW)
  seedGame(5)
  seedGame(6)
  app = await createRouteApp(vouchersRoutes)
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function list(query = '', user: TestUser | null = companyAdminUser, companyId = 1) {
  return app.inject({
    method: 'GET',
    url: `/companies/${companyId}/vouchers${query}`,
    headers: user ? authHeaders(user) : {},
  })
}

/** Un bon de chaque état, plus un supprimé, un d'une autre compagnie et un d'une autre partie. */
function seedOneOfEach() {
  seedVoucher({
    id: 1,
    code: 'AAAA-0001',
    participant_id: 10,
    created_at: '2027-03-01T10:00:00.000Z',
  })
  seedVoucher({
    id: 2,
    code: 'AAAA-0002',
    participant_id: 11,
    expires_at: PAST,
    created_at: '2027-03-02T10:00:00.000Z',
  })
  seedVoucher({
    id: 3,
    code: 'AAAA-0003',
    game_id: 6,
    participant_id: 12,
    redeemed_at: PAST,
    redeemed_by: 2,
    created_at: '2027-03-03T10:00:00.000Z',
  })
  seedVoucher({
    id: 4,
    code: 'AAAA-0004',
    game_id: 6,
    participant_id: 13,
    status: VOUCHER_STATUS_INACTIVE,
    created_at: '2027-03-04T10:00:00.000Z',
  })
  seedVoucher({
    id: 5,
    code: 'AAAA-0005',
    status: VOUCHER_STATUS_DELETED,
    deleted_at: PAST,
    created_at: '2027-03-05T10:00:00.000Z',
  })
  seedVoucher({
    id: 6,
    code: 'AAAA-0006',
    company_id: 2,
    created_at: '2027-03-06T10:00:00.000Z',
  })
}

const idsOf = (body: ListBody) => body.vouchers.map((voucher) => voucher.id)

describe('GET /companies/:companyId/vouchers', () => {
  it('lists the vouchers of the company, newest first, without deleted ones or other companies', async () => {
    seedOneOfEach()

    const response = await list()
    const body = parseJson<ListBody>(response)

    expect(response.statusCode).toBe(200)
    expect(idsOf(body)).toEqual([4, 3, 2, 1])
    expect(body.total).toBe(4)
    expect(body.vouchers.map((voucher) => voucher.state)).toEqual([
      'cancelled',
      'redeemed',
      'expired',
      'valid',
    ])
  })

  it('keeps the url but not the QR code: up to 200 SVG per page would cost too much', async () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test')
    seedOneOfEach()

    const { vouchers } = parseJson<ListBody>(await list())

    expect(vouchers[0]!.url).toBe(`https://bo.quizzup.test/bon/#${String(vouchers[0]!.code)}`)
    expect(vouchers.some((voucher) => 'qrSvg' in voucher)).toBe(false)
  })

  it.each([
    ['valid', [1]],
    ['expired', [2]],
    ['redeemed', [3]],
    ['cancelled', [4]],
  ])('filters by state %s', async (state, expected) => {
    seedOneOfEach()

    const body = parseJson<ListBody>(await list(`?state=${state}`))

    expect(idsOf(body)).toEqual(expected)
    expect(body.total).toBe(expected.length)
  })

  it('does not call a redeemed voucher expired, even past its end date', async () => {
    seedVoucher({ id: 1, redeemed_at: PAST, expires_at: PAST })

    expect(idsOf(parseJson<ListBody>(await list('?state=redeemed')))).toEqual([1])
    expect(idsOf(parseJson<ListBody>(await list('?state=expired')))).toEqual([])
  })

  it('filters by game', async () => {
    seedOneOfEach()

    expect(idsOf(parseJson<ListBody>(await list('?gameId=6')))).toEqual([4, 3])
    expect(idsOf(parseJson<ListBody>(await list('?gameId=6&state=redeemed')))).toEqual([3])
  })

  it('pages the result with a total that ignores the page', async () => {
    seedOneOfEach()

    const first = parseJson<ListBody>(await list('?limit=3'))
    const second = parseJson<ListBody>(await list('?limit=3&offset=3'))

    expect(idsOf(first)).toEqual([4, 3, 2])
    expect(idsOf(second)).toEqual([1])
    expect(first.total).toBe(4)
    expect(second.total).toBe(4)
  })

  it('breaks a date tie by id, so that two pages never overlap', async () => {
    for (const id of [1, 2, 3]) {
      seedVoucher({ id, code: `BBBB-000${id}`, created_at: '2027-03-01T10:00:00.000Z' })
    }

    expect(idsOf(parseJson<ListBody>(await list('?limit=2')))).toEqual([3, 2])
    expect(idsOf(parseJson<ListBody>(await list('?limit=2&offset=2')))).toEqual([1])
  })

  it('refuses an unknown state, a null limit and a negative offset', async () => {
    for (const query of ['?state=nope', '?limit=0', '?offset=-1', '?gameId=0']) {
      const response = await list(query)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'invalid_params' })
    }

    expect((await list('', companyAdminUser, 0)).statusCode).toBe(400)
  })

  it('limits a page to the maximum and defaults to the default size', () => {
    expect(vouchersListQuerySchema.parse({ limit: '100000' }).limit).toBe(VOUCHER_LIST_MAX_LIMIT)
    expect(vouchersListQuerySchema.parse({}).limit).toBe(VOUCHER_LIST_DEFAULT_LIMIT)
    expect(
      Object.values(VOUCHER_STATES).every(
        (state) => vouchersListQuerySchema.safeParse({ state }).success
      )
    ).toBe(true)
  })

  it('is open to the operator and to the superadmin (who picks the company)', async () => {
    seedOneOfEach()

    expect((await list('', staffUser)).statusCode).toBe(200)
    expect(parseJson<ListBody>(await list('', superadminUser, 2)).total).toBe(1)
  })

  it('refuses a request without authentication and a role without the right', async () => {
    expect((await list('', null)).statusCode).toBe(401)
    expect((await list('', { ...staffUser, role: 'room' })).statusCode).toBe(403)
  })

  it('does not show company A vouchers to an admin of company B', async () => {
    seedOneOfEach()

    const intoOther = await list('', otherCompanyAdmin, 1)
    const own = parseJson<ListBody>(await list('', otherCompanyAdmin, 2))

    expect(intoOther.statusCode).toBe(403)
    expect(idsOf(own)).toEqual([6])
  })
})
