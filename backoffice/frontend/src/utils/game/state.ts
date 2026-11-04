import {
  GAME_STATE_ABORTED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATES,
  type GameState,
} from '@quizzup/shared'

import type { Game, GameStateFilter } from '@/types/game'

export type GameStateTone = 'ok' | 'warn' | 'danger' | 'muted'

export function isGameState(value: unknown): value is GameState {
  return typeof value === 'string' && (GAME_STATES as readonly string[]).includes(value)
}

/** Clé i18n du libellé d'un état (`games.state.<état>`). */
export function getGameStateLabelKey(state: unknown): string {
  return isGameState(state) ? `games.state.${state}` : 'games.state.unknown'
}

/** En cours = vert, en attente = orange, arrêtée = rouge, terminée = neutre. */
export function getGameStateTone(state: unknown): GameStateTone {
  if (state === GAME_STATE_RUNNING) {
    return 'ok'
  }

  if (state === GAME_STATE_PENDING) {
    return 'warn'
  }

  if (state === GAME_STATE_ABORTED) {
    return 'danger'
  }

  return 'muted'
}

/** Seule une partie en attente ou en cours peut être arrêtée par l'opérateur. */
export function canAbortGame(game: Pick<Game, 'state'> | null | undefined): boolean {
  return game?.state === GAME_STATE_PENDING || game?.state === GAME_STATE_RUNNING
}

export function filterGamesByState(games: Game[], state: GameStateFilter): Game[] {
  if (!state) {
    return games
  }

  return games.filter((game) => game.state === state)
}

export function countGamesByState(games: Game[], state: GameState): number {
  return games.filter((game) => game.state === state).length
}

/**
 * Remplace une partie de la liste. Le détail renvoyé par l'API (arrêt) n'a pas de
 * `participantsCount` : on garde celui de la liste, ou on le déduit des participants.
 */
export function updateGameInList(games: Game[], updatedGame: Game): Game[] {
  return games.map((game) =>
    game.id === updatedGame.id
      ? {
          ...game,
          ...updatedGame,
          participantsCount:
            updatedGame.participantsCount ??
            updatedGame.participants?.length ??
            game.participantsCount,
        }
      : game
  )
}
