import { token } from '@/state/authState'
import type { ApiErrorCode, ApiErrorPayload, ApiRequestOptions, ApiResult } from '@/types/api'
import { getApiBase } from '@/utils/auth'

const API_ERROR_CODES: ApiErrorCode[] = [
  'missing_token',
  'unauthorized',
  'forbidden',
  'api_unreachable',
  'invalid_json',
  'invalid_body',
  'email_already_exists',
  'name_already_exists',
  'conflict',
  'server_error',
]

function isApiErrorCode(value: string): value is ApiErrorCode {
  return API_ERROR_CODES.includes(value as ApiErrorCode)
}

function buildHeaders(inputHeaders?: HeadersInit, authenticated?: boolean): Headers {
  const headers = new Headers(inputHeaders)

  if (authenticated) {
    const authToken = token.value
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`)
    }
  }

  return headers
}

export function getApiErrorKey(code: string, namespace = 'common.errors'): string {
  switch (code) {
    case 'missing_token':
      return `${namespace}.missingToken`
    case 'unauthorized':
      return `${namespace}.unauthorized`
    case 'forbidden':
      return `${namespace}.forbidden`
    case 'api_unreachable':
      return `${namespace}.apiUnreachable`
    case 'invalid_json':
      return `${namespace}.invalidJson`
    case 'invalid_body':
      return `${namespace}.invalidBody`
    case 'invalid_email':
      return `${namespace}.invalidEmail`
    case 'email_already_exists':
      return `${namespace}.emailAlreadyExists`
    case 'name_already_exists':
      return `${namespace}.nameAlreadyExists`
    case 'conflict':
      return `${namespace}.conflict`
    default:
      return `${namespace}.serverError`
  }
}

export async function apiFetch(options: ApiRequestOptions): Promise<Response | null> {
  const {
    path,
    method = 'GET',
    body = null,
    headers: inputHeaders,
    authenticated = false,
    credentials = 'include',
  } = options

  if (authenticated && !token.value) {
    return null
  }

  const headers = buildHeaders(inputHeaders, authenticated)

  try {
    return await fetch(`${getApiBase()}${path}`, {
      method,
      headers,
      body,
      credentials,
    })
  } catch {
    return null
  }
}

async function readErrorCode(response: Response): Promise<ApiErrorCode | null> {
  const data = (await response.json().catch(() => null)) as ApiErrorPayload | null

  if (!data) {
    return null
  }

  if (typeof data.error === 'string' && isApiErrorCode(data.error)) {
    return data.error
  }

  if (typeof data.code === 'string' && isApiErrorCode(data.code)) {
    return data.code
  }

  return null
}

export async function apiRequestJson<T>(options: ApiRequestOptions): Promise<ApiResult<T>> {
  if (options.authenticated && !token.value) {
    return {
      ok: false,
      status: null,
      error: 'missing_token',
    }
  }

  const response = await apiFetch(options)

  if (!response) {
    return {
      ok: false,
      status: null,
      error: 'api_unreachable',
    }
  }

  if (!response.ok) {
    const apiError = await readErrorCode(response)

    if (response.status === 401) {
      return {
        ok: false,
        status: response.status,
        error: apiError ?? 'unauthorized',
      }
    }

    if (response.status === 403) {
      return {
        ok: false,
        status: response.status,
        error: apiError ?? 'forbidden',
      }
    }

    if (response.status === 409) {
      return {
        ok: false,
        status: response.status,
        error: apiError ?? 'conflict',
      }
    }

    if (response.status === 400) {
      return {
        ok: false,
        status: response.status,
        error: apiError ?? 'invalid_body',
      }
    }

    return {
      ok: false,
      status: response.status,
      error: apiError ?? 'server_error',
    }
  }

  const json = (await response.json().catch(() => null)) as T | null

  if (json === null) {
    return {
      ok: false,
      status: response.status,
      error: 'invalid_json',
    }
  }

  return {
    ok: true,
    status: response.status,
    data: json,
  }
}
