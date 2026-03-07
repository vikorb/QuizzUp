import { token } from '@/state/authState'
import type { ApiRequestOptions, ApiResult } from '@/types/api'
import { getApiBase } from '@/utils/auth'

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
    if (response.status === 401) {
      return { ok: false, status: response.status, error: 'unauthorized' }
    }

    if (response.status === 403) {
      return { ok: false, status: response.status, error: 'forbidden' }
    }

    return { ok: false, status: response.status, error: 'server_error' }
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
