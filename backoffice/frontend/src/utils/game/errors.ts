import type { GameApiErrorCode } from '@/types/game'

const GAME_EMAIL_CONSENT_REQUIRED = 'email_consent_required' as const
const GAME_MARKETING_REQUIRES_EMAIL = 'marketing_consent_requires_email' as const
const GAME_FORMAT_FIXES_COUNTS = 'format_fixes_counts' as const
const GAME_FORMAT_NOT_UPDATABLE = 'format_not_updatable' as const

// Détails de validation (zod) que l'on remonte comme codes d'erreur à part entière.
const GAME_VALIDATION_DETAIL_CODES = [
  GAME_EMAIL_CONSENT_REQUIRED,
  GAME_MARKETING_REQUIRES_EMAIL,
  GAME_FORMAT_FIXES_COUNTS,
  GAME_FORMAT_NOT_UPDATABLE,
] as const

const GAME_API_ERROR_CODES: GameApiErrorCode[] = [
  'missing_token',
  'unauthorized',
  'forbidden',
  'api_unreachable',
  'invalid_json',
  'invalid_body',
  'invalid_params',
  'not_found',
  'room_not_found',
  'room_inactive',
  'room_busy',
  'podium_not_in_room',
  'game_not_pending',
  'podium_taken',
  'room_full',
  'registration_not_found',
  'company_deleted',
  'company_inactive',
  'game_already_over',
  ...GAME_VALIDATION_DETAIL_CODES,
  'conflict',
  'session_in_past',
  'session_too_far',
  'slot_taken',
  'game_not_scheduled',
  'session_not_open_yet',
  'server_error',
]

/** `room_busy` → `roomBusy` : clé i18n (namespace `games.errors`) d'un code d'erreur. */
function toErrorKey(code: GameApiErrorCode): string {
  return code.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

export function isGameApiErrorCode(value: unknown): value is GameApiErrorCode {
  return typeof value === 'string' && GAME_API_ERROR_CODES.includes(value as GameApiErrorCode)
}

/** Cherche une chaîne précise dans un objet de détails (erreurs zod aplaties). */
function containsMessage(value: unknown, message: string): boolean {
  if (typeof value === 'string') {
    return value === message
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsMessage(item, message))
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsMessage(item, message))
  }

  return false
}

/**
 * Lit le code d'erreur d'une réponse de l'API des parties. Un `invalid_body` dont les
 * détails contiennent `email_consent_required` ou `marketing_consent_requires_email` (règles RGPD),
 * `format_fixes_counts` ou `format_not_updatable` (format) est remonté comme tel.
 */
export function readGameApiError(payload: unknown): GameApiErrorCode | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const { error, details } = payload as { error?: unknown; details?: unknown }

  if (error === 'invalid_body') {
    const detail = GAME_VALIDATION_DETAIL_CODES.find((code) => containsMessage(details, code))

    if (detail) {
      return detail
    }
  }

  return isGameApiErrorCode(error) ? error : null
}

export function getGameErrorKey(code: string | null | undefined): string {
  return `games.errors.${toErrorKey(isGameApiErrorCode(code) ? code : 'server_error')}`
}
