import type { ApiKey, ApiLog, ApiLogStatusClass } from '@quizzup/shared'

/** Codes d'erreur des routes `api-keys` et `api-logs`, plus ceux du client (réseau, JSON). */
export type ApiKeyApiErrorCode =
  | 'missing_token'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'api_unreachable'
  | 'invalid_json'
  | 'invalid_params'
  | 'invalid_body'
  | 'invalid_query'
  | 'api_key_limit_reached'
  | 'company_inactive'
  | 'company_deleted'
  | 'server_error'

export type ApiKeysResponse = { apiKeys: ApiKey[] }

/** Le secret n'est renvoyé que par la création : à ne garder nulle part ailleurs que dans l'écran. */
export type CreateApiKeyResponse = { apiKey: ApiKey; secret: string }

export type ApiKeyResponse = { apiKey: ApiKey }

export type ApiLogsResponse = { logs: ApiLog[]; nextBefore: number | null }

export type ApiLogsQuery = {
  apiKeyId?: number
  statusClass?: ApiLogStatusClass
  before?: number
}

export type ApiKeyApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number | null; error: ApiKeyApiErrorCode }
