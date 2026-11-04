/**
 * Mémoire locale de la partie du backoffice jouée sur ce PC (sa sauvegarde locale est la
 * progression). Module volontairement sans dépendance : le moteur de partie s'en sert pour
 * savoir si une sauvegarde correspond encore à la partie retenue.
 */
import { getRoomAccountId } from '@/utils/auth'

const BACKOFFICE_GAME_ID_KEY = 'quizzup_room_backoffice_game'

/**
 * `seed` absente : sauvegarde d'avant l'envoi des résultats (id seul). `accountId` absent :
 * compte inconnu (mémoire ancienne), la graine fait alors foi.
 */
export type SavedBackofficeGame = { id: number; seed: number | null; accountId: number | null }

export function readSavedBackofficeGame(): SavedBackofficeGame | null {
  try {
    const saved = JSON.parse(localStorage.getItem(BACKOFFICE_GAME_ID_KEY) ?? 'null') as unknown
    const { id, seed, accountId } = (
      typeof saved === 'number' ? { id: saved } : (saved ?? {})
    ) as Partial<SavedBackofficeGame>
    return Number.isInteger(id) && Number(id) > 0
      ? {
          id: Number(id),
          seed: Number.isInteger(seed) ? Number(seed) : null,
          accountId: Number.isInteger(accountId) ? Number(accountId) : null,
        }
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
 * La partie locale de graine `seed` est-elle celle retenue du backoffice, quel que soit le
 * compte ? Une mémoire sans graine (d'avant l'envoi des résultats) ne permet pas de
 * l'affirmer : réponse négative.
 */
export function isRememberedBackofficeSeed(seed: number): boolean {
  const saved = readSavedBackofficeGame()
  return saved !== null && saved.seed === seed
}

/**
 * La mémoire appartient-elle au compte de salle connecté ? Vrai si l'un des deux comptes est
 * inconnu (mémoire ou connexion d'avant l'enregistrement du compte) : la graine fait foi.
 */
export function isRememberedForCurrentAccount(saved: SavedBackofficeGame | null): boolean {
  const current = getRoomAccountId()
  return (
    saved === null || saved.accountId === null || current === null || saved.accountId === current
  )
}

/** La graine relie la partie locale à celle du backoffice (le moteur la reçoit telle quelle) ;
 * le compte de salle connecté y est joint pour ne pas la proposer à une autre salle. */
export function rememberBackofficeGameId(id: number, seed: number): void {
  try {
    localStorage.setItem(
      BACKOFFICE_GAME_ID_KEY,
      JSON.stringify({ id, seed, accountId: getRoomAccountId() })
    )
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
