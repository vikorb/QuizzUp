import { TOTP_CODE_LENGTH } from '@quizzup/shared'

import type { MfaFailure } from '@/types/auth'

/** Texte à afficher : clé i18n et paramètres. Jamais le message du serveur. */
export type MfaMessage = { key: string; params: Record<string, number> }

/** Code attendu à 6 chiffres (confirmation d'enrôlement) : même texte pour le contrôle local et le 400. */
export const INVALID_CODE_MESSAGE: MfaMessage = {
  key: 'login.mfa.invalidCode',
  params: { length: TOTP_CODE_LENGTH },
}

function mfaErrorKey(reason: Exclude<MfaFailure['reason'], 'invalid_form'>): string {
  switch (reason) {
    case 'totp_invalid':
      return 'errors.totp_invalid'
    case 'mfa_challenge_invalid':
      return 'errors.mfa_challenge_invalid'
    case 'too_many_attempts':
      return 'errors.too_many_attempts'
    case 'too_many_requests':
      return 'auth.errors.tooManyRequests'
    case 'totp_unavailable':
      return 'errors.totp_unavailable'
    case 'totp_not_enrolled':
      return 'errors.totp_not_enrolled'
    case 'totp_already_enrolled':
      return 'errors.totp_already_enrolled'
    case 'totp_enrollment_changed':
      return 'login.mfa.enrollmentChanged'
    case 'forbidden':
      return 'login.mfa.forbidden'
    case 'server_error':
      return 'errors.server_error'
    default: // api_unreachable
      return 'login.mfa.unreachable'
  }
}

/** Blocage ou limite de débit : le délai du serveur (`Retry-After`) remplace « quelques minutes ». */
export function mfaFailureMessage(failure: MfaFailure): MfaMessage {
  if (failure.retryAfterSeconds) {
    return {
      key: 'login.mfa.retryIn',
      params: { minutes: Math.ceil(failure.retryAfterSeconds / 60) },
    }
  }

  // Hors confirmation d'enrôlement, le champ accepte aussi un code de secours : pas de « 6 chiffres ».
  if (failure.reason === 'invalid_form') return { key: 'login.mfa.codeRequired', params: {} }

  return { key: mfaErrorKey(failure.reason), params: {} }
}
