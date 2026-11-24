import '../_helpers/registerDbMock'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VOUCHER_STATUS_DELETED } from '@quizzup/shared'
import voucherLookupRoutes from '@backend/routes/vouchers/lookup'
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
  CODE_A,
  DAY_MS,
  otherCompanyAdmin,
  seedGame,
  seedVoucher,
  staffUser,
  VOUCHER_NOW,
} from '../_helpers/vouchers'

type VoucherBody = { voucher: Record<string, unknown> }

let app: FastifyInstance

beforeEach(async () => {
  resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(VOUCHER_NOW)
  seedGame()
  seedVoucher()
  app = await createRouteApp(voucherLookupRoutes)
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

function lookup(body: unknown, user: TestUser | null = companyAdminUser, companyId = 1) {
  return app.inject({
    method: 'POST',
    url: `/companies/${companyId}/vouchers/lookup`,
    headers: user ? authHeaders(user) : {},
    payload: body as object,
  })
}

describe('POST /companies/:companyId/vouchers/lookup', () => {
  it('finds a voucher with its desk, state and dates', async () => {
    const response = await lookup({ code: CODE_A })

    expect(response.statusCode).toBe(200)
    expect(parseJson<VoucherBody>(response).voucher).toMatchObject({
      code: CODE_A,
      label: 'Une partie offerte',
      state: 'valid',
      displayName: 'Camille',
      secondDisplayName: 'Léa',
      podium: 1,
      gameId: 5,
      participantId: 10,
    })
  })

  it.each([
    ['lower case', '7k2m-9qxd'],
    ['spaces instead of the dash', '7K2M 9QXD'],
    ['no separator and padding', '  7k2m9qxd  '],
  ])('normalizes the typed code (%s)', async (_label, typed) => {
    const response = await lookup({ code: typed })

    expect(response.statusCode).toBe(200)
  })

  it('reads O as 0 and I or L as 1 in the typed code', async () => {
    seedVoucher({ id: 2, participant_id: 11, code: '0011-0011' })

    for (const typed of ['OOII-OOLL', 'oo11 0011', '0O1L-O0I1']) {
      expect((await lookup({ code: typed })).statusCode).toBe(200)
    }
  })

  it('reports the state of a voucher: expired, redeemed, cancelled', async () => {
    seedVoucher({
      id: 2,
      code: 'AAAA-0002',
      participant_id: 11,
      expires_at: new Date(VOUCHER_NOW.getTime() - DAY_MS),
    })
    seedVoucher({ id: 3, code: 'AAAA-0003', redeemed_at: VOUCHER_NOW })
    seedVoucher({ id: 4, code: 'AAAA-0004', status: 0 })

    const states: string[] = []

    for (const code of ['AAAA-0002', 'AAAA-0003', 'AAAA-0004']) {
      states.push(String(parseJson<VoucherBody>(await lookup({ code })).voucher.state))
    }

    expect(states).toEqual(['expired', 'redeemed', 'cancelled'])
  })

  it('answers the same 404 for an unknown, malformed, deleted or empty code', async () => {
    seedVoucher({
      id: 2,
      code: 'AAAA-0002',
      status: VOUCHER_STATUS_DELETED,
      deleted_at: VOUCHER_NOW,
    })

    const responses = []

    for (const code of ['ZZZZ-ZZZZ', 'abc', '', '7K2M-9QXD-0', 'UUUU-UUUU', 'AAAA-0002']) {
      responses.push(await lookup({ code }))
    }

    for (const response of responses) {
      expect(response.statusCode).toBe(404)
      expect(parseJson(response)).toEqual({ error: 'voucher_not_found' })
    }
  })

  it('answers 404, exactly like an unknown code, for a code of another company', async () => {
    const own = await lookup({ code: 'ZZZZ-ZZZZ' })
    const other = await lookup({ code: CODE_A }, otherCompanyAdmin, 2)

    expect(other.statusCode).toBe(404)
    expect(other.body).toBe(own.body)
  })

  it('refuses an invalid body and invalid ids', async () => {
    for (const body of [{}, { code: 12 }, { code: 'x'.repeat(65) }, { code: null }]) {
      const response = await lookup(body)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    }

    expect((await lookup({ code: CODE_A }, companyAdminUser, 0)).statusCode).toBe(400)
  })

  it('does not take the code from the url or the query string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/companies/1/vouchers/lookup?code=${CODE_A}`,
      headers: authHeaders(companyAdminUser),
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })

  it('is open to the operator and the superadmin', async () => {
    expect((await lookup({ code: CODE_A }, staffUser)).statusCode).toBe(200)
    expect((await lookup({ code: CODE_A }, superadminUser)).statusCode).toBe(200)
  })

  it('refuses a request without authentication, a role without the right and another company', async () => {
    expect((await lookup({ code: CODE_A }, null)).statusCode).toBe(401)
    expect((await lookup({ code: CODE_A }, { ...staffUser, role: 'room' })).statusCode).toBe(403)
    expect((await lookup({ code: CODE_A }, otherCompanyAdmin)).statusCode).toBe(403)
  })
})
