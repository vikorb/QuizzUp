import type { RouteLocationRaw } from 'vue-router'

import type { AgendaSavedBanner } from '@/utils/game/agenda'

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

/** `roomId` et `date` (jour de la salle) ouvrent l'agenda sur une session ; `saved` y annonce son succès. */
export function getAgendaRoute(
  options: GameCompanyQuery & { roomId?: number; date?: string; saved?: AgendaSavedBanner } = {}
): RouteLocationRaw {
  const query = buildCompanyQuery(options)

  if (options.roomId) {
    query.roomId = String(options.roomId)
  }

  if (options.date) {
    query.date = options.date
  }

  if (options.saved) {
    query.saved = options.saved
  }

  return { name: 'agenda', query }
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
