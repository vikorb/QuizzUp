import type { EngineTheme } from '@quizzup/game-engine'

import { authHeaders, getApiBase } from '@/utils/auth'

/**
 * Routes `/room/*` du backoffice, réservées au compte de salle : la partie
 * préparée par le staff, son contenu, son démarrage et la config matérielle.
 */
export type RoomGameParticipant = {
  id: number
  podium: number
  displayName: string
  score: number
}

export type RoomGame = {
  id: number
  seed: number
  roundsCount: number
  questionsPerRound: number
  state: string
  participants: RoomGameParticipant[]
}

export type RoomInfo = {
  id: number
  name: string
  config: Record<string, unknown>
}

export class RoomApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code)
    this.name = 'RoomApiError'
  }
}

async function request<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers = authHeaders(token)
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null

  if (!res.ok || data === null) {
    throw new RoomApiError(res.status, data?.error ?? 'server_error')
  }
  return data
}

/** Chemin relatif de l'API (`/room/questions/12/media`) → URL complète ; liens externes inchangés. */
export function resolveMediaUrl(url: string | null): string | null {
  if (!url) {
    return null
  }
  return url.startsWith('/') ? `${getApiBase()}${url}` : url
}

export async function fetchRoomInfo(token: string): Promise<RoomInfo> {
  const data = await request<{ room: RoomInfo }>(token, '/room/me')
  return data.room
}

/** Partie en attente ou en cours de la salle, ou `null` si le staff n'en a lancé aucune. */
export async function fetchCurrentGame(token: string): Promise<RoomGame | null> {
  const data = await request<{ game: RoomGame | null }>(token, '/room/games/current')
  return data.game
}

/** Contenu de la partie, au format du moteur, avec des URL de médias complètes. */
export async function fetchCurrentContent(token: string): Promise<EngineTheme[]> {
  const data = await request<{ themes: EngineTheme[] }>(token, '/room/games/current/content')
  return data.themes.map((theme) => ({
    ...theme,
    questions: theme.questions.map((question) => ({
      ...question,
      mediaUrl: resolveMediaUrl(question.mediaUrl),
    })),
  }))
}

/** Accuse réception de la partie : elle passe « en cours » côté backoffice (idempotent). */
export async function startRoomGame(token: string, gameId: number): Promise<RoomGame> {
  const data = await request<{ game: RoomGame }>(token, `/room/games/${gameId}/start`, {
    method: 'POST',
  })
  return data.game
}

export async function saveRoomConfig(token: string, config: unknown): Promise<RoomInfo> {
  const data = await request<{ room: RoomInfo }>(token, '/room/config', {
    method: 'PUT',
    body: { config },
  })
  return data.room
}
