import type { GameState } from '@quizzup/game-engine'

import { getLeaderboard } from '@/game/selectors'
import { getRoomToken, isDemoMode } from '@/utils/auth'
import { finishRoomGame } from '@/utils/roomApi'

/** Partie du backoffice jouée sur ce PC (sa sauvegarde locale est la progression). */
const BACKOFFICE_GAME_ID_KEY = 'quizzup_room_backoffice_game'

export function readBackofficeGameId(): string | null {
  try {
    return localStorage.getItem(BACKOFFICE_GAME_ID_KEY)
  } catch {
    return null
  }
}

export function rememberBackofficeGameId(id: number): void {
  try {
    localStorage.setItem(BACKOFFICE_GAME_ID_KEY, String(id))
  } catch {
    // Stockage indisponible : la reprise ne sera simplement pas proposée.
  }
}

function forgetBackofficeGameId(): void {
  try {
    localStorage.removeItem(BACKOFFICE_GAME_ID_KEY)
  } catch {
    // Rien à oublier.
  }
}

/**
 * Au podium, signale la fin de la partie au backoffice avec les scores des pupitres, pour
 * qu'elle ne reste pas « en cours ». Sans effet en mode démo ou hors partie du backoffice.
 */
export async function reportFinishedGame(state: GameState): Promise<boolean> {
  const token = getRoomToken()
  const gameId = Number(readBackofficeGameId())

  if (isDemoMode() || !token || !Number.isInteger(gameId) || gameId <= 0) {
    return false
  }

  const scores = getLeaderboard(state).map(({ podium, score }) => ({ podium, score }))

  await finishRoomGame(token, gameId, scores)
  forgetBackofficeGameId()
  return true
}
