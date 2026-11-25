import { LOGIN_MFA_STEPS } from '@quizzup/shared'

import type {
  LoginFailReason,
  LoginResult,
  MfaFailReason,
  MfaFailure,
  TotpEnrollConfirmResult,
  TotpEnrollStartResult,
  TotpResetResult,
  TotpSignInResult,
} from '@/types/auth'

export const TOKEN_KEY = 'quizzup_token'

export function getApiBase(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function loginReasonToI18nKey(reason: LoginFailReason): string {
  switch (reason) {
    case 'invalid_credentials':
      return 'auth.errors.invalidCredentials'
    case 'invalid_form':
      return 'auth.errors.invalidForm'
    case 'too_many_requests':
      return 'auth.errors.tooManyRequests'
    case 'missing_token':
      return 'auth.errors.missingToken'
    case 'api_unreachable':
      return 'auth.errors.apiUnreachable'
    case 'totp_unavailable':
      return 'errors.totp_unavailable'
    default:
      return 'auth.errors.serverError'
  }
}

export async function loginApi(args: {
  identifier: string
  password: string
}): Promise<LoginResult> {
  const API_BASE = getApiBase()

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier: args.identifier, password: args.password }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      if (res.status === 401) return { ok: false, reason: 'invalid_credentials' }
      if (res.status === 400) return { ok: false, reason: 'invalid_form' }
      if (res.status === 429) return { ok: false, reason: 'too_many_requests' }
      if (res.status === 503 && data?.error === 'totp_unavailable') {
        return { ok: false, reason: 'totp_unavailable' }
      }
      return { ok: false, reason: 'server_error' }
    }

    // Superadmin : pas de session, un défi à compléter (jeton gardé en mémoire par l'appelant).
    const mfa = LOGIN_MFA_STEPS.find((step) => step === data?.mfa)
    if (mfa) {
      const challengeToken = data?.challengeToken as string | undefined
      return challengeToken
        ? { ok: true, mfa, challengeToken }
        : { ok: false, reason: 'missing_token' }
    }

    const token = data?.token as string | undefined
    if (!token) return { ok: false, reason: 'missing_token' }

    return { ok: true, token }
  } catch {
    return { ok: false, reason: 'api_unreachable' }
  }
}

const MFA_ERROR_CODES: Partial<Record<number, readonly MfaFailReason[]>> = {
  401: ['mfa_challenge_invalid', 'totp_invalid'],
  409: ['totp_not_enrolled', 'totp_already_enrolled', 'totp_enrollment_changed'],
  429: ['too_many_attempts', 'too_many_requests'],
}

function mfaFailure(res: Response, data: { error?: unknown } | null): MfaFailure {
  const { status } = res
  const known = MFA_ERROR_CODES[status]?.find((code) => code === data?.error)

  if (known) {
    const retryAfter = Number(res.headers.get('Retry-After'))
    return {
      ok: false,
      reason: known,
      ...(status === 429 && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
    }
  }

  // Code inconnu : 401 = code faux (réponse volontairement unique du serveur), 429 = limite d'adresse.
  if (status === 401) return { ok: false, reason: 'totp_invalid' }
  if (status === 429) return { ok: false, reason: 'too_many_requests' }
  if (status === 400) return { ok: false, reason: 'invalid_form' }
  if (status === 403) return { ok: false, reason: 'forbidden' }
  // Un 503 sans le code du serveur (proxy, maintenance) n'est pas « deuxième facteur indisponible ».
  if (status === 503 && data?.error === 'totp_unavailable') {
    return { ok: false, reason: 'totp_unavailable' }
  }
  return { ok: false, reason: 'server_error' }
}

/** POST d'une étape du deuxième facteur : le jeton de défi ne voyage que dans le corps. */
async function postMfa<T>(
  path: string,
  body: Record<string, string>,
  read: (data: Record<string, unknown>) => T | null
): Promise<T | MfaFailure> {
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)

    if (!res.ok) return mfaFailure(res, data)

    return (data && read(data)) || { ok: false, reason: 'server_error' }
  } catch {
    return { ok: false, reason: 'api_unreachable' }
  }
}

const isString = (value: unknown): value is string => typeof value === 'string' && value !== ''

function readSession(data: Record<string, unknown>) {
  return isString(data.token) ? { token: data.token } : null
}

/** Deuxième étape d'un superadmin enrôlé : code de l'application ou code de secours. */
export function loginTotpApi(args: {
  challengeToken: string
  code: string
}): Promise<TotpSignInResult> {
  return postMfa('/login/totp', args, (data) => {
    const session = readSession(data)
    return session && { ok: true as const, ...session }
  })
}

/** Première étape d'un enrôlement : rend le secret en clair, une seule fois. */
export function startTotpEnrollApi(args: {
  challengeToken: string
}): Promise<TotpEnrollStartResult> {
  return postMfa('/login/totp/enroll', args, (data) =>
    isString(data.secret) && isString(data.otpauthUrl) && isString(data.qrSvg)
      ? { ok: true as const, secret: data.secret, otpauthUrl: data.otpauthUrl, qrSvg: data.qrSvg }
      : null
  )
}

/** Confirme l'enrôlement avec un premier code : ouvre la session et rend les codes de secours. */
export function confirmTotpEnrollApi(args: {
  challengeToken: string
  code: string
}): Promise<TotpEnrollConfirmResult> {
  return postMfa('/login/totp/enroll/confirm', args, (data) => {
    const session = readSession(data)
    const codes = data.recoveryCodes

    return session && Array.isArray(codes) && codes.every(isString)
      ? { ok: true as const, ...session, recoveryCodes: codes }
      : null
  })
}

/**
 * Profil du superadmin : retire le deuxième facteur (code requis) ; le serveur révoque toutes les sessions.
 * Un 401 qui n'est pas `totp_invalid` vient de l'authentification (session révoquée, expirée, compte
 * désactivé) : `session_ended`, à traiter comme une fin de session.
 */
export async function resetTotpApi(args: { code: string }): Promise<TotpResetResult> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.set('Authorization', `Bearer ${getToken() ?? ''}`)

  try {
    const res = await fetch(`${getApiBase()}/me/totp`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
      body: JSON.stringify({ code: args.code }),
    })

    if (res.ok) return { ok: true }

    const data = await res.json().catch(() => null)
    if (res.status === 401 && data?.error !== 'totp_invalid') {
      return { ok: false, reason: 'session_ended' }
    }

    return mfaFailure(res, data)
  } catch {
    return { ok: false, reason: 'api_unreachable' }
  }
}

export async function logoutApi(token: string): Promise<void> {
  const API_BASE = getApiBase()

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)

  await fetch(`${API_BASE}/logout`, {
    method: 'POST',
    headers,
    credentials: 'include',
  }).catch(() => undefined)
}

const AUTH_EVENT = 'quizzup:auth-changed'

export function notifyAuthChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUTH_EVENT))
}

export function onAuthChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(AUTH_EVENT, cb)
  return () => window.removeEventListener(AUTH_EVENT, cb)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  notifyAuthChanged()
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  notifyAuthChanged()
}
