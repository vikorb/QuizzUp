import { ADMIN_ROLE_ROOM } from '@quizzup/shared'

/**
 * Connexion du PC de la salle avec le compte de salle (US-ROOM-02). Mêmes routes
 * que le backoffice (`/login`, `/me`, `/logout`), mais jeton stocké à part et
 * seuls les comptes de rôle `room` sont acceptés.
 */
export const ROOM_TOKEN_KEY = 'quizzup_room_token'
const DEMO_KEY = 'quizzup_room_demo'

export type RoomLoginFailReason =
  'invalid_credentials' | 'invalid_form' | 'not_room_account' | 'server_error' | 'api_unreachable'

export type RoomAccount = {
  id: number
  companyId: number
  role: string
  username?: string
  firstname?: string
  lastname?: string
}

export type RoomLoginResult =
  { ok: true; token: string; account: RoomAccount } | { ok: false; reason: RoomLoginFailReason }

export function getApiBase(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // Stockage indisponible : la session ne survivra pas au rechargement.
  }
}

export function getRoomToken(): string | null {
  return safeGet(ROOM_TOKEN_KEY)
}

export function setRoomToken(token: string | null): void {
  safeSet(ROOM_TOKEN_KEY, token)
}

export function isDemoMode(): boolean {
  return safeGet(DEMO_KEY) === '1'
}

export function setDemoMode(enabled: boolean): void {
  safeSet(DEMO_KEY, enabled ? '1' : null)
}

export function loginReasonToI18nKey(reason: RoomLoginFailReason): string {
  switch (reason) {
    case 'invalid_credentials': {
      return 'auth.errors.invalidCredentials'
    }
    case 'invalid_form': {
      return 'auth.errors.invalidForm'
    }
    case 'not_room_account': {
      return 'auth.errors.notRoomAccount'
    }
    case 'api_unreachable': {
      return 'auth.errors.apiUnreachable'
    }
    default: {
      return 'auth.errors.serverError'
    }
  }
}

function authHeaders(token: string): Headers {
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  return headers
}

/**
 * Compte connecté, `'unauthorized'` si le jeton est expiré ou révoqué (401), ou
 * `null` si l'API est injoignable ou en erreur (la salle peut continuer hors ligne).
 */
export async function fetchRoomAccount(
  token: string
): Promise<RoomAccount | 'unauthorized' | null> {
  try {
    const res = await fetch(`${getApiBase()}/me`, {
      headers: authHeaders(token),
      credentials: 'include',
    })
    if (res.status === 401) {
      return 'unauthorized'
    }
    if (!res.ok) {
      return null
    }
    const data = (await res.json().catch(() => null)) as { admin?: RoomAccount } | null
    return data?.admin ?? null
  } catch {
    return null
  }
}

export async function logoutApi(token: string): Promise<void> {
  await fetch(`${getApiBase()}/logout`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
  }).catch(() => undefined)
}

export async function loginRoomApi(args: {
  identifier: string
  password: string
}): Promise<RoomLoginResult> {
  let token: string | undefined

  try {
    const res = await fetch(`${getApiBase()}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(args),
    })
    const data = (await res.json().catch(() => null)) as { token?: string } | null

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, reason: 'invalid_credentials' }
      }
      if (res.status === 400) {
        return { ok: false, reason: 'invalid_form' }
      }
      return { ok: false, reason: 'server_error' }
    }

    token = data?.token
  } catch {
    return { ok: false, reason: 'api_unreachable' }
  }

  if (!token) {
    return { ok: false, reason: 'server_error' }
  }

  const account = await fetchRoomAccount(token)

  if (!account || account === 'unauthorized') {
    // Ne pas laisser une session ouverte côté serveur pour un login inachevé.
    await logoutApi(token)
    return { ok: false, reason: 'server_error' }
  }

  if (account.role !== ADMIN_ROLE_ROOM) {
    // Un compte du staff ne doit pas rester connecté sur le PC de la salle.
    await logoutApi(token)
    return { ok: false, reason: 'not_room_account' }
  }

  return { ok: true, token, account }
}
