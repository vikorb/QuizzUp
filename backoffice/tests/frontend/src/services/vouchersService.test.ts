import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as VouchersService from '@/services/vouchersService'

const apiFetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/api', () => ({
  apiFetch: apiFetchMock,
}))

// Le service est moqué globalement pour les composants : ici on teste le vrai module.
const service = await vi.importActual<typeof VouchersService>('@/services/vouchersService')

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('services/vouchersService', () => {
  it('lists the vouchers of a game', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { vouchers: [] }))

    const result = await service.listGameVouchersService(7, 4)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/games/4/vouchers',
      authenticated: true,
    })
    expect(result).toEqual({ ok: true, status: 200, data: { vouchers: [] } })
  })

  it('issues the voucher of a desk', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(201, { voucher: { id: 1 } }))

    const result = await service.issueGameVoucherService(7, 4, 12)

    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/companies/7/games/4/vouchers',
      method: 'POST',
      authenticated: true,
      body: JSON.stringify({ participantId: 12 }),
    })
    expect(result.ok).toBe(true)
  })

  it('sends the filters of the list and skips the empty ones', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { vouchers: [], total: 0 }))

    await service.listVouchersService(7, {
      state: 'valid',
      gameId: undefined,
      limit: 50,
      offset: 0,
    })

    expect(apiFetchMock.mock.calls[0]?.[0].path).toBe(
      '/companies/7/vouchers?state=valid&limit=50&offset=0'
    )

    await service.listVouchersService(7)

    expect(apiFetchMock.mock.calls[1]?.[0].path).toBe('/companies/7/vouchers')
  })

  it.each([
    ['lookup', () => service.lookupVoucherService(7, '7K2M-9QXP'), '/companies/7/vouchers/lookup'],
    ['redeem', () => service.redeemVoucherService(7, '7K2M-9QXP'), '/companies/7/vouchers/redeem'],
  ])('sends the code of a %s in the body, never in the address', async (_name, call, path) => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { voucher: { id: 1 } }))

    await call()

    const options = apiFetchMock.mock.calls[0]?.[0]

    expect(options).toMatchObject({
      path,
      method: 'POST',
      authenticated: true,
      body: JSON.stringify({ code: '7K2M-9QXP' }),
    })
    expect(options.path).not.toContain('7K2M')
  })

  it('cancels a voucher with the inactive status', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { voucher: { id: 3 } }))

    await service.cancelVoucherService(7, 3)

    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/companies/7/vouchers/3/status',
      method: 'PATCH',
      authenticated: true,
      body: JSON.stringify({ status: 0 }),
    })
  })

  it.each([
    [409, 'voucher_already_redeemed'],
    [409, 'voucher_cancelled'],
    [410, 'voucher_expired'],
    [404, 'voucher_not_found'],
    [409, 'voucher_already_issued'],
    [409, 'vouchers_disabled'],
    [409, 'game_not_finished'],
  ])('reads the business error code of a %i answer: %s', async (status, error) => {
    apiFetchMock.mockResolvedValue(jsonResponse(status, { error }))

    await expect(service.redeemVoucherService(7, '7K2M-9QXP')).resolves.toEqual({
      ok: false,
      status,
      error,
    })
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [400, 'invalid_body'],
    [500, 'server_error'],
  ])('falls back on a code for a %i answer without a known error', async (status, error) => {
    apiFetchMock.mockResolvedValue(jsonResponse(status, { error: 'something_unknown' }))

    await expect(service.listVouchersService(7)).resolves.toEqual({ ok: false, status, error })
  })

  it('maps an unreachable API to api_unreachable', async () => {
    apiFetchMock.mockResolvedValue(null)

    await expect(service.listVouchersService(7)).resolves.toEqual({
      ok: false,
      status: null,
      error: 'api_unreachable',
    })
  })

  it('maps an unreadable success body to invalid_json', async () => {
    apiFetchMock.mockResolvedValue(new Response('not json', { status: 200 }))

    await expect(service.listVouchersService(7)).resolves.toEqual({
      ok: false,
      status: 200,
      error: 'invalid_json',
    })
  })
})
