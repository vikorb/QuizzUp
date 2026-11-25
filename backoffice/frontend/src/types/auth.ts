import type { LoginMfaStep } from '@quizzup/shared'

export type LoginFailReason =
  | 'invalid_credentials'
  | 'invalid_form'
  | 'too_many_requests'
  | 'server_error'
  | 'missing_token'
  | 'api_unreachable'
  | 'totp_unavailable'

/** Connexion réussie, ou (superadmin) défi à compléter par la deuxième étape : aucune session encore. */
export type LoginResult =
  | { ok: true; token: string }
  | { ok: true; mfa: LoginMfaStep; challengeToken: string }
  | { ok: false; reason: LoginFailReason }

/** Échecs des routes `/login/totp*` : codes stables du serveur, plus `invalid_form` et `api_unreachable`. */
export type MfaFailReason =
  | 'totp_invalid'
  | 'mfa_challenge_invalid'
  | 'too_many_attempts'
  | 'too_many_requests'
  | 'totp_unavailable'
  | 'totp_not_enrolled'
  | 'totp_already_enrolled'
  | 'totp_enrollment_changed'
  | 'forbidden'
  | 'invalid_form'
  | 'server_error'
  | 'api_unreachable'

export type MfaFailure = { ok: false; reason: MfaFailReason; retryAfterSeconds?: number }

/** Retrait du deuxième facteur : `session_ended` = le jeton de session n'est plus accepté (401 d'authentification). */
export type TotpResetResult = { ok: true } | MfaFailure | { ok: false; reason: 'session_ended' }

export type TotpSignInResult = { ok: true; token: string } | MfaFailure

export type TotpEnrollStartResult =
  { ok: true; secret: string; otpauthUrl: string; qrSvg: string } | MfaFailure

export type TotpEnrollConfirmResult =
  { ok: true; token: string; recoveryCodes: string[] } | MfaFailure
