import type { ApiRequestOptions } from '@/types/api'
import type {
  ApiKeyApiErrorCode,
  ApiKeyApiResult,
  ApiKeyResponse,
  ApiKeysResponse,
  ApiLogsQuery,
  ApiLogsResponse,
  CreateApiKeyResponse,
} from '@/types/apiKey'
import { apiFetch } from '@/utils/api'
import { readApiKeyApiError } from '@/utils/apiKey/errors'

function getFallbackErrorCode(status: number): ApiKeyApiErrorCode {
  if (status === 401) {
    return 'unauthorized'
  }

  if (status === 403) {
    return 'forbidden'
  }

  if (status === 404) {
    return 'not_found'
  }

  if (status === 400) {
    return 'invalid_body'
  }

  return 'server_error'
}

// `apiRequestJson` écarte les codes qu'il ne connaît pas (`api_key_limit_reached`) : comme les bons,
// on lit le code du serveur ici.
async function requestApiKeyJson<T>(options: ApiRequestOptions): Promise<ApiKeyApiResult<T>> {
  const response = await apiFetch({ ...options, authenticated: true })

  if (!response) {
    return { ok: false, status: null, error: 'api_unreachable' }
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)

    return {
      ok: false,
      status: response.status,
      error: readApiKeyApiError(payload) ?? getFallbackErrorCode(response.status),
    }
  }

  const json = (await response.json().catch(() => null)) as T | null

  if (json === null) {
    return { ok: false, status: response.status, error: 'invalid_json' }
  }

  return { ok: true, status: response.status, data: json }
}

export function listApiKeysService(companyId: number) {
  return requestApiKeyJson<ApiKeysResponse>({ path: `/companies/${companyId}/api-keys` })
}

/** Le secret de la réponse ne sert qu'à l'affichage unique : l'appelant ne le garde pas. */
export function createApiKeyService(companyId: number, name: string) {
  return requestApiKeyJson<CreateApiKeyResponse>({
    path: `/companies/${companyId}/api-keys`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function revokeApiKeyService(companyId: number, apiKeyId: number) {
  return requestApiKeyJson<ApiKeyResponse>({
    path: `/companies/${companyId}/api-keys/${apiKeyId}`,
    method: 'DELETE',
  })
}

export function listApiLogsService(companyId: number, query: ApiLogsQuery = {}) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const queryString = params.toString()

  return requestApiKeyJson<ApiLogsResponse>({
    path: `/companies/${companyId}/api-logs${queryString ? `?${queryString}` : ''}`,
  })
}
