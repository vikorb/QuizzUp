import { MINI_GAMES, type MiniGame } from '@quizzup/shared'

/**
 * Mini-jeux autorisés sur cette salle (`localStorage`), en attendant le réglage dans
 * `rooms.config`. Sert aussi aux démos ciblées et aux tests de bout en bout du blind test.
 * Absent, illisible ou vide : tous les mini-jeux sont tirés au sort.
 */
export const MINI_GAMES_STORAGE_KEY = 'quizzup_room_mini_games'

export function readMiniGamesSetting(): MiniGame[] | undefined {
  let raw: string | null
  try {
    raw = globalThis.localStorage?.getItem(MINI_GAMES_STORAGE_KEY) ?? null
  } catch {
    return undefined
  }
  if (!raw) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed)) {
    return undefined
  }

  const miniGames = MINI_GAMES.filter((miniGame) => parsed.includes(miniGame))
  return miniGames.length > 0 ? miniGames : undefined
}
