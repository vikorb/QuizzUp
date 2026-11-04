import type { GameApiErrorCode } from '@/types/game'

const GAME_EMAIL_CONSENT_REQUIRED = 'email_consent_required' as const

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
  'company_deleted',
  'company_inactive',
  'game_already_over',
  GAME_EMAIL_CONSENT_REQUIRED,
  'conflict',
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
 * détails contiennent `email_consent_required` est remonté comme tel (règle RGPD).
 */
export function readGameApiError(payload: unknown): GameApiErrorCode | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const { error, details } = payload as { error?: unknown; details?: unknown }

  if (error === 'invalid_body' && containsMessage(details, GAME_EMAIL_CONSENT_REQUIRED)) {
    return GAME_EMAIL_CONSENT_REQUIRED
  }

  return isGameApiErrorCode(error) ? error : null
}

export function getGameErrorKey(code: string | null | undefined): string {
  return `games.errors.${toErrorKey(isGameApiErrorCode(code) ? code : 'server_error')}`
}
