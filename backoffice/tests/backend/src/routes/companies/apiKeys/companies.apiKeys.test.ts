// Permissions et politique de compagnie réelles : seule la base est simulée.
import '../../_helpers/registerDbMock'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  API_KEY_MAX_ACTIVE,
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_STATUS_ACTIVE,
  API_KEY_STATUS_REVOKED,
  COMPANY_STATUS_DELETED,
} from '@quizzup/shared'
import { generateApiKey, hashApiKey } from '@backend/security/apiKeys'
import companyApiKeysRoutes from '@backend/routes/companies/apiKeys'
import { dbState, lockedTables } from '../../_helpers/mockDb'
import { otherCompanyAdmin, seedApiKey, staffUserOfCompany1 } from '../../_helpers/apiKeys'
import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../../_helpers/testApp'

// Le vrai générateur, sauf quand un test veut provoquer une collision de préfixe.
vi.mock('@backend/security/apiKeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@backend/security/apiKeys')>()

  return { ...actual, generateApiKey: vi.fn(actual.generateApiKey) }
})

resetRouteMocksBeforeEach()

const realGenerateApiKey = (
  await vi.importActual<typeof import('@backend/security/apiKeys')>('@backend/security/apiKeys')
).generateApiKey

beforeEach(() => {
  vi.mocked(generateApiKey).mockReset()
  vi.mocked(generateApiKey).mockImplementation(realGenerateApiKey)
})

type ApiKeyBody = Record<string, unknown>

async function request(
  user: TestUser | null,
  method: 'GET' | 'POST',
  url: string,
  payload?: unknown
) {
  const app = await createRouteApp(companyApiKeysRoutes)
  const response = await app.inject({
    method,
    url,
    headers: user ? authHeaders(user) : {},
    payload: payload as never,
  })

  await app.close()

  return response
}

const URL_COMPANY_1 = '/companies/1/api-keys'

describe('GET /companies/:companyId/api-keys', () => {
  it('lists the keys of the company, newest first, revoked ones included, with their creator', async () => {
    seedApiKey({ name: 'Ancienne' })
    seedApiKey({
      name: 'Révoquée',
      status: API_KEY_STATUS_REVOKED,
      deleted_at: '2026-11-21T10:00:00.000Z',
      last_used_at: '2026-11-21T09:00:00.000Z',
      created_by_admin_id: null,
    })

    const response = await request(companyAdminUser, 'GET', URL_COMPANY_1)

    expect(response.statusCode).toBe(200)
    const { apiKeys } = parseJson<{ apiKeys: ApiKeyBody[] }>(response)

    expect(apiKeys.map((key) => key.name)).toEqual(['Révoquée', 'Ancienne'])
    expect(apiKeys[0]).toEqual({
      id: 2,
      name: 'Révoquée',
      keyPrefix: expect.stringMatching(/^qzk_/),
      status: API_KEY_STATUS_REVOKED,
      createdAt: '2026-11-20T10:00:00.000Z',
      lastUsedAt: '2026-11-21T09:00:00.000Z',
      createdBy: null,
    })
    expect(apiKeys[1]).toMatchObject({ createdBy: { id: 2, username: 'alice' }, lastUsedAt: null })
  })

  it('never returns the hash or the secret', async () => {
    const row = seedApiKey()

    const response = await request(companyAdminUser, 'GET', URL_COMPANY_1)

    expect(response.body).not.toContain(String(row.key_hash))
    expect(response.body).not.toMatch(/key_?hash|secret/i)
  })

  it('does not show the keys of another company to its admin', async () => {
    seedApiKey({ name: 'Clé de A' })
    seedApiKey({ name: 'Clé de B', company_id: 2 })

    const asA = await request(companyAdminUser, 'GET', URL_COMPANY_1)
    const asB = await request(otherCompanyAdmin, 'GET', '/companies/2/api-keys')

    expect(parseJson<{ apiKeys: ApiKeyBody[] }>(asA).apiKeys.map((k) => k.name)).toEqual([
      'Clé de A',
    ])
    expect(parseJson<{ apiKeys: ApiKeyBody[] }>(asB).apiKeys.map((k) => k.name)).toEqual([
      'Clé de B',
    ])
  })

  it('refuses an admin of company B on company A (403, nothing leaked)', async () => {
    seedApiKey({ name: 'Clé de A' })

    const response = await request(otherCompanyAdmin, 'GET', URL_COMPANY_1)

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })
  })

  it('lets the superadmin read any company', async () => {
    seedApiKey({ name: 'Clé de B', company_id: 2 })

    const response = await request(superadminUser, 'GET', '/companies/2/api-keys')

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ apiKeys: ApiKeyBody[] }>(response).apiKeys).toHaveLength(1)
  })

  it('refuses the user role (403)', async () => {
    const response = await request(staffUserOfCompany1, 'GET', URL_COMPANY_1)

    expect(response.statusCode).toBe(403)
  })

  it('answers 401 without authentication', async () => {
    const response = await request(null, 'GET', URL_COMPANY_1)

    expect(response.statusCode).toBe(401)
  })

  it('answers 400 invalid_params for a bad company id and 404 for an unknown company', async () => {
    const invalid = await request(superadminUser, 'GET', '/companies/abc/api-keys')
    const unknown = await request(superadminUser, 'GET', '/companies/99/api-keys')

    expect(invalid.statusCode).toBe(400)
    expect(parseJson(invalid)).toEqual({ error: 'invalid_params' })
    expect(unknown.statusCode).toBe(404)
    expect(parseJson(unknown)).toEqual({ error: 'not_found' })
  })
})

describe('POST /companies/:companyId/api-keys', () => {
  it('creates a key and returns the secret once, never stored in clear', async () => {
    const response = await request(companyAdminUser, 'POST', URL_COMPANY_1, {
      name: '  Site web du centre  ',
    })

    expect(response.statusCode).toBe(201)
    expect(response.headers['cache-control']).toBe('no-store')

    const { apiKey, secret } = parseJson<{ apiKey: ApiKeyBody; secret: string }>(response)

    expect(secret).toMatch(/^qzk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/)
    expect(apiKey).toEqual({
      id: 1,
      name: 'Site web du centre',
      keyPrefix: secret.slice(0, 12),
      status: API_KEY_STATUS_ACTIVE,
      createdAt: expect.any(String),
      lastUsedAt: null,
      createdBy: { id: 2, username: 'alice' },
    })

    // En base : l'empreinte du jeton, pas le jeton.
    expect(dbState.api_keys).toHaveLength(1)
    expect(dbState.api_keys[0]).toMatchObject({
      company_id: 1,
      key_prefix: secret.slice(0, 12),
      key_hash: hashApiKey(secret),
      created_by_admin_id: 2,
      status: API_KEY_STATUS_ACTIVE,
      deleted_at: null,
    })
    expect(JSON.stringify(dbState.api_keys)).not.toContain(secret)
    expect(response.body).not.toContain(hashApiKey(secret))
  })

  it('does not return the secret again when the keys are listed', async () => {
    const created = await request(companyAdminUser, 'POST', URL_COMPANY_1, { name: 'Une clé' })
    const { secret } = parseJson<{ secret: string }>(created)

    const listed = await request(companyAdminUser, 'GET', URL_COMPANY_1)

    expect(listed.body).not.toContain(secret)
    expect(listed.body).not.toContain(secret.slice(13))
  })

  it('locks the company row before counting the active keys', async () => {
    await request(companyAdminUser, 'POST', URL_COMPANY_1, { name: 'Une clé' })

    expect(lockedTables).toContain('companies')
  })

  it('lets the superadmin create a key for an active company', async () => {
    const response = await request(superadminUser, 'POST', URL_COMPANY_1, { name: 'Support' })

    expect(response.statusCode).toBe(201)
    expect(parseJson<{ apiKey: ApiKeyBody }>(response).apiKey.createdBy).toEqual({
      id: 1,
      username: 'root',
    })
  })

  it('answers 409 api_key_limit_reached at the maximum of active keys', async () => {
    for (let index = 0; index < API_KEY_MAX_ACTIVE; index += 1) {
      seedApiKey()
    }

    const response = await request(companyAdminUser, 'POST', URL_COMPANY_1, { name: 'Onzième' })

    expect(response.statusCode).toBe(409)
    expect(parseJson(response)).toEqual({ error: 'api_key_limit_reached' })
    expect(dbState.api_keys).toHaveLength(API_KEY_MAX_ACTIVE)
  })

  it('counts neither the revoked keys nor the keys of other companies', async () => {
    for (let index = 0; index < API_KEY_MAX_ACTIVE; index += 1) {
      seedApiKey({ company_id: 2 })
    }
    for (let index = 0; index < API_KEY_MAX_ACTIVE; index += 1) {
      seedApiKey({ status: API_KEY_STATUS_REVOKED, deleted_at: '2026-11-21T10:00:00.000Z' })
    }

    const response = await request(companyAdminUser, 'POST', URL_COMPANY_1, { name: 'Libre' })

    expect(response.statusCode).toBe(201)
  })

  it('retries with a new draw when the prefix is already taken', async () => {
    const taken = realGenerateApiKey()
    seedApiKey({ key_prefix: taken.prefix, key_hash: taken.hash, company_id: 2 })
    vi.mocked(generateApiKey).mockReturnValueOnce({ ...realGenerateApiKey(), prefix: taken.prefix })

    const response = await request(companyAdminUser, 'POST', URL_COMPANY_1, { name: 'Retirage' })

    expect(response.statusCode).toBe(201)
    expect(generateApiKey).toHaveBeenCalledTimes(2)
    expect(parseJson<{ secret: string }>(response).secret.slice(0, 12)).not.toBe(taken.prefix)
    expect(dbState.api_keys).toHaveLength(2)
  })

  it('gives up with a 500 after repeated collisions, without storing anything', async () => {
    const taken = realGenerateApiKey()
    seedApiKey({ key_prefix: taken.prefix, key_hash: taken.hash, company_id: 2 })
    vi.mocked(generateApiKey).mockImplementation(() => ({
      ...realGenerateApiKey(),
      prefix: taken.prefix,
    }))

    const response = await request(companyAdminUser, 'POST', URL_COMPANY_1, { name: 'Perdu' })

    expect(response.statusCode).toBe(500)
    expect(dbState.api_keys).toHaveLength(1)
  })

  it.each([
    ['missing name', {}],
    ['empty name', { name: '   ' }],
    ['too long name', { name: 'x'.repeat(API_KEY_NAME_MAX_LENGTH + 1) }],
    ['non-string name', { name: 42 }],
  ])('answers 400 invalid_body for %s', async (_label, payload) => {
    const response = await request(companyAdminUser, 'POST', URL_COMPANY_1, payload)

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toMatchObject({ error: 'invalid_body' })
    expect(dbState.api_keys).toHaveLength(0)
  })

  it('answers 400 invalid_params for a bad company id', async () => {
    const response = await request(superadminUser, 'POST', '/companies/0/api-keys', { name: 'x' })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'invalid_params' })
  })

  it('refuses an admin of company B on company A (403, nothing created)', async () => {
    const response = await request(otherCompanyAdmin, 'POST', URL_COMPANY_1, { name: 'Intrus' })

    expect(response.statusCode).toBe(403)
    expect(dbState.api_keys).toHaveLength(0)
  })

  it('refuses the user role (403, nothing created)', async () => {
    const response = await request(staffUserOfCompany1, 'POST', URL_COMPANY_1, { name: 'Staff' })

    expect(response.statusCode).toBe(403)
    expect(dbState.api_keys).toHaveLength(0)
  })

  it('answers 401 without authentication', async () => {
    const response = await request(null, 'POST', URL_COMPANY_1, { name: 'Anonyme' })

    expect(response.statusCode).toBe(401)
  })

  it('answers 404 for an unknown company, 409 company_inactive and 409 company_deleted', async () => {
    dbState.companies.push({
      id: 3,
      name: 'Supprimée',
      email: 'c3@quizzup.test',
      status: COMPANY_STATUS_DELETED,
    })

    const unknown = await request(superadminUser, 'POST', '/companies/99/api-keys', { name: 'x' })
    const inactive = await request(superadminUser, 'POST', '/companies/2/api-keys', { name: 'x' })
    const deleted = await request(superadminUser, 'POST', '/companies/3/api-keys', { name: 'x' })

    expect([unknown.statusCode, parseJson(unknown)]).toEqual([404, { error: 'not_found' }])
    expect([inactive.statusCode, parseJson(inactive)]).toEqual([409, { error: 'company_inactive' }])
    expect([deleted.statusCode, parseJson(deleted)]).toEqual([409, { error: 'company_deleted' }])
    expect(dbState.api_keys).toHaveLength(0)
  })
})
