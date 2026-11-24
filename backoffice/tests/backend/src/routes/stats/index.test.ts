import '../_helpers/registerRouteMocks'

import statsRoutes from '@backend/routes/stats'
import { loadCompanyStats, loadTimeZoneNames } from '@backend/routes/stats/_queries'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { securityState } from '../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'

// L'agrégation SQL se prouve sur PostgreSQL (`stats.pg.test.ts`) : ici, la route seule.
vi.mock('@backend/routes/stats/_queries', () => ({
  loadCompanyStats: vi.fn(),
  loadTimeZoneNames: vi.fn(),
}))

resetRouteMocksBeforeEach()

const NOW = new Date('2026-11-23T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

const STATS = {
  sessions: { finished: 0, aborted: 0, abandonRate: null, medianDurationSeconds: null, byRoom: [] },
  players: {
    total: 0,
    averagePerSession: null,
    withEmail: 0,
    emailRate: null,
    withMarketingConsent: 0,
    marketingConsentRate: null,
    distinctEmails: 0,
    returningEmails: 0,
  },
  busiestSlots: [],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.mocked(loadCompanyStats).mockReset().mockResolvedValue(STATS)
  // Ce que PostgreSQL connaît : « PST8PDT » oui, « US/Pacific-New » non, jamais de décalage brut.
  vi.mocked(loadTimeZoneNames)
    .mockReset()
    .mockResolvedValue(new Set(['utc', 'europe/paris', 'pst8pdt']))
})

afterEach(() => {
  vi.useRealTimers()
})

async function get(url: string, user: TestUser | null = companyAdminUser) {
  const app = await createRouteApp(statsRoutes)

  try {
    return await app.inject({
      method: 'GET',
      url,
      headers: user ? authHeaders(user) : {},
    })
  } finally {
    await app.close()
  }
}

describe('GET /companies/:companyId/stats', () => {
  it('answers 30 days before now, in UTC, when no filter is given', async () => {
    const response = await get('/companies/1/stats')

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toEqual({
      period: {
        from: new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
        to: NOW.toISOString(),
        timeZone: 'UTC',
      },
      ...STATS,
    })
    expect(loadCompanyStats).toHaveBeenCalledWith({
      companyId: 1,
      roomId: undefined,
      from: new Date(NOW.getTime() - 30 * DAY_MS),
      to: NOW,
      timeZone: 'UTC',
    })
  })

  it('passes the period, the room and the time zone to the aggregation', async () => {
    const response = await get(
      '/companies/1/stats?from=2026-03-01T00:00:00%2B01:00&to=2026-04-01T00:00:00%2B02:00&roomId=7&tz=Europe/Paris'
    )

    expect(response.statusCode).toBe(200)
    expect(loadCompanyStats).toHaveBeenCalledWith({
      companyId: 1,
      roomId: 7,
      from: new Date('2026-02-28T23:00:00.000Z'),
      to: new Date('2026-03-31T22:00:00.000Z'),
      timeZone: 'Europe/Paris',
    })
  })

  it('lets a superadmin read any company, and the admin read his own', async () => {
    expect((await get('/companies/1/stats', superadminUser)).statusCode).toBe(200)
    expect((await get('/companies/2/stats', superadminUser)).statusCode).toBe(200)
    expect((await get('/companies/1/stats', companyAdminUser)).statusCode).toBe(200)
  })

  it('refuses an admin of company 1 who asks for company 2, without reading anything', async () => {
    const response = await get('/companies/2/stats')

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })
    expect(loadCompanyStats).not.toHaveBeenCalled()
  })

  it('refuses a role without the stats permission', async () => {
    securityState.hasPermission = false

    const response = await get('/companies/1/stats')

    expect(response.statusCode).toBe(403)
    expect(loadCompanyStats).not.toHaveBeenCalled()
  })

  it('refuses a request without a session', async () => {
    const response = await get('/companies/1/stats', null)

    expect(response.statusCode).toBe(401)
    expect(loadCompanyStats).not.toHaveBeenCalled()
  })

  it.each([
    ['a company id that is not a number', '/companies/abc/stats'],
    ['a company id of zero', '/companies/0/stats'],
    ['a malformed date', '/companies/1/stats?from=hier'],
    ['a date without a time zone offset', '/companies/1/stats?to=2026-03-01T00:00:00'],
    ['the year 0000', '/companies/1/stats?from=0000-01-01T00:00:00Z'],
    [
      'year 0 once the offset is applied',
      '/companies/1/stats?from=0001-01-01T00:00:00%2B14:00&to=0001-06-01T00:00:00Z',
    ],
    ['a room id of zero', '/companies/1/stats?roomId=0'],
    ['a room id that is not a number', '/companies/1/stats?roomId=salle'],
  ])('answers 400 invalid_params for %s', async (_label, url) => {
    const response = await get(url)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'invalid_params' })
    expect(loadCompanyStats).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown name', 'Mars/Olympus'],
    ['a name Intl knows but PostgreSQL does not', 'US/Pacific-New'],
    ['an offset', '+02:00'],
    ['an empty value', ''],
    ['a value that is not a time zone', "Europe/Paris'; drop table games;--"],
  ])('answers 400 stats_timezone_invalid for %s', async (_label, tz) => {
    const response = await get(`/companies/1/stats?tz=${encodeURIComponent(tz)}`)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'stats_timezone_invalid' })
    expect(loadCompanyStats).not.toHaveBeenCalled()
  })

  it.each([
    ['from after to', 'from=2026-04-01T00:00:00Z&to=2026-03-01T00:00:00Z'],
    ['an empty period', 'from=2026-04-01T00:00:00Z&to=2026-04-01T00:00:00Z'],
    ['more than 366 days', 'from=2025-01-01T00:00:00Z&to=2026-03-01T00:00:00Z'],
    ['a start in the future with no end', 'from=2027-01-01T00:00:00Z'],
  ])('answers 400 stats_period_invalid for %s', async (_label, query) => {
    const response = await get(`/companies/1/stats?${query}`)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'stats_period_invalid' })
    expect(loadCompanyStats).not.toHaveBeenCalled()
  })

  it.each(['PST8PDT', 'europe/PARIS', 'Europe/Paris'])(
    'accepts the PostgreSQL time zone %s, whatever its case',
    async (tz) => {
      const response = await get(`/companies/1/stats?tz=${encodeURIComponent(tz)}`)

      expect(response.statusCode).toBe(200)
      expect(loadCompanyStats).toHaveBeenCalledWith(expect.objectContaining({ timeZone: tz }))
    }
  )

  it('accepts exactly 366 days', async () => {
    const response = await get(
      '/companies/1/stats?from=2025-01-01T00:00:00Z&to=2026-01-02T00:00:00Z'
    )

    expect(response.statusCode).toBe(200)
  })
})
