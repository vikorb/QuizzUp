import { VOUCHER_STATE_VALID } from '@quizzup/shared'
import { vi } from 'vitest'

import type {
  GameVouchersResponse,
  Voucher,
  VoucherApiResult,
  VoucherResponse,
  VouchersResponse,
} from '@/types/voucher'

export function createVoucherFixture(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 1,
    gameId: 4,
    participantId: 1,
    podium: 1,
    displayName: 'Team A',
    secondDisplayName: null,
    code: '7K2M-9QXP',
    label: 'Une partie offerte',
    state: VOUCHER_STATE_VALID,
    expiresAt: '2027-02-01T10:00:00.000Z',
    redeemedAt: null,
    redeemedBy: null,
    createdAt: '2026-11-03T15:40:00.000Z',
    url: null,
    ...overrides,
  }
}

export function mockVoucherFailure(
  mock: { mockResolvedValue: (value: never) => unknown },
  error: string,
  status = 409
): void {
  mock.mockResolvedValue({ ok: false, status, error } as never)
}

// Par défaut : aucun bon émis, et les écritures réussissent avec un bon valable.
export const listGameVouchersServiceMock = vi.fn(
  async (_companyId: number, _gameId: number): Promise<VoucherApiResult<GameVouchersResponse>> => ({
    ok: true,
    status: 200,
    data: { vouchers: [] },
  })
)

export const issueGameVoucherServiceMock = vi.fn(
  async (
    _companyId: number,
    _gameId: number,
    participantId: number
  ): Promise<VoucherApiResult<VoucherResponse>> => ({
    ok: true,
    status: 201,
    data: { voucher: createVoucherFixture({ participantId }) },
  })
)

export const listVouchersServiceMock = vi.fn(
  async (_companyId: number, _query?: unknown): Promise<VoucherApiResult<VouchersResponse>> => ({
    ok: true,
    status: 200,
    data: { vouchers: [], total: 0 },
  })
)

export const lookupVoucherServiceMock = vi.fn(
  async (_companyId: number, _code: string): Promise<VoucherApiResult<VoucherResponse>> => ({
    ok: true,
    status: 200,
    data: { voucher: createVoucherFixture() },
  })
)

export const redeemVoucherServiceMock = vi.fn(
  async (_companyId: number, _code: string): Promise<VoucherApiResult<VoucherResponse>> => ({
    ok: true,
    status: 200,
    data: {
      voucher: createVoucherFixture({
        state: 'redeemed',
        redeemedAt: '2026-11-10T12:00:00.000Z',
      }),
    },
  })
)

export const cancelVoucherServiceMock = vi.fn(
  async (_companyId: number, _voucherId: number): Promise<VoucherApiResult<VoucherResponse>> => ({
    ok: true,
    status: 200,
    data: { voucher: createVoucherFixture({ state: 'cancelled' }) },
  })
)

export function resetVouchersServiceMock(): void {
  for (const mock of [
    listGameVouchersServiceMock,
    issueGameVoucherServiceMock,
    listVouchersServiceMock,
    lookupVoucherServiceMock,
    redeemVoucherServiceMock,
    cancelVoucherServiceMock,
  ]) {
    mock.mockReset()
  }

  listGameVouchersServiceMock.mockResolvedValue({ ok: true, status: 200, data: { vouchers: [] } })
  issueGameVoucherServiceMock.mockImplementation(async (_companyId, _gameId, participantId) => ({
    ok: true,
    status: 201,
    data: { voucher: createVoucherFixture({ participantId }) },
  }))
  listVouchersServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { vouchers: [], total: 0 },
  })
  lookupVoucherServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { voucher: createVoucherFixture() },
  })
  redeemVoucherServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      voucher: createVoucherFixture({ state: 'redeemed', redeemedAt: '2026-11-10T12:00:00.000Z' }),
    },
  })
  cancelVoucherServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { voucher: createVoucherFixture({ state: 'cancelled' }) },
  })
}
