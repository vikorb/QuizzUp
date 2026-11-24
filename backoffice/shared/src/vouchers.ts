/**
 * Bons de fidélisation (lot 6b) : statuts, états calculés, code et réglages d'un centre, lus par le
 * back et le front. Le code est une valeur au porteur : il ne circule jamais dans une URL de l'API.
 */

// Statuts en base (convention commune : 0 inactif, 1 actif, 2 supprimé). Un bon inactif est annulé.
export const VOUCHER_STATUS_INACTIVE = 0 as const
export const VOUCHER_STATUS_ACTIVE = 1 as const
export const VOUCHER_STATUS_DELETED = 2 as const

export const VOUCHER_STATUS = {
  INACTIVE: VOUCHER_STATUS_INACTIVE,
  ACTIVE: VOUCHER_STATUS_ACTIVE,
  DELETED: VOUCHER_STATUS_DELETED,
} as const

export const VOUCHER_STATUSES = [
  VOUCHER_STATUS_INACTIVE,
  VOUCHER_STATUS_ACTIVE,
  VOUCHER_STATUS_DELETED,
] as const

export type VoucherStatus = (typeof VOUCHER_STATUSES)[number]

// États calculés (jamais stockés) : le statut, la date d'utilisation et la date de fin de validité.
export const VOUCHER_STATE_VALID = 'valid' as const
export const VOUCHER_STATE_REDEEMED = 'redeemed' as const
export const VOUCHER_STATE_EXPIRED = 'expired' as const
export const VOUCHER_STATE_CANCELLED = 'cancelled' as const

export const VOUCHER_STATES = [
  VOUCHER_STATE_VALID,
  VOUCHER_STATE_REDEEMED,
  VOUCHER_STATE_EXPIRED,
  VOUCHER_STATE_CANCELLED,
] as const

export type VoucherState = (typeof VOUCHER_STATES)[number]

/**
 * État d'un bon à l'instant `now`. Un bon annulé reste annulé même s'il a été utilisé ou s'il est
 * périmé ; un bon utilisé reste utilisé après sa date de fin.
 */
export function getVoucherState(
  voucher: {
    status: number
    redeemedAt: Date | string | null
    expiresAt: Date | string
  },
  now: Date = new Date()
): VoucherState {
  if (voucher.status !== VOUCHER_STATUS_ACTIVE) return VOUCHER_STATE_CANCELLED
  if (voucher.redeemedAt) return VOUCHER_STATE_REDEEMED

  return new Date(voucher.expiresAt).getTime() > now.getTime()
    ? VOUCHER_STATE_VALID
    : VOUCHER_STATE_EXPIRED
}

/** Alphabet de Crockford sans I, L, O ni U : 32 symboles, soit 5 bits par caractère. */
export const VOUCHER_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Caractères utiles du code, sans le tiret : 8 × 5 bits = 40 bits aléatoires. */
export const VOUCHER_CODE_LENGTH = 8

/** Code tel qu'il est stocké et imprimé : `XXXX-XXXX`. */
export const VOUCHER_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/

/**
 * Ramène une saisie à la forme comparable : majuscules, sans espace ni tiret, `O` lu `0`, `I` et
 * `L` lus `1` (les confusions de lecture usuelles, comme le fait Crockford).
 */
export function normalizeVoucherCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}

/** Forme stockée (`XXXX-XXXX`) d'une saisie, ou `null` si elle ne peut pas être un code de bon. */
export function formatVoucherCode(input: string): string | null {
  const normalized = normalizeVoucherCode(input)
  const code = `${normalized.slice(0, 4)}-${normalized.slice(4)}`

  return normalized.length === VOUCHER_CODE_LENGTH && VOUCHER_CODE_PATTERN.test(code) ? code : null
}

/** Réglages d'un centre : libellé du bon (nul = bons désactivés) et durée de validité en jours. */
export const VOUCHER_LABEL_MAX_LENGTH = 120
export const VOUCHER_VALIDITY_MIN_DAYS = 1
export const VOUCHER_VALIDITY_MAX_DAYS = 730
export const VOUCHER_VALIDITY_DEFAULT_DAYS = 90

/** Liste des bons : pagination, `limit` au-delà du plafond ramené au plafond. */
export const VOUCHER_LIST_DEFAULT_LIMIT = 50
export const VOUCHER_LIST_MAX_LIMIT = 200
