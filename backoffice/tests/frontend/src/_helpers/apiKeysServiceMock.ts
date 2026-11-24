import type { ApiKey, ApiLog } from '@quizzup/shared'
import { API_KEY_STATUS_ACTIVE, API_KEY_STATUS_REVOKED } from '@quizzup/shared'
import { vi } from 'vitest'

import type {
  ApiKeyApiResult,
  ApiKeyResponse,
  ApiKeysResponse,
  ApiLogsQuery,
  ApiLogsResponse,
  CreateApiKeyResponse,
} from '@/types/apiKey'

export const API_KEY_SECRET_FIXTURE = 'qzk_3f9a1c07_SECRET_VALUE_THAT_MUST_NOT_LEAK_00000'

export function createApiKeyFixture(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 1,
    name: 'Site de réservation',
    keyPrefix: 'qzk_3f9a1c07',
    status: API_KEY_STATUS_ACTIVE,
    createdAt: '2026-11-03T15:40:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
    createdBy: { id: 2, username: 'alice' },
    ...overrides,
  }
}

export function createRevokedApiKeyFixture(overrides: Partial<ApiKey> = {}): ApiKey {
  return createApiKeyFixture({
    status: API_KEY_STATUS_REVOKED,
    revokedAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  })
}

export function createApiLogFixture(overrides: Partial<ApiLog> = {}): ApiLog {
  return {
    id: 1,
    apiKeyId: 1,
    keyPrefix: 'qzk_3f9a1c07',
    method: 'POST',
    route: '/public/v1/bookings',
    statusCode: 201,
    errorCode: null,
    gameId: null,
    durationMs: 12,
    idempotentReplay: false,
    createdAt: '2026-11-04T09:00:00.000Z',
    ...overrides,
  }
}

/** Réponse que le test libère quand il veut, pour voir l'état « chargement » ou une réponse tardive. */
export function createDeferred<T>() {
  const deferred = {} as { promise: Promise<T>; resolve: (value: T) => void }

  deferred.promise = new Promise<T>((resolve) => {
    deferred.resolve = resolve
  })

  return deferred
}

export function mockApiKeyFailure(
  mock: { mockResolvedValue: (value: never) => unknown },
  error: string,
  status = 409
): void {
  mock.mockResolvedValue({ ok: false, status, error } as never)
}

// Par défaut : aucune clé, aucun appel, et les écritures réussissent.
export const listApiKeysServiceMock = vi.fn(
  async (_companyId: number): Promise<ApiKeyApiResult<ApiKeysResponse>> => ({
    ok: true,
    status: 200,
    data: { apiKeys: [] },
  })
)

export const createApiKeyServiceMock = vi.fn(
  async (_companyId: number, name: string): Promise<ApiKeyApiResult<CreateApiKeyResponse>> => ({
    ok: true,
    status: 201,
    data: { apiKey: createApiKeyFixture({ name }), secret: API_KEY_SECRET_FIXTURE },
  })
)

export const revokeApiKeyServiceMock = vi.fn(
  async (_companyId: number, apiKeyId: number): Promise<ApiKeyApiResult<ApiKeyResponse>> => ({
    ok: true,
    status: 200,
    data: { apiKey: createRevokedApiKeyFixture({ id: apiKeyId }) },
  })
)

export const listApiLogsServiceMock = vi.fn(
  async (_companyId: number, _query?: ApiLogsQuery): Promise<ApiKeyApiResult<ApiLogsResponse>> => ({
    ok: true,
    status: 200,
    data: { logs: [], nextBefore: null },
  })
)

export function resetApiKeysServiceMock(): void {
  for (const mock of [
    listApiKeysServiceMock,
    createApiKeyServiceMock,
    revokeApiKeyServiceMock,
    listApiLogsServiceMock,
  ]) {
    mock.mockReset()
  }

  listApiKeysServiceMock.mockResolvedValue({ ok: true, status: 200, data: { apiKeys: [] } })
  createApiKeyServiceMock.mockImplementation(async (_companyId, name) => ({
    ok: true,
    status: 201,
    data: { apiKey: createApiKeyFixture({ name }), secret: API_KEY_SECRET_FIXTURE },
  }))
  revokeApiKeyServiceMock.mockImplementation(async (_companyId, apiKeyId) => ({
    ok: true,
    status: 200,
    data: { apiKey: createRevokedApiKeyFixture({ id: apiKeyId }) },
  }))
  listApiLogsServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { logs: [], nextBefore: null },
  })
}
