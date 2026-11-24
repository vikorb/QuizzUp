import { getApiBase } from '@/utils/auth'

export type JoinLookup = {
  companyName: string
  roomName: string
  logoUrl: string | null
  expiresAt: string
}

/** Un joueur du formulaire : champs envoyés tels quels à `POST /public/v1/join/registrations`. */
export type JoinPlayerInput = {
  displayName: string
  email?: string
  emailConsent?: boolean
  marketingConsent?: boolean
  ageConfirmed?: boolean
}

type JoinRegistrationInput = JoinPlayerInput & {
  secondPlayer?: JoinPlayerInput
}

/** Champs refusés par le serveur, par chemin (`displayName`, `secondPlayer.email`…). */
export type JoinFieldErrors = Record<string, string[]>

export type JoinFailure =
  | { ok: false; reason: 'invalid' | 'closed' | 'full' | 'network' | 'server' }
  | { ok: false; reason: 'invalid_body'; fieldErrors: JoinFieldErrors }
  | { ok: false; reason: 'too_many_requests'; retryAfterSeconds: number }

type JoinResult<T> = { ok: true; data: T } | JoinFailure

const DEFAULT_RETRY_AFTER_SECONDS = 60

const REASONS = new Map<unknown, 'invalid' | 'closed' | 'full'>([
  ['join_link_invalid', 'invalid'],
  ['join_link_closed', 'closed'],
  ['join_full', 'full'],
])

// Le jeton et les données du joueur voyagent dans le corps : jamais dans l'adresse.
async function postJoin<T>(path: string, body: unknown): Promise<JoinResult<T>> {
  let response: Response

  try {
    response = await fetch(`${getApiBase()}/public/v1/join/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, reason: 'network' }
  }

  const payload = (await response.json().catch(() => null)) as
    (T & { error?: unknown; details?: { fieldErrors?: JoinFieldErrors } }) | null

  if (response.ok && payload) {
    return { ok: true, data: payload }
  }

  if (response.status === 429 || payload?.error === 'too_many_requests') {
    const retryAfter = Number(response.headers.get('Retry-After'))

    return {
      ok: false,
      reason: 'too_many_requests',
      retryAfterSeconds: retryAfter > 0 ? Math.ceil(retryAfter) : DEFAULT_RETRY_AFTER_SECONDS,
    }
  }

  if (payload?.error === 'invalid_body') {
    return { ok: false, reason: 'invalid_body', fieldErrors: payload.details?.fieldErrors ?? {} }
  }

  return { ok: false, reason: REASONS.get(payload?.error) ?? 'server' }
}

export async function lookupJoinLink(token: string): Promise<JoinResult<JoinLookup>> {
  const result = await postJoin<JoinLookup>('lookup', { token })

  if (!result.ok || !result.data.logoUrl?.startsWith('/')) {
    return result
  }

  // L'API renvoie un chemin : le logo est servi par l'API, pas par l'origine de la page.
  return { ok: true, data: { ...result.data, logoUrl: `${getApiBase()}${result.data.logoUrl}` } }
}

export function sendJoinRegistration(
  token: string,
  registration: JoinRegistrationInput
): Promise<JoinResult<{ ok: true }>> {
  return postJoin('registrations', { token, ...registration })
}
