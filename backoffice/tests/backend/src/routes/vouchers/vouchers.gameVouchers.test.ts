import '../_helpers/registerDbMock'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMPANY_STATUS_DELETED,
  GAME_STATE_RUNNING,
  VOUCHER_CODE_PATTERN,
  VOUCHER_STATUS_DELETED,
  VOUCHER_STATUS_INACTIVE,
} from '@quizzup/shared'
import gameVouchersRoutes from '@backend/routes/vouchers/gameVouchers'
import { generateVoucherCode } from '@backend/routes/vouchers/_shared'
import { qrSvg } from '@backend/utils/qrSvg'
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
  CODE_B,
  DAY_MS,
  enableVouchers,
  otherCompanyAdmin,
  seedGame,
  seedVoucher,
  staffUser,
  VOUCHER_NOW,
} from '../_helpers/vouchers'

// Seul le tirage du code est surveillé : le reste du module est le vrai.
vi.mock('@backend/routes/vouchers/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@backend/routes/vouchers/_shared')>()

  return { ...actual, generateVoucherCode: vi.fn(actual.generateVoucherCode) }
})

type VoucherBody = { voucher: Record<string, unknown> }
type ListBody = { vouchers: Array<Record<string, unknown>> }

let app: FastifyInstance

beforeEach(async () => {
  resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(VOUCHER_NOW)
  vi.mocked(generateVoucherCode).mockReset()
  enableVouchers()
  seedGame()
  app = await createRouteApp(gameVouchersRoutes)
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function issue(
  body: unknown,
  user: TestUser | null = companyAdminUser,
  url = '/companies/1/games/5/vouchers'
) {
  return app.inject({
    method: 'POST',
    url,
    headers: user ? authHeaders(user) : {},
    payload: body as object,
  })
}

function list(user: TestUser | null = companyAdminUser, url = '/companies/1/games/5/vouchers') {
  return app.inject({ method: 'GET', url, headers: user ? authHeaders(user) : {} })
}

describe('POST /companies/:companyId/games/:gameId/vouchers', () => {
  it('issues a voucher: copied label, expiry from the company setting, creator, formatted code', async () => {
    const response = await issue({ participantId: 10 })
    const { voucher } = parseJson<VoucherBody>(response)

    expect(response.statusCode).toBe(201)
    expect(voucher).toMatchObject({
      gameId: 5,
      participantId: 10,
      podium: 1,
      displayName: 'Camille',
      secondDisplayName: 'Léa',
      label: 'Une partie offerte',
      state: 'valid',
      expiresAt: new Date(VOUCHER_NOW.getTime() + 30 * DAY_MS).toISOString(),
    })
    expect(String(voucher.code)).toMatch(VOUCHER_CODE_PATTERN)
    expect(dbState.vouchers).toHaveLength(1)
    expect(dbState.vouchers[0]).toMatchObject({
      company_id: 1,
      game_id: 5,
      participant_id: 10,
      created_by: companyAdminUser.id,
      status: 1,
    })
  })

  it('never exposes an e-mail address, a status or the raw company id', async () => {
    dbState.game_participants[0]!.email = 'camille@x.test'

    const { voucher } = parseJson<VoucherBody>(await issue({ participantId: 10 }))

    expect(JSON.stringify(voucher)).not.toContain('@')
    expect(voucher).not.toHaveProperty('status')
    expect(voucher).not.toHaveProperty('company_id')
  })

  it('freezes the label at issue time: changing the setting later leaves it alone', async () => {
    await issue({ participantId: 10 })
    enableVouchers(1, 'Un cocktail offert', 10)

    const second = parseJson<VoucherBody>(await issue({ participantId: 11 })).voucher
    const first = dbState.vouchers[0]!

    expect(first.label).toBe('Une partie offerte')
    expect(second.label).toBe('Un cocktail offert')
    expect(second.expiresAt).toBe(new Date(VOUCHER_NOW.getTime() + 10 * DAY_MS).toISOString())
  })

  it('builds the public url from PUBLIC_APP_URL, without a doubled slash', async () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test/')

    const { voucher } = parseJson<VoucherBody>(await issue({ participantId: 10 }))

    expect(voucher.url).toBe(`https://bo.quizzup.test/bon/#${String(voucher.code)}`)
    expect(voucher.qrSvg).toBe(qrSvg(`https://bo.quizzup.test/bon/#${String(voucher.code)}`))
  })

  it('answers a null url while PUBLIC_APP_URL is empty', async () => {
    vi.stubEnv('PUBLIC_APP_URL', '')

    const { voucher } = parseJson<VoucherBody>(await issue({ participantId: 10 }))

    expect(voucher.url).toBeNull()
    expect(voucher.qrSvg).toBeNull()
  })

  it('lets the operator (role user) and the superadmin issue vouchers', async () => {
    expect((await issue({ participantId: 10 }, staffUser)).statusCode).toBe(201)
    expect((await issue({ participantId: 11 }, superadminUser)).statusCode).toBe(201)
  })

  it('accepts the participant id as text', async () => {
    expect((await issue({ participantId: '10' })).statusCode).toBe(201)
  })

  it('refuses a second voucher for the same desk, even a cancelled one', async () => {
    expect((await issue({ participantId: 10 })).statusCode).toBe(201)

    const again = await issue({ participantId: 10 })

    expect(again.statusCode).toBe(409)
    expect(parseJson(again)).toEqual({ error: 'voucher_already_issued' })

    dbState.vouchers[0]!.status = VOUCHER_STATUS_INACTIVE

    expect((await issue({ participantId: 10 })).statusCode).toBe(409)
    expect(dbState.vouchers).toHaveLength(1)
  })

  it('does not count a deleted voucher against the desk', async () => {
    seedVoucher({ status: VOUCHER_STATUS_DELETED, deleted_at: VOUCHER_NOW })

    expect((await issue({ participantId: 10 })).statusCode).toBe(201)
  })

  it('draws another code when the first one is already used', async () => {
    seedVoucher({ participant_id: 11 })
    vi.mocked(generateVoucherCode).mockReturnValueOnce(CODE_A).mockReturnValueOnce(CODE_B)

    const response = await issue({ participantId: 10 })

    expect(response.statusCode).toBe(201)
    expect(parseJson<VoucherBody>(response).voucher.code).toBe(CODE_B)
    expect(generateVoucherCode).toHaveBeenCalledTimes(2)
  })

  it('gives up with a server error after three collisions in a row', async () => {
    seedVoucher({ participant_id: 11 })
    vi.mocked(generateVoucherCode).mockReturnValue(CODE_A)

    const response = await issue({ participantId: 10 })

    expect(response.statusCode).toBe(500)
    expect(generateVoucherCode).toHaveBeenCalledTimes(3)
    expect(dbState.vouchers).toHaveLength(1)
  })

  it('answers vouchers_disabled while the company has no label', async () => {
    Object.assign(dbState.companies[0]!, { voucher_label: null })

    const response = await issue({ participantId: 10 })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'vouchers_disabled' })
    expect(dbState.vouchers).toHaveLength(0)
  })

  it('answers game_not_finished for a game that has not ended', async () => {
    dbState.games[0]!.state = GAME_STATE_RUNNING

    const response = await issue({ participantId: 10 })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'game_not_finished' })
  })

  it('answers participant_not_found for a desk of another game', async () => {
    seedGame(6)

    const response = await issue({ participantId: 12 })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'participant_not_found' })
    expect(dbState.vouchers).toHaveLength(0)
  })

  it('answers 404 for an unknown or deleted game', async () => {
    expect(
      (await issue({ participantId: 10 }, companyAdminUser, '/companies/1/games/99/vouchers'))
        .statusCode
    ).toBe(404)

    dbState.games[0]!.status = 2

    expect((await issue({ participantId: 10 })).statusCode).toBe(404)
  })

  it('answers 404 for a deleted company', async () => {
    dbState.companies[0]!.status = COMPANY_STATUS_DELETED

    expect((await issue({ participantId: 10 }, superadminUser)).statusCode).toBe(404)
  })

  it('refuses an invalid body or invalid ids', async () => {
    for (const body of [{}, { participantId: 0 }, { participantId: 'x' }, { participantId: 1.5 }]) {
      const response = await issue(body)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    }

    const badParams = await issue(
      { participantId: 10 },
      companyAdminUser,
      '/companies/abc/games/5/vouchers'
    )

    expect(badParams.statusCode).toBe(400)
    expect(parseJson(badParams)).toEqual({ error: 'invalid_params' })
  })

  it('refuses a request without authentication and a role without the right', async () => {
    expect((await issue({ participantId: 10 }, null)).statusCode).toBe(401)
    expect((await issue({ participantId: 10 }, { ...staffUser, role: 'room' })).statusCode).toBe(
      403
    )
  })

  it('does not let an admin of company B issue in company A, nor reach A through B', async () => {
    const intoOther = await issue({ participantId: 10 }, otherCompanyAdmin)

    expect(intoOther.statusCode).toBe(403)
    expect(parseJson(intoOther)).toEqual({ error: 'forbidden' })

    // Sous sa propre compagnie : la partie 5 est celle de la compagnie 1, donc introuvable.
    const throughOwn = await issue(
      { participantId: 10 },
      otherCompanyAdmin,
      '/companies/2/games/5/vouchers'
    )

    expect(throughOwn.statusCode).toBe(404)
    expect(dbState.vouchers).toHaveLength(0)
  })
})

describe('GET /companies/:companyId/games/:gameId/vouchers', () => {
  it('lists the vouchers of the game by desk, cancelled ones included, with their state', async () => {
    seedVoucher({ id: 1, participant_id: 11, code: CODE_B })
    seedVoucher({ id: 2, participant_id: 10, status: VOUCHER_STATUS_INACTIVE })
    seedVoucher({ id: 3, game_id: 6, participant_id: 12, code: 'ZZZZ-ZZZZ' })
    seedVoucher({ id: 4, participant_id: 10, status: VOUCHER_STATUS_DELETED, code: 'AAAA-AAAA' })

    const response = await list()
    const { vouchers } = parseJson<ListBody>(response)

    expect(response.statusCode).toBe(200)
    expect(vouchers.map((voucher) => [voucher.podium, voucher.code, voucher.state])).toEqual([
      [1, CODE_A, 'cancelled'],
      [2, CODE_B, 'valid'],
    ])
  })

  it('gives each voucher the QR code of its url, null while PUBLIC_APP_URL is empty', async () => {
    seedVoucher({ id: 1, participant_id: 11, code: CODE_B })
    seedVoucher({ id: 2, participant_id: 10, code: CODE_A })

    vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test')
    const withUrl = parseJson<ListBody>(await list()).vouchers

    expect(withUrl.map((voucher) => voucher.qrSvg)).toEqual([
      qrSvg(`https://bo.quizzup.test/bon/#${CODE_A}`),
      qrSvg(`https://bo.quizzup.test/bon/#${CODE_B}`),
    ])

    vi.stubEnv('PUBLIC_APP_URL', '')
    const withoutUrl = parseJson<ListBody>(await list()).vouchers

    expect(withoutUrl.map((voucher) => [voucher.url, voucher.qrSvg])).toEqual([
      [null, null],
      [null, null],
    ])
  })

  it('lists an empty array for a game without vouchers', async () => {
    expect(parseJson(await list())).toEqual({ vouchers: [] })
  })

  it('is open to the operator and to the superadmin', async () => {
    expect((await list(staffUser)).statusCode).toBe(200)
    expect((await list(superadminUser)).statusCode).toBe(200)
  })

  it('answers 404 for an unknown game and 400 for bad ids', async () => {
    expect((await list(companyAdminUser, '/companies/1/games/99/vouchers')).statusCode).toBe(404)
    expect((await list(companyAdminUser, '/companies/1/games/x/vouchers')).statusCode).toBe(400)
  })

  it('refuses a request without authentication', async () => {
    expect((await list(null)).statusCode).toBe(401)
  })

  it('does not show company A vouchers to an admin of company B', async () => {
    seedVoucher()

    expect((await list(otherCompanyAdmin)).statusCode).toBe(403)

    const throughOwn = await list(otherCompanyAdmin, '/companies/2/games/5/vouchers')

    expect(throughOwn.statusCode).toBe(404)
  })
})
