export const TOKEN_KEY = 'quizzup_token'

export type LoginFailReason =
  | 'invalid_credentials'
  | 'invalid_form'
  | 'server_error'
  | 'missing_token'
  | 'api_unreachable'

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: LoginFailReason }

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
    case 'missing_token':
      return 'auth.errors.missingToken'
    case 'api_unreachable':
      return 'auth.errors.apiUnreachable'
    default:
      return 'auth.errors.serverError'
  }
}

export async function loginApi(args: { identifier: string; password: string }): Promise<LoginResult> {
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
      return { ok: false, reason: 'server_error' }
    }

    const token = data?.token as string | undefined
    if (!token) return { ok: false, reason: 'missing_token' }

    return { ok: true, token }
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
