import type { MiniGame } from '@quizzup/shared'

import type { Game, GamePlayerEmail } from '@/types/game'

/** Date et heure courtes d'une partie (ex. « 03/11/2026 14:05 »), « — » si absente. */
export function formatGameDate(value: string | null | undefined, locale: string): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date)
  } catch {
    // Locale inconnue d'Intl : on retombe sur le format par défaut du navigateur.
    return date.toLocaleString()
  }
}

/** État d'affichage de l'email d'un joueur : la valeur, masqué pour le staff, ou absent. */
export type GamePlayerEmailDisplay =
  { kind: 'value'; value: string } | { kind: 'masked' } | { kind: 'none' }

/**
 * Le rôle `user` (staff) saisit les emails mais ne les relit jamais : l'API renvoie alors
 * `email: null` avec `hasEmail: true`.
 */
export function getGamePlayerEmailDisplay(player: GamePlayerEmail): GamePlayerEmailDisplay {
  const email = player.email?.trim()

  if (email) {
    return { kind: 'value', value: email }
  }

  return player.hasEmail === true ? { kind: 'masked' } : { kind: 'none' }
}

export function formatGameParticipantsCount(value: unknown): number {
  const count = Number(value)

  return Number.isFinite(count) && count >= 0 ? count : 0
}

export function getGameRoomName(game: { roomName?: string; roomId: number }): string {
  return game.roomName?.trim() || `#${game.roomId}`
}

/** Clé i18n du nom d'un mini-jeu (ex. `games.miniGames.first_buzz`). */
export function getGameMiniGameLabelKey(miniGame: MiniGame): string {
  return `games.miniGames.${miniGame}`
}

/** Date d'une partie : démarrage, ou création tant qu'elle n'a pas démarré (comme le filtre de l'API). */
export function getGameDate(game: Pick<Game, 'startedAt' | 'createdAt'>): string {
  return game.startedAt ?? game.createdAt
}

/** Durée en `m:ss`, ou `h:mm:ss` à partir d'une heure ; « — » si la partie n'est pas terminée. */
export function formatGameDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(Math.floor(seconds % 60)).padStart(2, '0')

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/** Meilleur score, « — » tant que la partie n'est pas terminée. */
export function formatGameTopScore(score: number | null | undefined): string {
  return score === null || score === undefined ? '—' : String(score)
}

/**
 * Bornes d'un jour du calendrier local (valeur d'un `<input type="date">`, `AAAA-MM-JJ`) en
 * instants ISO : le jour d'une salle est son jour local, pas le jour UTC. `null` si vide ou invalide.
 */
export function getLocalDayBounds(day: string, edge: 'start' | 'end'): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)

  if (!match) {
    return null
  }

  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const bound =
    edge === 'start'
      ? new Date(year, month - 1, date, 0, 0, 0, 0)
      : new Date(year, month - 1, date, 23, 59, 59, 999)

  return Number.isNaN(bound.getTime()) ? null : bound.toISOString()
}
