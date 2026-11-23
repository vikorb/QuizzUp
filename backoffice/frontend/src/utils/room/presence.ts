import { ROOM_PRESENCE, type RoomLive } from '@quizzup/shared'

type RoomPresenceKind = 'online' | 'offline' | 'in_game' | 'unknown'

const MINUTE_S = 60
const HOUR_S = 60 * MINUTE_S
const DAY_S = 24 * HOUR_S

/** Sans flux ouvert (`uncertain`) ou sans information sur la salle, on n'affirme rien. */
export function getRoomPresenceKind(room: RoomLive | null, uncertain: boolean): RoomPresenceKind {
  if (uncertain || !room) {
    return 'unknown'
  }

  if (room.presence === ROOM_PRESENCE.IN_GAME) {
    return 'in_game'
  }

  return room.presence === ROOM_PRESENCE.ONLINE ? 'online' : 'offline'
}

/** Clé i18n du libellé de présence. */
export function getRoomPresenceLabelKey(kind: RoomPresenceKind): string {
  return `live.presence.${kind}`
}

/** « il y a 5 minutes » à partir d'une date ISO ; `null` si la date est illisible. */
export function formatSeenAgo(lastSeenAt: string, now: number, locale: string): string | null {
  const seenAt = Date.parse(lastSeenAt)

  if (Number.isNaN(seenAt)) {
    return null
  }

  // Les horloges du serveur et du navigateur peuvent différer : jamais « dans le futur ».
  const seconds = Math.max(0, Math.floor((now - seenAt) / 1000))
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (seconds < MINUTE_S) {
    return formatter.format(-seconds, 'second')
  }

  if (seconds < HOUR_S) {
    return formatter.format(-Math.floor(seconds / MINUTE_S), 'minute')
  }

  if (seconds < DAY_S) {
    return formatter.format(-Math.floor(seconds / HOUR_S), 'hour')
  }

  return formatter.format(-Math.floor(seconds / DAY_S), 'day')
}
