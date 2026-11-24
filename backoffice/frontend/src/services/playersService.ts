import { authState } from '@/state/authState'
import type { PlayersApiErrorCode, PlayersList, PlayersQuery, PlayersResult } from '@/types/player'
import { apiFetch } from '@/utils/api'
import { readPlayersApiError } from '@/utils/player/errors'

function getFallbackErrorCode(status: number): PlayersApiErrorCode {
  if (status === 401) {
    return 'unauthorized'
  }

  if (status === 403) {
    return 'forbidden'
  }

  if (status === 404) {
    return 'player_not_found'
  }

  if (status === 400) {
    return 'invalid_params'
  }

  return 'server_error'
}

/** Appel authentifié : `read` tire la donnée d'une réponse réussie (`null` si illisible). */
async function requestPlayers<T>(
  path: string,
  options: { method?: 'POST'; body?: unknown },
  read: (response: Response) => Promise<T | null>
): Promise<PlayersResult<T>> {
  // Sans jeton, `apiFetch` ne part pas : on le dit (session expirée) plutôt que « API injoignable ».
  if (!authState.token.value) {
    return { ok: false, status: null, error: 'missing_token' }
  }

  const hasBody = options.body !== undefined
  const response = await apiFetch({
    path,
    method: options.method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    authenticated: true,
  })

  if (!response) {
    return { ok: false, status: null, error: 'api_unreachable' }
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)

    return {
      ok: false,
      status: response.status,
      error: readPlayersApiError(payload) ?? getFallbackErrorCode(response.status),
    }
  }

  const data = await read(response).catch(() => null)

  if (data === null) {
    return { ok: false, status: response.status, error: 'invalid_json' }
  }

  return { ok: true, status: response.status, data }
}

/** Une page de joueurs d'une compagnie (US-PLAYER-01), recherche sur le nom. */
export async function listPlayersService(
  companyId: number,
  query: PlayersQuery = {}
): Promise<PlayersResult<PlayersList>> {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const queryString = params.toString()

  return requestPlayers(
    `/companies/${companyId}/players${queryString ? `?${queryString}` : ''}`,
    {},
    (response) => response.json() as Promise<PlayersList | null>
  )
}

/** CSV des joueurs qui acceptent les offres (admin et superadmin). */
export async function exportPlayersService(companyId: number): Promise<PlayersResult<Blob>> {
  return requestPlayers(`/companies/${companyId}/players/export.csv`, {}, (response) =>
    response.blob()
  )
}

/** Retire le consentement aux offres. Le serveur répond 200 même pour une adresse inconnue. */
export async function unsubscribePlayerService(
  companyId: number,
  email: string
): Promise<PlayersResult<{ ok: true }>> {
  return requestPlayers(
    `/companies/${companyId}/players/unsubscribe`,
    { method: 'POST', body: { email } },
    (response) => response.json() as Promise<{ ok: true } | null>
  )
}

/** Droit à l'effacement : définitif. `erased` = pupitres et demandes touchés. */
export async function erasePlayerService(
  companyId: number,
  email: string
): Promise<PlayersResult<{ erased: number }>> {
  return requestPlayers(
    `/companies/${companyId}/players/erase`,
    { method: 'POST', body: { email } },
    (response) => response.json() as Promise<{ erased: number } | null>
  )
}
