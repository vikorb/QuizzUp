import type { GameState } from '@quizzup/game-engine'

import { getLeaderboard } from '@/game/selectors'
import { getRoomToken, isDemoMode } from '@/utils/auth'
import { finishRoomGame, RoomApiError } from '@/utils/roomApi'

/** Partie du backoffice jouée sur ce PC (sa sauvegarde locale est la progression). */
const BACKOFFICE_GAME_ID_KEY = 'quizzup_room_backoffice_game'

/** `seed` absente : sauvegarde d'avant l'envoi des résultats (id seul), reprise possible. */
type SavedBackofficeGame = { id: number; seed: number | null }

function readSaved(): SavedBackofficeGame | null {
  try {
    const saved = JSON.parse(localStorage.getItem(BACKOFFICE_GAME_ID_KEY) ?? 'null') as unknown
    const { id, seed } = (
      typeof saved === 'number' ? { id: saved } : (saved ?? {})
    ) as Partial<SavedBackofficeGame>
    return Number.isInteger(id) && Number(id) > 0
      ? { id: Number(id), seed: Number.isInteger(seed) ? Number(seed) : null }
      : null
  } catch {
    return null
  }
}

export function readBackofficeGameId(): string | null {
  const saved = readSaved()
  return saved ? String(saved.id) : null
}

/** La graine relie la partie locale à celle du backoffice (le moteur la reçoit telle quelle). */
export function rememberBackofficeGameId(id: number, seed: number): void {
  try {
    localStorage.setItem(BACKOFFICE_GAME_ID_KEY, JSON.stringify({ id, seed }))
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

let reporting: Promise<boolean> | null = null

/**
 * Au podium, signale la fin de la partie au backoffice avec les scores des pupitres, pour
 * qu'elle ne reste pas « en cours ». Sans effet en mode démo, hors partie du backoffice ou
 * si la partie jouée n'est pas celle retenue (graine différente). Un seul envoi à la fois.
 */
export function reportFinishedGame(state: GameState): Promise<boolean> {
  reporting ??= send(state).finally(() => {
    reporting = null
  })
  return reporting
}

async function send(state: GameState): Promise<boolean> {
  const token = getRoomToken()
  const saved = readSaved()

  if (isDemoMode() || !token || !saved || saved.seed !== state.setup.seed) {
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
