import '../_helpers/registerRouteMocks'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAYER_LIST_MAX_LIMIT } from '@quizzup/shared'
import {
  countAnonymousPlayers,
  erasePlayer,
  listMarketingPlayers,
  listPlayers,
  withdrawMarketingConsent,
} from '@backend/routes/players/_queries'
import playersRoutes from '@backend/routes/players'
import { requireApiPermissionMock, securityState } from '../_helpers/mockSecurity'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../_helpers/testApp'
import { otherCompanyAdmin, staffUser } from '../_helpers/vouchers'

// Les requêtes SQL se prouvent sur PostgreSQL (`players.pg.test.ts`) : ici, les routes seules.
vi.mock('@backend/routes/players/_queries', () => ({
  listPlayers: vi.fn(),
  countAnonymousPlayers: vi.fn(),
  listMarketingPlayers: vi.fn(),
  withdrawMarketingConsent: vi.fn(),
  erasePlayer: vi.fn(),
}))

resetRouteMocksBeforeEach()

const LISTED = {
  email: 'jean@exemple.test',
  displayName: 'Jean',
  sessions: 2,
  lastPlayedAt: '2026-11-20T18:30:00.000Z',
  bestScore: 40,
  marketingConsent: true,
}

type ListBody = {
  players: Array<Record<string, unknown>>
  total: number
  anonymousPlayers: number
}

let app: FastifyInstance

beforeEach(async () => {
  vi.mocked(listPlayers)
    .mockReset()
    .mockResolvedValue({ players: [LISTED], total: 1 })
  vi.mocked(countAnonymousPlayers).mockReset().mockResolvedValue(4)
  vi.mocked(listMarketingPlayers).mockReset().mockResolvedValue([])
  vi.mocked(withdrawMarketingConsent).mockReset().mockResolvedValue()
  vi.mocked(erasePlayer).mockReset().mockResolvedValue(1)
  app = await createRouteApp(playersRoutes)
})

afterEach(async () => {
  await app.close()
})

function get(url: string, user: TestUser | null = companyAdminUser) {
  return app.inject({ method: 'GET', url, headers: user ? authHeaders(user) : {} })
}

function post(url: string, body: unknown, user: TestUser | null = companyAdminUser) {
  return app.inject({
    method: 'POST',
    url,
    headers: user ? authHeaders(user) : {},
    payload: body as object,
  })
}

function expectPermission(action: string) {
  expect(requireApiPermissionMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'player',
    action
  )
}

describe('GET /companies/:companyId/players', () => {
  it('lists the players of the company with the count of anonymous players', async () => {
    const response = await get('/companies/1/players')

    expect(response.statusCode).toBe(200)
    expect(parseJson<ListBody>(response)).toEqual({
      players: [LISTED],
      total: 1,
      anonymousPlayers: 4,
    })
    expect(listPlayers).toHaveBeenCalledWith({
      companyId: 1,
      search: undefined,
      limit: 50,
      offset: 0,
    })
    expect(countAnonymousPlayers).toHaveBeenCalledWith(1)
    expectPermission('list')
  })

  it('hides the e-mail from the user role and keeps it for the admin and the superadmin', async () => {
    const asStaff = parseJson<ListBody>(await get('/companies/1/players', staffUser))
    const asAdmin = parseJson<ListBody>(await get('/companies/1/players', companyAdminUser))
    const asSuperadmin = parseJson<ListBody>(await get('/companies/1/players', superadminUser))

    expect(asStaff.players[0]).toEqual({ ...LISTED, email: null })
    expect(asAdmin.players[0]!.email).toBe('jean@exemple.test')
    expect(asSuperadmin.players[0]!.email).toBe('jean@exemple.test')
  })

  it('passes the name search, the page and the cap on the page size to the query', async () => {
    await get('/companies/1/players?search=%20Jea%20&limit=500&offset=20')

    expect(listPlayers).toHaveBeenCalledWith({
      companyId: 1,
      search: 'Jea',
      limit: PLAYER_LIST_MAX_LIMIT,
      offset: 20,
    })
  })

  it('lets a superadmin read any company', async () => {
    expect((await get('/companies/2/players', superadminUser)).statusCode).toBe(200)
    expect(listPlayers).toHaveBeenCalledWith(expect.objectContaining({ companyId: 2 }))
  })

  it('refuses an admin of company 2 who asks for company 1, without reading anything', async () => {
    const response = await get('/companies/1/players', otherCompanyAdmin)

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })
    expect(listPlayers).not.toHaveBeenCalled()
    expect(countAnonymousPlayers).not.toHaveBeenCalled()
  })

  it('refuses a role without the permission and a request without a session', async () => {
    securityState.hasPermission = false
    expect((await get('/companies/1/players')).statusCode).toBe(403)

    securityState.hasPermission = true
    expect((await get('/companies/1/players', null)).statusCode).toBe(401)
    expect(listPlayers).not.toHaveBeenCalled()
  })

  it.each([
    ['a company id that is not a number', '/companies/abc/players'],
    ['a page size of zero', '/companies/1/players?limit=0'],
    ['a negative offset', '/companies/1/players?offset=-1'],
    ['a search longer than a name', `/companies/1/players?search=${'a'.repeat(101)}`],
  ])('answers 400 for %s', async (_label, url) => {
    const response = await get(url)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'invalid_params' })
    expect(listPlayers).not.toHaveBeenCalled()
  })
})

describe('GET /companies/:companyId/players/export.csv', () => {
  it('sends a UTF-8 CSV attachment, never cached, with only the players who accepted the offers', async () => {
    vi.mocked(listMarketingPlayers).mockResolvedValue([
      {
        email: 'jean@exemple.test',
        displayName: 'Jean',
        lastPlayedAt: '2026-11-20T18:30:00.000Z',
        sessions: 2,
        marketingConsentAt: '2026-10-01T10:00:00.000Z',
      },
    ])

    const response = await get('/companies/1/players/export.csv')

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(response.headers['content-disposition']).toContain('attachment')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body).toBe(
      '\uFEFFemail;prenom;derniere_partie;parties;consentement_offres_le\r\n' +
        'jean@exemple.test;Jean;2026-11-20T18:30:00.000Z;2;2026-10-01T10:00:00.000Z\r\n'
    )
    expect(listMarketingPlayers).toHaveBeenCalledWith(1)
    expectPermission('read')
  })

  it('does not let a name that starts like a formula through', async () => {
    vi.mocked(listMarketingPlayers).mockResolvedValue([
      {
        email: 'x@exemple.test',
        displayName: '=HYPERLINK("http://x.test")',
        lastPlayedAt: '2026-11-20T18:30:00.000Z',
        sessions: 1,
        marketingConsentAt: '2026-10-01T10:00:00.000Z',
      },
    ])

    const { body } = await get('/companies/1/players/export.csv')

    expect(body).toContain(`;"'=HYPERLINK(""http://x.test"")";`)
    expect(body).not.toMatch(/;=HYPERLINK/)
  })

  it('refuses an admin of another company, without reading anything', async () => {
    const response = await get('/companies/1/players/export.csv', otherCompanyAdmin)

    expect(response.statusCode).toBe(403)
    expect(listMarketingPlayers).not.toHaveBeenCalled()
  })

  it('refuses a role without the permission and a request without a session', async () => {
    securityState.hasPermission = false
    expect((await get('/companies/1/players/export.csv', staffUser)).statusCode).toBe(403)

    securityState.hasPermission = true
    expect((await get('/companies/1/players/export.csv', null)).statusCode).toBe(401)
    expect(listMarketingPlayers).not.toHaveBeenCalled()
  })

  it('lets a superadmin export any company', async () => {
    expect((await get('/companies/2/players/export.csv', superadminUser)).statusCode).toBe(200)
    expect(listMarketingPlayers).toHaveBeenCalledWith(2)
  })
})

describe('POST /companies/:companyId/players/unsubscribe', () => {
  it('withdraws the consent of the address, with the e-mail from the body', async () => {
    const response = await post('/companies/1/players/unsubscribe', {
      email: '  Jean@Exemple.test ',
    })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toEqual({ ok: true })
    expect(withdrawMarketingConsent).toHaveBeenCalledWith(1, 'Jean@Exemple.test')
    expectPermission('update')
  })

  it('refuses an admin of another company, without writing anything', async () => {
    const response = await post(
      '/companies/1/players/unsubscribe',
      { email: 'jean@exemple.test' },
      otherCompanyAdmin
    )

    expect(response.statusCode).toBe(403)
    expect(withdrawMarketingConsent).not.toHaveBeenCalled()
  })

  it('refuses a role without the permission and a request without a session', async () => {
    securityState.hasPermission = false
    const body = { email: 'jean@exemple.test' }

    expect((await post('/companies/1/players/unsubscribe', body, staffUser)).statusCode).toBe(403)

    securityState.hasPermission = true
    expect((await post('/companies/1/players/unsubscribe', body, null)).statusCode).toBe(401)
    expect(withdrawMarketingConsent).not.toHaveBeenCalled()
  })

  it.each([
    ['no e-mail', {}],
    ['an empty e-mail', { email: '   ' }],
    ['an e-mail that is not text', { email: 3 }],
    ['an unknown field', { email: 'jean@exemple.test', all: true }],
  ])('answers 400 for %s', async (_label, body) => {
    const response = await post('/companies/1/players/unsubscribe', body)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response).error).toBe('invalid_body')
    expect(withdrawMarketingConsent).not.toHaveBeenCalled()
  })

  it('does not read the address from the URL', async () => {
    const response = await post('/companies/1/players/unsubscribe?email=jean@exemple.test', {})

    expect(response.statusCode).toBe(400)
    expect(withdrawMarketingConsent).not.toHaveBeenCalled()
  })
})

describe('POST /companies/:companyId/players/erase', () => {
  it('erases the address and says how many players it covered', async () => {
    vi.mocked(erasePlayer).mockResolvedValue(3)

    const response = await post('/companies/1/players/erase', { email: ' jean@exemple.test ' })

    expect(response.statusCode).toBe(200)
    expect(parseJson(response)).toEqual({ erased: 3 })
    expect(erasePlayer).toHaveBeenCalledWith(1, 'jean@exemple.test')
    expectPermission('delete')
  })

  it('answers 404 player_not_found when the company does not know the address', async () => {
    vi.mocked(erasePlayer).mockResolvedValue(0)

    const response = await post('/companies/1/players/erase', { email: 'inconnu@exemple.test' })

    expect(response.statusCode).toBe(404)
    expect(parseJson(response)).toEqual({ error: 'player_not_found' })
  })

  it('refuses an admin of another company, without erasing anything', async () => {
    const response = await post(
      '/companies/1/players/erase',
      { email: 'jean@exemple.test' },
      otherCompanyAdmin
    )

    expect(response.statusCode).toBe(403)
    expect(erasePlayer).not.toHaveBeenCalled()
  })

  it('lets a superadmin erase in any company, and only in the one in the URL', async () => {
    const response = await post(
      '/companies/2/players/erase',
      { email: 'jean@exemple.test' },
      superadminUser
    )

    expect(response.statusCode).toBe(200)
    expect(erasePlayer).toHaveBeenCalledWith(2, 'jean@exemple.test')
  })

  it('refuses a role without the permission and a request without a session', async () => {
    securityState.hasPermission = false
    const body = { email: 'jean@exemple.test' }

    expect((await post('/companies/1/players/erase', body, staffUser)).statusCode).toBe(403)

    securityState.hasPermission = true
    expect((await post('/companies/1/players/erase', body, null)).statusCode).toBe(401)
    expect(erasePlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['no e-mail', {}],
    ['an empty e-mail', { email: '' }],
    ['an e-mail over 255 characters', { email: `${'a'.repeat(250)}@x.test` }],
  ])('answers 400 for %s', async (_label, body) => {
    const response = await post('/companies/1/players/erase', body)

    expect(response.statusCode).toBe(400)
    expect(erasePlayer).not.toHaveBeenCalled()
  })
})
