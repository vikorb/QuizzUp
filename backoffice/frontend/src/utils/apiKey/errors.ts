import type { ApiKeyApiErrorCode } from '@/types/apiKey'

const API_KEY_API_ERROR_CODES: ApiKeyApiErrorCode[] = [
  'missing_token',
  'unauthorized',
  'forbidden',
  'not_found',
  'api_unreachable',
  'invalid_json',
  'invalid_params',
  'invalid_body',
  'invalid_query',
  'api_key_limit_reached',
  'company_inactive',
  'company_deleted',
  'server_error',
]

function isApiKeyApiErrorCode(value: unknown): value is ApiKeyApiErrorCode {
  return typeof value === 'string' && API_KEY_API_ERROR_CODES.includes(value as ApiKeyApiErrorCode)
}

/** Code d'erreur d'une réponse des routes de clés d'API, `null` s'il est inconnu. */
export function readApiKeyApiError(payload: unknown): ApiKeyApiErrorCode | null {
  const error = (payload as { error?: unknown } | null)?.error

  return isApiKeyApiErrorCode(error) ? error : null
}

/** `api_key_limit_reached` → `apiKeys.errors.apiKeyLimitReached` ; un code inconnu devient `server_error`. */
export function getApiKeyErrorKey(code: string | null | undefined): string {
  const known = isApiKeyApiErrorCode(code) ? code : 'server_error'

  return `apiKeys.errors.${known.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())}`
}
