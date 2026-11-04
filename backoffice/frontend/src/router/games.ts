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

export function getCreateGameRoute(options: GameCompanyQuery = {}): RouteLocationRaw {
  return { name: 'games-create', query: buildCompanyQuery(options) }
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
