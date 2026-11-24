import type { VoucherApiErrorCode } from '@/types/voucher'

const VOUCHER_API_ERROR_CODES: VoucherApiErrorCode[] = [
  'unauthorized',
  'forbidden',
  'not_found',
  'api_unreachable',
  'invalid_json',
  'invalid_params',
  'invalid_body',
  'vouchers_disabled',
  'game_not_finished',
  'voucher_already_issued',
  'participant_not_found',
  'voucher_not_found',
  'voucher_cancelled',
  'voucher_already_redeemed',
  'voucher_expired',
  'server_error',
]

function isVoucherApiErrorCode(value: unknown): value is VoucherApiErrorCode {
  return typeof value === 'string' && VOUCHER_API_ERROR_CODES.includes(value as VoucherApiErrorCode)
}

/** Code d'erreur d'une réponse de l'API des bons, `null` s'il est inconnu. */
export function readVoucherApiError(payload: unknown): VoucherApiErrorCode | null {
  const error = (payload as { error?: unknown } | null)?.error

  return isVoucherApiErrorCode(error) ? error : null
}

/** `voucher_expired` → `vouchers.errors.voucherExpired` : clé i18n d'un code d'erreur. */
export function getVoucherErrorKey(code: string | null | undefined): string {
  const known = isVoucherApiErrorCode(code) ? code : 'server_error'

  return `vouchers.errors.${known.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())}`
}
