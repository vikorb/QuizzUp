import { VOUCHER_STATUS_INACTIVE } from '@quizzup/shared'

import type { ApiRequestOptions } from '@/types/api'
import type {
  GameVouchersResponse,
  VoucherApiErrorCode,
  VoucherApiResult,
  VoucherResponse,
  VouchersQuery,
  VouchersResponse,
} from '@/types/voucher'
import { apiFetch } from '@/utils/api'
import { readVoucherApiError } from '@/utils/voucher/errors'

function getFallbackErrorCode(status: number): VoucherApiErrorCode {
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

async function requestVoucherJson<T>(options: ApiRequestOptions): Promise<VoucherApiResult<T>> {
  const response = await apiFetch({ ...options, authenticated: true })

  if (!response) {
    return { ok: false, status: null, error: 'api_unreachable' }
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)

    return {
      ok: false,
      status: response.status,
      error: readVoucherApiError(payload) ?? getFallbackErrorCode(response.status),
    }
  }

  const json = (await response.json().catch(() => null)) as T | null

  if (json === null) {
    return { ok: false, status: response.status, error: 'invalid_json' }
  }

  return { ok: true, status: response.status, data: json }
}

function postJson(path: string, body: unknown): ApiRequestOptions {
  return {
    path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** Bons d'une partie, du pupitre 1 au dernier. */
export function listGameVouchersService(companyId: number, gameId: number) {
  return requestVoucherJson<GameVouchersResponse>({
    path: `/companies/${companyId}/games/${gameId}/vouchers`,
  })
}

/** Émet le bon d'un pupitre d'une partie terminée. */
export function issueGameVoucherService(companyId: number, gameId: number, participantId: number) {
  return requestVoucherJson<VoucherResponse>(
    postJson(`/companies/${companyId}/games/${gameId}/vouchers`, { participantId })
  )
}

export function listVouchersService(companyId: number, query: VouchersQuery = {}) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const queryString = params.toString()

  return requestVoucherJson<VouchersResponse>({
    path: `/companies/${companyId}/vouchers${queryString ? `?${queryString}` : ''}`,
  })
}

// Le code est une valeur au porteur : il voyage dans le corps, jamais dans l'adresse.
export function lookupVoucherService(companyId: number, code: string) {
  return requestVoucherJson<VoucherResponse>(
    postJson(`/companies/${companyId}/vouchers/lookup`, { code })
  )
}

export function redeemVoucherService(companyId: number, code: string) {
  return requestVoucherJson<VoucherResponse>(
    postJson(`/companies/${companyId}/vouchers/redeem`, { code })
  )
}

export function cancelVoucherService(companyId: number, voucherId: number) {
  return requestVoucherJson<VoucherResponse>({
    path: `/companies/${companyId}/vouchers/${voucherId}/status`,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: VOUCHER_STATUS_INACTIVE }),
  })
}
