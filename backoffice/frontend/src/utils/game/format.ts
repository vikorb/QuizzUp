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

export function formatGameParticipantsCount(value: unknown): number {
  const count = Number(value)

  return Number.isFinite(count) && count >= 0 ? count : 0
}

export function getGameRoomName(game: { roomName?: string; roomId: number }): string {
  return game.roomName?.trim() || `#${game.roomId}`
}
