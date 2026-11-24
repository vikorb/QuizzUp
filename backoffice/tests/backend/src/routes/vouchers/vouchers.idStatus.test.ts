import '../_helpers/registerDbMock'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import voucherStatusRoutes from '@backend/routes/vouchers/idStatus'
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
  app = await createRouteApp(voucherStatusRoutes)
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

function cancel(
  body: unknown = { status: 0 },
  user: TestUser | null = companyAdminUser,
  url = '/companies/1/vouchers/1/status'
) {
  return app.inject({
    method: 'PATCH',
    url,
    headers: user ? authHeaders(user) : {},
    payload: body as object,
  })
}

describe('PATCH /companies/:companyId/vouchers/:voucherId/status', () => {
  it('cancels a valid voucher', async () => {
    seedVoucher()

    const response = await cancel()

    expect(response.statusCode).toBe(200)
    expect(parseJson<VoucherBody>(response).voucher).toMatchObject({ id: 1, state: 'cancelled' })
    expect(dbState.vouchers[0]!.status).toBe(0)
  })

  it('cancels an expired voucher too', async () => {
    seedVoucher({ expires_at: new Date(VOUCHER_NOW.getTime() - DAY_MS) })

    expect(parseJson<VoucherBody>(await cancel()).voucher.state).toBe('cancelled')
  })

  it('is idempotent: cancelling a cancelled voucher answers 200', async () => {
    seedVoucher({ status: 0 })

    const response = await cancel()

    expect(response.statusCode).toBe(200)
    expect(parseJson<VoucherBody>(response).voucher.state).toBe('cancelled')
  })

  it('refuses to cancel a used voucher: 409 voucher_already_redeemed, status unchanged', async () => {
    seedVoucher({ redeemed_at: VOUCHER_NOW, redeemed_by: 3 })

    const response = await cancel()

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'voucher_already_redeemed' })
    expect(dbState.vouchers[0]!.status).toBe(1)
  })

  it('reserves cancellation to the admin: the operator is refused', async () => {
    seedVoucher()

    const response = await cancel({ status: 0 }, staffUser)

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })
    expect(dbState.vouchers[0]!.status).toBe(1)
  })

  it('lets the superadmin cancel in any company', async () => {
    seedVoucher({ company_id: 2 })

    expect(
      (await cancel({ status: 0 }, superadminUser, '/companies/2/vouchers/1/status')).statusCode
    ).toBe(200)
  })

  it('refuses any status but the cancellation: no way back to active, no deletion', async () => {
    seedVoucher({ status: 0 })

    for (const status of [1, 2, 3, '0', null]) {
      const response = await cancel({ status })

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    }

    expect(dbState.vouchers[0]!.status).toBe(0)
  })

  it('answers 404 for an unknown or deleted voucher', async () => {
    seedVoucher({ status: 2, deleted_at: VOUCHER_NOW })

    for (const id of [1, 99]) {
      const response = await cancel(
        { status: 0 },
        companyAdminUser,
        `/companies/1/vouchers/${id}/status`
      )

      expect(response.statusCode).toBe(404)
      expect(parseJson(response)).toEqual({ error: 'voucher_not_found' })
    }
  })

  it('does not let an admin of company B cancel a voucher of company A', async () => {
    seedVoucher()

    expect((await cancel({ status: 0 }, otherCompanyAdmin)).statusCode).toBe(403)

    const throughOwn = await cancel(
      { status: 0 },
      otherCompanyAdmin,
      '/companies/2/vouchers/1/status'
    )

    expect(throughOwn.statusCode).toBe(404)
    expect(dbState.vouchers[0]!.status).toBe(1)
  })

  it('refuses invalid ids and a request without authentication', async () => {
    seedVoucher()

    expect(
      (await cancel({ status: 0 }, companyAdminUser, '/companies/1/vouchers/abc/status')).statusCode
    ).toBe(400)
    expect((await cancel({ status: 0 }, null)).statusCode).toBe(401)
  })
})
