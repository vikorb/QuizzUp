import '../../_helpers/registerDbMock'

import companyApiKeyIdRoutes from '@backend/routes/companies/apiKeys/id'
import { API_KEY_STATUS_ACTIVE, API_KEY_STATUS_REVOKED } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { otherCompanyAdmin, seedApiKey, staffUserOfCompany1 } from '../../_helpers/apiKeys'
import { dbState, MOCK_NOW } from '../../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../../_helpers/resetRouteMocks'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
  type TestUser,
} from '../../_helpers/testApp'

resetRouteMocksBeforeEach()

async function revoke(user: TestUser | null, url: string) {
  const app = await createRouteApp(companyApiKeyIdRoutes)
  const response = await app.inject({
    method: 'DELETE',
    url,
    headers: user ? authHeaders(user) : {},
  })

  await app.close()

  return response
}

describe('DELETE /companies/:companyId/api-keys/:apiKeyId', () => {
  it('revokes the key: status 2 and deleted_at set, hash never returned', async () => {
    const key = seedApiKey()

    const response = await revoke(companyAdminUser, '/companies/1/api-keys/1')

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ apiKey: Record<string, unknown> }>(response).apiKey).toMatchObject({
      id: 1,
      status: API_KEY_STATUS_REVOKED,
      revokedAt: MOCK_NOW,
      createdBy: { id: 2, username: 'alice' },
    })
    expect(dbState.api_keys[0]).toMatchObject({
      status: API_KEY_STATUS_REVOKED,
      deleted_at: MOCK_NOW,
    })
    expect(response.body).not.toContain(String(key.key_hash))
  })

  it('is idempotent: revoking again answers 200 and keeps the first revocation date', async () => {
    seedApiKey({ status: API_KEY_STATUS_REVOKED, deleted_at: '2026-11-21T10:00:00.000Z' })

    const response = await revoke(companyAdminUser, '/companies/1/api-keys/1')

    expect(response.statusCode).toBe(200)
    expect(parseJson<{ apiKey: Record<string, unknown> }>(response).apiKey).toMatchObject({
      status: API_KEY_STATUS_REVOKED,
      revokedAt: '2026-11-21T10:00:00.000Z',
    })
    expect(dbState.api_keys[0]?.deleted_at).toBe('2026-11-21T10:00:00.000Z')
  })

  it('lets the superadmin revoke a key of any company', async () => {
    seedApiKey({ company_id: 2 })

    const response = await revoke(superadminUser, '/companies/2/api-keys/1')

    expect(response.statusCode).toBe(200)
    expect(dbState.api_keys[0]?.status).toBe(API_KEY_STATUS_REVOKED)
  })

  it('answers 404 for an unknown key, and for a key of another company (not revoked)', async () => {
    seedApiKey({ company_id: 2 })

    const unknown = await revoke(companyAdminUser, '/companies/1/api-keys/99')
    const foreign = await revoke(companyAdminUser, '/companies/1/api-keys/1')
    const wrongCompany = await revoke(superadminUser, '/companies/1/api-keys/1')

    for (const response of [unknown, foreign, wrongCompany]) {
      expect(response.statusCode).toBe(404)
      expect(parseJson(response)).toEqual({ error: 'not_found' })
    }
    expect(dbState.api_keys[0]?.status).toBe(API_KEY_STATUS_ACTIVE)
  })

  it('refuses an admin of company B on a key of company A (403, key untouched)', async () => {
    seedApiKey()

    const response = await revoke(otherCompanyAdmin, '/companies/1/api-keys/1')

    expect(response.statusCode).toBe(403)
    expect(dbState.api_keys[0]).toMatchObject({ status: API_KEY_STATUS_ACTIVE, deleted_at: null })
  })

  it('refuses the user role (403, key untouched)', async () => {
    seedApiKey()

    const response = await revoke(staffUserOfCompany1, '/companies/1/api-keys/1')

    expect(response.statusCode).toBe(403)
    expect(dbState.api_keys[0]?.status).toBe(API_KEY_STATUS_ACTIVE)
  })

  it('answers 401 without authentication', async () => {
    const response = await revoke(null, '/companies/1/api-keys/1')

    expect(response.statusCode).toBe(401)
  })

  it('answers 400 invalid_params for a bad id', async () => {
    const response = await revoke(companyAdminUser, '/companies/1/api-keys/abc')

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'invalid_params' })
  })
})
