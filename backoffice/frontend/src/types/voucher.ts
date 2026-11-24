import type { VoucherState } from '@quizzup/shared'

/** Codes d'erreur de l'API des bons, plus ceux du client (réseau, JSON). */
export type VoucherApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'api_unreachable'
  | 'invalid_json'
  | 'invalid_params'
  | 'invalid_body'
  | 'vouchers_disabled'
  | 'game_not_finished'
  | 'voucher_already_issued'
  | 'participant_not_found'
  | 'voucher_not_found'
  | 'voucher_cancelled'
  | 'voucher_already_redeemed'
  | 'voucher_expired'
  | 'server_error'

/** Bon tel que renvoyé par l'API : l'état est calculé côté serveur, jamais l'e-mail du joueur. */
export type Voucher = {
  id: number
  gameId: number
  participantId: number
  podium: number
  displayName: string
  secondDisplayName: string | null
  code: string
  label: string
  state: VoucherState
  expiresAt: string
  redeemedAt: string | null
  redeemedBy: number | null
  createdAt: string
  /** Adresse de la page publique du bon, nulle tant que `PUBLIC_APP_URL` n'est pas réglée. */
  url: string | null
  /** QR code (SVG complet) de `url`, seulement à l'émission et dans les bons d'une partie ; absent ailleurs. */
  qrSvg?: string | null
}

export type VoucherResponse = { voucher: Voucher }

export type GameVouchersResponse = { vouchers: Voucher[] }

export type VouchersResponse = { vouchers: Voucher[]; total: number }

export type VouchersQuery = {
  state?: VoucherState
  gameId?: number
  limit?: number
  offset?: number
}

export type VoucherApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number | null; error: VoucherApiErrorCode }
