import type { VoucherState } from '@quizzup/shared'

import { getApiBase } from '@/utils/auth'

export type PublicVoucher = {
  label: string
  companyName: string
  logoUrl: string | null
  expiresAt: string
  state: VoucherState
}

type VoucherFailure =
  | { ok: false; reason: 'not_found' | 'network' | 'server' }
  | { ok: false; reason: 'too_many_requests'; retryAfterSeconds: number }

type VoucherResult = { ok: true; data: PublicVoucher } | VoucherFailure

const DEFAULT_RETRY_AFTER_SECONDS = 60

// Le code est une valeur au porteur : il voyage dans le corps, jamais dans l'adresse.
export async function lookupVoucher(code: string): Promise<VoucherResult> {
  let response: Response

  try {
    response = await fetch(`${getApiBase()}/public/v1/vouchers/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
  } catch {
    return { ok: false, reason: 'network' }
  }

  const payload = (await response.json().catch(() => null)) as
    (Partial<PublicVoucher> & { error?: unknown }) | null

  if (response.ok && payload) {
    const data = payload as PublicVoucher

    // L'API renvoie un chemin : le logo est servi par l'API, pas par l'origine de la page.
    return {
      ok: true,
      data: data.logoUrl?.startsWith('/')
        ? { ...data, logoUrl: `${getApiBase()}${data.logoUrl}` }
        : data,
    }
  }

  if (response.status === 429 || payload?.error === 'too_many_requests') {
    const retryAfter = Number(response.headers.get('Retry-After'))

    return {
      ok: false,
      reason: 'too_many_requests',
      retryAfterSeconds: retryAfter > 0 ? Math.ceil(retryAfter) : DEFAULT_RETRY_AFTER_SECONDS,
    }
  }

  // Un code mal formé (`invalid_body`) ne peut pas être un bon : même écran qu'un code inconnu.
  if (payload?.error === 'voucher_not_found' || payload?.error === 'invalid_body') {
    return { ok: false, reason: 'not_found' }
  }

  return { ok: false, reason: 'server' }
}
