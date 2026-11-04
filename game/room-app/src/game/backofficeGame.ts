import type { GameState } from '@quizzup/game-engine'

import { enqueuePendingFinish } from '@/game/pendingFinishes'
import { getLeaderboard } from '@/game/selectors'
import { getRoomToken, isDemoMode } from '@/utils/auth'

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

/**
 * Au podium, met en file la fin de la partie (scores des pupitres) à signaler au backoffice,
 * pour qu'elle ne reste pas « en cours » ; l'envoi se fait en arrière-plan et se répète tant
 * que le réseau manque (cf. `pendingFinishes.ts`). Sans effet en mode démo, hors partie du
 * backoffice ou si la partie jouée n'est pas celle retenue (graine différente). Retourne
 * `true` si le rapport est pris en charge ; la partie retenue est alors oubliée, la file
 * garde le relais.
 */
export function reportFinishedGame(state: GameState): boolean {
  const saved = readSaved()

  if (isDemoMode() || !getRoomToken() || !saved || saved.seed !== state.setup.seed) {
    return false
  }

  const scores = getLeaderboard(state).map(({ podium, score }) => ({ podium, score }))
  void enqueuePendingFinish({ gameId: saved.id, seed: saved.seed, scores })
  forgetBackofficeGameId()
  return true
}
