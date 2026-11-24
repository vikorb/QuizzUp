import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiKeysService from '@/services/apiKeysService'

const apiFetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/api', () => ({
  apiFetch: apiFetchMock,
}))

// Le service est moqué globalement pour les composants : ici on teste le vrai module.
const service = await vi.importActual<typeof ApiKeysService>('@/services/apiKeysService')

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('services/apiKeysService', () => {
  it('lists the keys of the company', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { apiKeys: [] }))

    const result = await service.listApiKeysService(7)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/api-keys',
      authenticated: true,
    })
    expect(result).toEqual({ ok: true, status: 200, data: { apiKeys: [] } })
  })

  it('creates a key with the name in the body, never in the address', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(201, { apiKey: { id: 1 }, secret: 'qzk_x' }))

    const result = await service.createApiKeyService(7, 'Site')

    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/companies/7/api-keys',
      method: 'POST',
      authenticated: true,
      body: JSON.stringify({ name: 'Site' }),
    })
    expect(result.ok && result.data.secret).toBe('qzk_x')
  })

  it('revokes a key with a DELETE', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { apiKey: { id: 3 } }))

    await service.revokeApiKeyService(7, 3)

    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/companies/7/api-keys/3',
      method: 'DELETE',
      authenticated: true,
    })
  })

  it('sends the filters of the log and skips the empty ones', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { logs: [], nextBefore: null }))

    await service.listApiLogsService(7, { apiKeyId: 3, statusClass: '4xx', before: undefined })

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/companies/7/api-logs?apiKeyId=3&statusClass=4xx',
      authenticated: true,
    })

    apiFetchMock.mockResolvedValue(jsonResponse(200, { logs: [], nextBefore: null }))
    await service.listApiLogsService(7)

    expect(apiFetchMock.mock.calls[1]?.[0]).toEqual({
      path: '/companies/7/api-logs',
      authenticated: true,
    })
  })

  it('reads the error code of the server', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(409, { error: 'api_key_limit_reached' }))

    expect(await service.createApiKeyService(7, 'Site')).toEqual({
      ok: false,
      status: 409,
      error: 'api_key_limit_reached',
    })
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [400, 'invalid_body'],
    [500, 'server_error'],
  ])('falls back on a code for a %s without a known code', async (status, error) => {
    apiFetchMock.mockResolvedValue(jsonResponse(status, { error: 'something_new' }))

    expect(await service.listApiKeysService(7)).toEqual({ ok: false, status, error })
  })

  it('reports an unreachable server and an unreadable answer', async () => {
    apiFetchMock.mockResolvedValue(null)

    expect(await service.listApiKeysService(7)).toEqual({
      ok: false,
      status: null,
      error: 'api_unreachable',
    })

    apiFetchMock.mockResolvedValue(new Response('not json', { status: 200 }))

    expect(await service.listApiKeysService(7)).toEqual({
      ok: false,
      status: 200,
      error: 'invalid_json',
    })
  })
})
