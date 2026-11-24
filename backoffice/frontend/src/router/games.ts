import type { RouteLocationRaw } from 'vue-router'

type GameCompanyQuery = {
  companyId?: number | null
}

function buildCompanyQuery({ companyId }: GameCompanyQuery): Record<string, string> {
  return companyId ? { companyId: String(companyId) } : {}
}

export function getGamesRoute(
  options: GameCompanyQuery & { createdGameId?: number } = {}
): RouteLocationRaw {
  const query = buildCompanyQuery(options)

  if (options.createdGameId) {
    query.created = String(options.createdGameId)
  }

  return { name: 'games', query }
}

/** `roomId` et `scheduledAt` (UTC, ISO 8601) préremplissent le formulaire depuis un créneau de l'agenda. */
export function getCreateGameRoute(
  options: GameCompanyQuery & { roomId?: number; scheduledAt?: string } = {}
): RouteLocationRaw {
  const query = buildCompanyQuery(options)

  if (options.roomId) {
    query.roomId = String(options.roomId)
  }

  if (options.scheduledAt) {
    query.scheduledAt = options.scheduledAt
  }

  return { name: 'games-create', query }
}

export function getEditGameRoute(
  gameId: number | string,
  options: GameCompanyQuery = {}
): RouteLocationRaw {
  return {
    name: 'games-edit',
    params: {
      gameId: String(gameId),
    },
    query: buildCompanyQuery(options),
  }
}

export function getAgendaRoute(options: GameCompanyQuery = {}): RouteLocationRaw {
  return { name: 'agenda', query: buildCompanyQuery(options) }
}

export function getGameDetailRoute(
  gameId: number | string,
  options: GameCompanyQuery = {}
): RouteLocationRaw {
  return {
    name: 'games-detail',
    params: {
      gameId: String(gameId),
    },
    query: buildCompanyQuery(options),
  }
}

export function getGameResultsRoute(
  gameId: number | string,
  options: GameCompanyQuery = {}
): RouteLocationRaw {
  return {
    name: 'games-results',
    params: {
      gameId: String(gameId),
    },
    query: buildCompanyQuery(options),
  }
}
