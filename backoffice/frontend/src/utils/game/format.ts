import type { MiniGame } from '@quizzup/shared'

import type { GamePlayerEmail } from '@/types/game'

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
