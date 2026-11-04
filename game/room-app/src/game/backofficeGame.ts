import type { GameState } from '@quizzup/game-engine'

import {
  forgetBackofficeGameId,
  isRememberedForCurrentAccount,
  readBackofficeGameId,
  readSavedBackofficeGame,
  rememberBackofficeGameId,
} from '@/game/backofficeGameMemory'
import { getLeaderboard } from '@/game/selectors'
import { getRoomToken, isDemoMode } from '@/utils/auth'
import { finishRoomGame, RoomApiError } from '@/utils/roomApi'

export { readBackofficeGameId, rememberBackofficeGameId }

let reporting: Promise<boolean> | null = null

/**
 * Au podium, signale la fin de la partie au backoffice avec les scores des pupitres, pour
 * qu'elle ne reste pas « en cours ». Sans effet en mode démo, hors partie du backoffice ou
 * si la partie jouée n'est pas celle retenue (graine différente) ou appartient à un autre compte de salle. Un seul envoi à la fois.
 */
export function reportFinishedGame(state: GameState): Promise<boolean> {
  reporting ??= send(state).finally(() => {
    reporting = null
  })
  return reporting
}

async function send(state: GameState): Promise<boolean> {
  const token = getRoomToken()
  const saved = readSavedBackofficeGame()

  if (
    isDemoMode() ||
    !token ||
    !saved ||
    saved.seed !== state.setup.seed ||
    !isRememberedForCurrentAccount(saved)
  ) {
    return false
  }

  const scores = getLeaderboard(state).map(({ podium, score }) => ({ podium, score }))

  try {
    await finishRoomGame(token, saved.id, scores)
  } catch (error) {
    // Partie annulée ou disparue côté backoffice : inutile de réessayer.
    if (error instanceof RoomApiError && (error.status === 404 || error.status === 409)) {
      forgetBackofficeGameId()
      return false
    }
    throw error
  }
  forgetBackofficeGameId()
  return true
}
