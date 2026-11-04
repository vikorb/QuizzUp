/**
 * Mémoire locale de la partie du backoffice jouée sur ce PC (sa sauvegarde locale est la
 * progression). Module volontairement sans dépendance : le moteur de partie s'en sert pour
 * savoir si une sauvegarde correspond encore à la partie retenue.
 */
const BACKOFFICE_GAME_ID_KEY = 'quizzup_room_backoffice_game'

/** `seed` absente : sauvegarde d'avant l'envoi des résultats (id seul). */
export type SavedBackofficeGame = { id: number; seed: number | null }

export function readSavedBackofficeGame(): SavedBackofficeGame | null {
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
  const saved = readSavedBackofficeGame()
  return saved ? String(saved.id) : null
}

/**
 * La partie locale de graine `seed` est-elle celle retenue du backoffice ? Une mémoire sans
 * graine (d'avant l'envoi des résultats) ne permet pas de l'affirmer : réponse négative.
 */
export function isRememberedBackofficeSeed(seed: number): boolean {
  const saved = readSavedBackofficeGame()
  return saved !== null && saved.seed === seed
}

/** La graine relie la partie locale à celle du backoffice (le moteur la reçoit telle quelle). */
export function rememberBackofficeGameId(id: number, seed: number): void {
  try {
    localStorage.setItem(BACKOFFICE_GAME_ID_KEY, JSON.stringify({ id, seed }))
  } catch {
    // Stockage indisponible : la reprise ne sera simplement pas proposée.
  }
}

export function forgetBackofficeGameId(): void {
  try {
    localStorage.removeItem(BACKOFFICE_GAME_ID_KEY)
  } catch {
    // Rien à oublier.
  }
}
