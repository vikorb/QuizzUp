import '../_helpers/registerDbMock'

import publicRoutes from '@backend/routes/public'
import { PUBLIC_API_PREFIX } from '@backend/routes/public/_shared'
import {
  VOUCHER_LOOKUP_BODY_LIMIT,
  VOUCHER_LOOKUP_RATE_LIMIT_MAX,
} from '@backend/routes/public/vouchers'
import {
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  VOUCHER_STATUS_DELETED,
  VOUCHER_STATUS_INACTIVE,
} from '@quizzup/shared'
import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState, resetDb } from '../_helpers/mockDb'
import { CODE_A, DAY_MS, seedGame, seedVoucher, VOUCHER_NOW } from '../_helpers/vouchers'

const ENDPOINT = `${PUBLIC_API_PREFIX}/vouchers/lookup`

async function createApp() {
  const app = fastify({ logger: false })

  // Le projet de tests ne charge pas les augmentations de types (jwt, authenticate) du backend.
  await app.register(publicRoutes as never, { prefix: PUBLIC_API_PREFIX })
  await app.ready()

  return app
}

type App = Awaited<ReturnType<typeof createApp>>

let app: App

const lookup = (body: unknown, remoteAddress = '203.0.113.10') =>
  app.inject({
    method: 'POST',
    url: ENDPOINT,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
    remoteAddress,
  })

beforeEach(async () => {
  resetDb()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(VOUCHER_NOW)
  seedGame()
  app = await createApp()
})

afterEach(async () => {
  await app.close()
  vi.useRealTimers()
})

describe('routes/public/vouchers — POST /public/v1/vouchers/lookup', () => {
  it('shows the holder the label, the company, the end date and the state, without authentication', async () => {
    const voucher = seedVoucher()

    const response = await lookup({ code: CODE_A })

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.json()).toEqual({
      label: 'Une partie offerte',
      companyName: dbState.companies[0]!.name,
      logoUrl: null,
      expiresAt: (voucher.expires_at as Date).toISOString(),
      state: 'valid',
    })
  })

  it('gives the logo url of a company that has one', async () => {
    seedVoucher()
    dbState.companies[0]!.logo_key = 'logos/11111111-1111-4111-8111-111111111111.png'

    const { logoUrl } = (await lookup({ code: CODE_A })).json()

    expect(logoUrl).toBe(`${PUBLIC_API_PREFIX}/logos/11111111-1111-4111-8111-111111111111.png`)
  })

  it('leaks neither the name of the player, nor the game, nor the code, nor any id', async () => {
    seedVoucher()

    const response = await lookup({ code: CODE_A })

    for (const secret of [
      'Camille',
      'Léa',
      CODE_A,
      'participant',
      'gameId',
      'redeemed_by',
      'company_id',
    ]) {
      expect(response.body).not.toContain(secret)
    }
  })

  it.each([
    ['lower case', '7k2m-9qxd'],
    ['spaces', ' 7K2M 9QXD '],
    ['no separator', '7k2m9qxd'],
  ])('normalizes the typed code (%s)', async (_label, typed) => {
    seedVoucher()

    expect((await lookup({ code: typed })).statusCode).toBe(200)
  })

  it('reports each state: expired, redeemed, cancelled', async () => {
    seedVoucher({ id: 1, code: 'AAAA-0001', expires_at: new Date(VOUCHER_NOW.getTime() - DAY_MS) })
    seedVoucher({ id: 2, code: 'AAAA-0002', participant_id: 11, redeemed_at: VOUCHER_NOW })
    seedVoucher({ id: 3, code: 'AAAA-0003', status: VOUCHER_STATUS_INACTIVE })

    const states = []

    for (const code of ['AAAA-0001', 'AAAA-0002', 'AAAA-0003']) {
      states.push((await lookup({ code })).json().state)
    }

    expect(states).toEqual(['expired', 'redeemed', 'cancelled'])
  })

  it('answers the same 404 for a malformed, unknown or deleted code and for a deleted company', async () => {
    seedVoucher({
      id: 1,
      code: 'AAAA-0001',
      status: VOUCHER_STATUS_DELETED,
      deleted_at: VOUCHER_NOW,
    })
    seedVoucher({ id: 2, code: 'AAAA-0002', company_id: 2 })
    Object.assign(dbState.companies.find((company) => company.id === 2) ?? {}, {
      status: COMPANY_STATUS_DELETED,
    })

    const bodies = new Set<string>()

    for (const code of ['ZZZZ-ZZZZ', 'abc', '', 'AAAA-0001', 'AAAA-0002']) {
      const response = await lookup({ code })

      expect(response.statusCode).toBe(404)
      bodies.add(response.body)
    }

    expect([...bodies]).toEqual([JSON.stringify({ error: 'voucher_not_found' })])
  })

  it('still answers for the voucher of an inactive company', async () => {
    seedVoucher()
    dbState.companies[0]!.status = COMPANY_STATUS_INACTIVE

    expect((await lookup({ code: CODE_A })).statusCode).toBe(200)
  })

  it('does not change the voucher', async () => {
    seedVoucher()

    await lookup({ code: CODE_A })

    expect(dbState.vouchers[0]).toMatchObject({ redeemed_at: null, status: 1 })
  })

  it('refuses a body without a code or with a code that is not text, in the public error format', async () => {
    for (const body of [{}, { code: 12 }, { code: null }, { code: 'x'.repeat(65) }]) {
      const response = await lookup(body)

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ error: 'invalid_body' })
    }
  })

  it('does not read the code from the query string', async () => {
    seedVoucher()

    const response = await app.inject({
      method: 'POST',
      url: `${ENDPOINT}?code=${CODE_A}`,
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })

    expect(response.statusCode).toBe(400)
  })

  it('refuses a body above the limit with 413', async () => {
    const response = await lookup({ code: 'x'.repeat(VOUCHER_LOOKUP_BODY_LIMIT) })

    expect(response.statusCode).toBe(413)
  })

  it('answers 429 with Retry-After past the limit, per address, and counts the misses too', async () => {
    seedVoucher()

    for (let attempt = 0; attempt < VOUCHER_LOOKUP_RATE_LIMIT_MAX; attempt += 1) {
      expect((await lookup({ code: 'ZZZZ-ZZZZ' })).statusCode).toBe(404)
    }

    const blocked = await lookup({ code: CODE_A })

    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toMatchObject({ error: 'too_many_requests' })
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    expect((await lookup({ code: CODE_A }, '198.51.100.7')).statusCode).toBe(200)
  })

  it('lets the same address search again once the window has passed', async () => {
    seedVoucher()

    for (let attempt = 0; attempt <= VOUCHER_LOOKUP_RATE_LIMIT_MAX; attempt += 1) {
      await lookup({ code: 'ZZZZ-ZZZZ' })
    }

    expect((await lookup({ code: CODE_A })).statusCode).toBe(429)

    vi.setSystemTime(new Date(VOUCHER_NOW.getTime() + 61_000))

    expect((await lookup({ code: CODE_A })).statusCode).toBe(200)
  })
})
