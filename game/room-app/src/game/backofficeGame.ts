import type { GameState } from '@quizzup/game-engine'

import {
  forgetBackofficeGameId,
  isRememberedForCurrentAccount,
  readBackofficeGameId,
  readSavedBackofficeGame,
  rememberBackofficeGameId,
} from '@/game/backofficeGameMemory'
import { enqueuePendingFinish, findPendingFinishBySeed } from '@/game/pendingFinishes'
import { getLeaderboard } from '@/game/selectors'
import { getRoomToken, isDemoMode } from '@/utils/auth'

export { readBackofficeGameId, rememberBackofficeGameId }

/**
 * Au podium, met en file la fin de la partie (scores des pupitres) à signaler au backoffice,
 * pour qu'elle ne reste pas « en cours » ; l'envoi se fait en arrière-plan et se répète tant
 * que le réseau manque (cf. `pendingFinishes.ts`). Sans effet en mode démo, hors partie du
 * backoffice ou si la partie jouée n'est pas celle retenue (graine différente) ou appartient à
 * un autre compte de salle.
 *
 * Retourne l'id de la partie du backoffice dont l'état d'envoi concerne ce podium, sinon `null` :
 * soit le rapport vient d'être mis en file (la partie retenue est alors oubliée, la file garde
 * le relais), soit il y est déjà (page rechargée au podium, même graine).
 */
export function reportFinishedGame(state: GameState): number | null {
  if (isDemoMode()) {
    return null
  }
  const saved = readSavedBackofficeGame()

  if (
    !getRoomToken() ||
    !saved ||
    saved.seed !== state.setup.seed ||
    !isRememberedForCurrentAccount(saved)
  ) {
    return findPendingFinishBySeed(state.setup.seed)?.gameId ?? null
  }

  const scores = getLeaderboard(state).map(({ podium, score }) => ({ podium, score }))
  void enqueuePendingFinish({ gameId: saved.id, seed: saved.seed, scores })
  forgetBackofficeGameId()
  return saved.id
}
