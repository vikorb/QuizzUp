import type { ApiRequestOptions } from '@/types/api'
import type {
  CreateGamePayload,
  GameApiErrorCode,
  GameApiResult,
  GameJoinResponse,
  GameRegistrationsResponse,
  GameResponse,
  GameRoomsResponse,
  GamesQuery,
  GamesResponse,
  UpdateGamePayload,
} from '@/types/game'
import { apiFetch } from '@/utils/api'
import { readGameApiError } from '@/utils/game/errors'

export type GamesResult = GameApiResult<GamesResponse>
export type GameResult = GameApiResult<GameResponse>
export type GameRoomsResult = GameApiResult<GameRoomsResponse>

function getFallbackErrorCode(status: number): GameApiErrorCode {
  if (status === 401) {
    return 'unauthorized'
  }

  if (status === 403) {
    return 'forbidden'
  }

  if (status === 404) {
    return 'not_found'
  }

  if (status === 409) {
    return 'conflict'
  }

  if (status === 400) {
    return 'invalid_body'
  }

  return 'server_error'
}

// L'API des parties renvoie des codes métier (room_busy, room_inactive…) que le client
// générique ramène à « conflict » : on lit ici le code exact, et le détail RGPD
// `email_consent_required` caché dans les erreurs de validation.
async function requestGameJson<T>(options: ApiRequestOptions): Promise<GameApiResult<T>> {
  const response = await apiFetch({ ...options, authenticated: true })

  if (!response) {
    return {
      ok: false,
      status: null,
      error: 'api_unreachable',
    }
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)

    return {
      ok: false,
      status: response.status,
      error: readGameApiError(payload) ?? getFallbackErrorCode(response.status),
    }
  }

  // Fermeture du lien, refus d'une demande : réponse vide.
  if (response.status === 204) {
    return { ok: true, status: 204, data: undefined as T }
  }

  const json = (await response.json().catch(() => null)) as T | null

  if (json === null) {
    return {
      ok: false,
      status: response.status,
      error: 'invalid_json',
    }
  }

  return {
    ok: true,
    status: response.status,
    data: json,
  }
}

export async function listGamesService(
  companyId: number,
  query: GamesQuery = {}
): Promise<GamesResult> {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const queryString = params.toString()

  return requestGameJson<GamesResponse>({
    path: `/companies/${companyId}/games${queryString ? `?${queryString}` : ''}`,
  })
}

export async function loadGameService(companyId: number, gameId: number): Promise<GameResult> {
  return requestGameJson<GameResponse>({
    path: `/companies/${companyId}/games/${gameId}`,
  })
}

export async function createGameService(
  companyId: number,
  payload: CreateGamePayload
): Promise<GameResult> {
  return requestGameJson<GameResponse>({
    path: `/companies/${companyId}/games`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

/** Modifie une session programmée (seul état modifiable). */
export async function updateGameService(
  companyId: number,
  gameId: number,
  payload: UpdateGamePayload
): Promise<GameResult> {
  return requestGameJson<GameResponse>({
    path: `/companies/${companyId}/games/${gameId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function abortGameService(companyId: number, gameId: number): Promise<GameResult> {
  return requestGameJson<GameResponse>({
    path: `/companies/${companyId}/games/${gameId}/abort`,
    method: 'POST',
  })
}

/** Session programmée → en attente (possible dès 60 min avant son début). */
export async function openGameService(companyId: number, gameId: number): Promise<GameResult> {
  return requestGameJson<GameResponse>({
    path: `/companies/${companyId}/games/${gameId}/open`,
    method: 'POST',
  })
}

/** Session programmée → annulée (idempotent : une session déjà annulée renvoie 200). */
export async function cancelGameService(companyId: number, gameId: number): Promise<GameResult> {
  return requestGameJson<GameResponse>({
    path: `/companies/${companyId}/games/${gameId}/cancel`,
    method: 'POST',
  })
}

function gamePath(companyId: number, gameId: number): string {
  return `/companies/${companyId}/games/${gameId}`
}

/** Ouvre le lien d'inscription d'une partie en attente, ou le régénère (l'ancien lien ne marche plus). */
export async function openGameJoinService(
  companyId: number,
  gameId: number
): Promise<GameApiResult<GameJoinResponse>> {
  return requestGameJson<GameJoinResponse>({
    path: `${gamePath(companyId, gameId)}/join`,
    method: 'POST',
  })
}

/** Ferme le lien d'inscription (idempotent). */
export async function closeGameJoinService(
  companyId: number,
  gameId: number
): Promise<GameApiResult<void>> {
  return requestGameJson<void>({
    path: `${gamePath(companyId, gameId)}/join`,
    method: 'DELETE',
  })
}

/** Demandes d'inscription en attente, les plus anciennes d'abord. */
export async function listGameRegistrationsService(
  companyId: number,
  gameId: number
): Promise<GameApiResult<GameRegistrationsResponse>> {
  return requestGameJson<GameRegistrationsResponse>({
    path: `${gamePath(companyId, gameId)}/registrations`,
  })
}

/** Valide une demande : elle devient un participant. Sans `podium`, le serveur prend le premier libre. */
export async function acceptGameRegistrationService(
  companyId: number,
  gameId: number,
  registrationId: number,
  podium?: number
): Promise<GameApiResult<unknown>> {
  return requestGameJson<unknown>({
    path: `${gamePath(companyId, gameId)}/registrations/${registrationId}/accept`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(podium === undefined ? {} : { podium }),
  })
}

/** Refuse une demande : suppression définitive. */
export async function refuseGameRegistrationService(
  companyId: number,
  gameId: number,
  registrationId: number
): Promise<GameApiResult<void>> {
  return requestGameJson<void>({
    path: `${gamePath(companyId, gameId)}/registrations/${registrationId}`,
    method: 'DELETE',
  })
}

/**
 * Salles de la compagnie, pour choisir où lancer la partie. Appel minimal : la gestion
 * des salles (fiche compagnie) a son propre service.
 */
export async function listGameRoomsService(companyId: number): Promise<GameRoomsResult> {
  return requestGameJson<GameRoomsResponse>({
    path: `/companies/${companyId}/rooms`,
  })
}
