import '../_helpers/registerDbMock'

import voucherRedeemRoutes from '@backend/routes/vouchers/redeem'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState, resetDb } from '../_helpers/mockDb'
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
  app = await createRouteApp(voucherRedeemRoutes)
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

function redeem(body: unknown, user: TestUser | null = staffUser, companyId = 1) {
  return app.inject({
    method: 'POST',
    url: `/companies/${companyId}/vouchers/redeem`,
    headers: user ? authHeaders(user) : {},
    payload: body as object,
  })
}

describe('POST /companies/:companyId/vouchers/redeem', () => {
  it('marks a valid voucher as used, by the account that scanned it', async () => {
    seedVoucher()

    const response = await redeem({ code: CODE_A })

    expect(response.statusCode).toBe(200)
    expect(parseJson<VoucherBody>(response).voucher).toMatchObject({
      code: CODE_A,
      state: 'redeemed',
      redeemedAt: VOUCHER_NOW.toISOString(),
      redeemedBy: staffUser.id,
    })
    expect(dbState.vouchers[0]).toMatchObject({ redeemed_by: staffUser.id })
  })

  it('accepts the code as the player typed it', async () => {
    seedVoucher()

    expect((await redeem({ code: ' 7k2m 9qxd ' })).statusCode).toBe(200)
  })

  it('lets any staff member of the company do it: operator, admin, superadmin', async () => {
    seedVoucher({ id: 1, code: 'AAAA-0001', participant_id: 10 })
    seedVoucher({ id: 2, code: 'AAAA-0002', participant_id: 11 })
    seedGame(6)
    seedVoucher({ id: 3, code: 'AAAA-0003', game_id: 6, participant_id: 12 })

    expect((await redeem({ code: 'AAAA-0001' }, staffUser)).statusCode).toBe(200)
    expect((await redeem({ code: 'AAAA-0002' }, companyAdminUser)).statusCode).toBe(200)
    expect((await redeem({ code: 'AAAA-0003' }, superadminUser)).statusCode).toBe(200)
  })

  it('refuses a second use: 409 voucher_already_redeemed, and keeps the first one', async () => {
    seedVoucher()
    await redeem({ code: CODE_A }, companyAdminUser)

    const again = await redeem({ code: CODE_A }, staffUser)

    expect(again.statusCode).toBe(409)
    expect(parseJson(again)).toEqual({ error: 'voucher_already_redeemed' })
    expect(dbState.vouchers[0]!.redeemed_by).toBe(companyAdminUser.id)
  })

  it('refuses a cancelled voucher: 409 voucher_cancelled', async () => {
    seedVoucher({ status: 0 })

    const response = await redeem({ code: CODE_A })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'voucher_cancelled' })
    expect(dbState.vouchers[0]!.redeemed_at).toBeNull()
  })

  it('refuses an expired voucher: 410 voucher_expired', async () => {
    seedVoucher({ expires_at: new Date(VOUCHER_NOW.getTime() - DAY_MS) })

    const response = await redeem({ code: CODE_A })

    expect(response.statusCode).toBe(410)
    expect(parseJson(response)).toEqual({ error: 'voucher_expired' })
    expect(dbState.vouchers[0]!.redeemed_at).toBeNull()
  })

  it('refuses a voucher at the very second it expires (the end date is not included)', async () => {
    seedVoucher({ expires_at: VOUCHER_NOW })

    expect((await redeem({ code: CODE_A })).statusCode).toBe(410)
  })

  it('accepts a voucher one millisecond before its end date', async () => {
    seedVoucher({ expires_at: new Date(VOUCHER_NOW.getTime() + 1) })

    expect((await redeem({ code: CODE_A })).statusCode).toBe(200)
  })

  it('says used rather than expired for a voucher that is both', async () => {
    seedVoucher({ redeemed_at: VOUCHER_NOW, expires_at: new Date(VOUCHER_NOW.getTime() - DAY_MS) })

    expect(parseJson(await redeem({ code: CODE_A }))).toEqual({ error: 'voucher_already_redeemed' })
  })

  it('answers 404 for an unknown, malformed or deleted voucher', async () => {
    seedVoucher({ status: 2, deleted_at: VOUCHER_NOW })

    for (const code of ['ZZZZ-ZZZZ', 'abc', '', CODE_A]) {
      const response = await redeem({ code })

      expect(response.statusCode).toBe(404)
      expect(parseJson(response)).toEqual({ error: 'voucher_not_found' })
    }
  })

  it('answers 404 for a code of another company, and leaves that voucher untouched', async () => {
    seedVoucher({ company_id: 2 })

    const response = await redeem({ code: CODE_A })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'voucher_not_found' })
    expect(dbState.vouchers[0]!.redeemed_at).toBeNull()
  })

  it('does not let an admin of company B use a voucher of company A', async () => {
    seedVoucher()

    expect((await redeem({ code: CODE_A }, otherCompanyAdmin, 1)).statusCode).toBe(403)
    expect((await redeem({ code: CODE_A }, otherCompanyAdmin, 2)).statusCode).toBe(404)
    expect(dbState.vouchers[0]!.redeemed_at).toBeNull()
  })

  it('refuses an invalid body and invalid ids', async () => {
    for (const body of [{}, { code: 5 }, { code: 'x'.repeat(65) }]) {
      const response = await redeem(body)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    }

    expect((await redeem({ code: CODE_A }, staffUser, 0)).statusCode).toBe(400)
  })

  it('refuses a request without authentication and a role without the right', async () => {
    seedVoucher()

    expect((await redeem({ code: CODE_A }, null)).statusCode).toBe(401)
    expect((await redeem({ code: CODE_A }, { ...staffUser, role: 'room' })).statusCode).toBe(403)
    expect(dbState.vouchers[0]!.redeemed_at).toBeNull()
  })
})
