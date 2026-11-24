import '../_helpers/registerDbMock'

import { describe, expect, it } from 'vitest'

import { API_LOG_LIST_MAX_LIMIT } from '@quizzup/shared'
import companyApiLogsRoutes from '@backend/routes/companies/apiLogs'
import { dbState } from '../_helpers/mockDb'
import { otherCompanyAdmin, seedApiKey, staffUserOfCompany1 } from '../_helpers/apiKeys'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'

resetRouteMocksBeforeEach()

type LogsBody = { logs: Array<Record<string, unknown>>; nextBefore: number | null }

function seedLog(overrides: Record<string, unknown> = {}) {
  dbState.api_request_logs.push({
    id: dbState.api_request_logs.length + 1,
    company_id: 1,
    api_key_id: 1,
    method: 'POST',
    route: '/public/v1/bookings',
    status_code: 201,
    error_code: null,
    game_id: 7,
    duration_ms: 12,
    idempotent_replay: false,
    created_at: '2026-11-20T10:00:00.000Z',
    ...overrides,
  })
}

async function get(user: TestUser | null, url: string) {
  const app = await createRouteApp(companyApiLogsRoutes)
  const response = await app.inject({ method: 'GET', url, headers: user ? authHeaders(user) : {} })

  await app.close()

  return response
}

const URL_COMPANY_1 = '/companies/1/api-logs'

describe('GET /companies/:companyId/api-logs', () => {
  it('lists the calls newest first, in the public shape, with the key prefix', async () => {
    const key = seedApiKey()
    seedLog({ route: '/public/v1/rooms', method: 'GET', game_id: null })
    seedLog({ status_code: 409, error_code: 'slot_taken', idempotent_replay: true })

    const response = await get(companyAdminUser, URL_COMPANY_1)

    expect(response.statusCode).toBe(200)
    const { logs, nextBefore } = parseJson<LogsBody>(response)

    expect(nextBefore).toBeNull()
    expect(logs).toHaveLength(2)
    expect(logs[0]).toEqual({
      id: 2,
      apiKeyId: 1,
      keyPrefix: key.key_prefix,
      method: 'POST',
      route: '/public/v1/bookings',
      statusCode: 409,
      errorCode: 'slot_taken',
      gameId: 7,
      durationMs: 12,
      idempotentReplay: true,
      createdAt: '2026-11-20T10:00:00.000Z',
    })
    expect(logs[1]).toMatchObject({ id: 1, errorCode: null, gameId: null, method: 'GET' })
  })

  it('answers an empty page without logs', async () => {
    const response = await get(companyAdminUser, URL_COMPANY_1)

    expect(parseJson<LogsBody>(response)).toEqual({ logs: [], nextBefore: null })
  })

  it('paginates by cursor on the id', async () => {
    seedApiKey()
    for (let index = 0; index < 5; index += 1) {
      seedLog()
    }

    const first = parseJson<LogsBody>(await get(companyAdminUser, `${URL_COMPANY_1}?limit=2`))
    const second = parseJson<LogsBody>(
      await get(companyAdminUser, `${URL_COMPANY_1}?limit=2&before=${first.nextBefore}`)
    )
    const last = parseJson<LogsBody>(
      await get(companyAdminUser, `${URL_COMPANY_1}?limit=2&before=${second.nextBefore}`)
    )

    expect(first.logs.map((log) => log.id)).toEqual([5, 4])
    expect(first.nextBefore).toBe(4)
    expect(second.logs.map((log) => log.id)).toEqual([3, 2])
    expect(second.nextBefore).toBe(2)
    expect(last.logs.map((log) => log.id)).toEqual([1])
    expect(last.nextBefore).toBeNull()
  })

  it('caps the page at the maximum size', async () => {
    seedApiKey()
    for (let index = 0; index < API_LOG_LIST_MAX_LIMIT + 5; index += 1) {
      seedLog()
    }

    const body = parseJson<LogsBody>(await get(companyAdminUser, `${URL_COMPANY_1}?limit=1000`))

    expect(body.logs).toHaveLength(API_LOG_LIST_MAX_LIMIT)
    expect(body.nextBefore).toBe(body.logs.at(-1)?.id)
  })

  it('filters by key and by status class', async () => {
    seedApiKey()
    seedApiKey()
    seedLog({ api_key_id: 1, status_code: 201 })
    seedLog({ api_key_id: 2, status_code: 404 })
    seedLog({ api_key_id: 2, status_code: 499 })
    seedLog({ api_key_id: 2, status_code: 500 })
    seedLog({ api_key_id: 1, status_code: 200 })

    const ids = async (query: string) =>
      parseJson<LogsBody>(await get(companyAdminUser, `${URL_COMPANY_1}?${query}`)).logs.map(
        (log) => log.id
      )

    expect(await ids('apiKeyId=2')).toEqual([4, 3, 2])
    expect(await ids('statusClass=2xx')).toEqual([5, 1])
    expect(await ids('statusClass=4xx')).toEqual([3, 2])
    expect(await ids('statusClass=5xx')).toEqual([4])
    expect(await ids('apiKeyId=2&statusClass=4xx')).toEqual([3, 2])
  })

  it.each(['statusClass=3xx', 'limit=0', 'before=abc', 'apiKeyId=-1'])(
    'answers 400 invalid_query for %s',
    async (query) => {
      const response = await get(companyAdminUser, `${URL_COMPANY_1}?${query}`)

      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toMatchObject({ error: 'invalid_query' })
    }
  )

  it('shows each company its own calls only', async () => {
    seedApiKey({ company_id: 1 })
    seedApiKey({ company_id: 2 })
    seedLog({ company_id: 1, api_key_id: 1, route: '/public/v1/rooms' })
    seedLog({ company_id: 2, api_key_id: 2, route: '/public/v1/availability' })

    const asA = parseJson<LogsBody>(await get(companyAdminUser, URL_COMPANY_1))
    const asB = parseJson<LogsBody>(await get(otherCompanyAdmin, '/companies/2/api-logs'))

    expect(asA.logs.map((log) => log.route)).toEqual(['/public/v1/rooms'])
    expect(asB.logs.map((log) => log.route)).toEqual(['/public/v1/availability'])
  })

  it('does not leak the logs of another company through the key filter', async () => {
    seedApiKey({ company_id: 2 })
    seedLog({ company_id: 2, api_key_id: 1 })

    const response = await get(companyAdminUser, `${URL_COMPANY_1}?apiKeyId=1`)

    expect(parseJson<LogsBody>(response).logs).toEqual([])
  })

  it('refuses an admin of company B on company A (403)', async () => {
    seedApiKey()
    seedLog()

    const response = await get(otherCompanyAdmin, URL_COMPANY_1)

    expect(response.statusCode).toBe(403)
    expect(response.body).not.toContain('/public/v1')
  })

  it('lets the superadmin read any company', async () => {
    seedApiKey({ company_id: 2 })
    seedLog({ company_id: 2, api_key_id: 1 })

    const response = await get(superadminUser, '/companies/2/api-logs')

    expect(parseJson<LogsBody>(response).logs).toHaveLength(1)
  })

  it('refuses the user role (403) and anonymous calls (401)', async () => {
    expect((await get(staffUserOfCompany1, URL_COMPANY_1)).statusCode).toBe(403)
    expect((await get(null, URL_COMPANY_1)).statusCode).toBe(401)
  })

  it('answers 400 invalid_params for a bad company id and 404 for an unknown company', async () => {
    const invalid = await get(superadminUser, '/companies/abc/api-logs')
    const unknown = await get(superadminUser, '/companies/99/api-logs')

    expect(parseJson(invalid)).toEqual({ error: 'invalid_params' })
    expect([unknown.statusCode, parseJson(unknown)]).toEqual([404, { error: 'not_found' }])
  })
})
