import {
  ROOM_LOG_CONTEXT_KEYS,
  ROOM_LOG_LEVEL_ERROR,
  ROOM_LOG_LEVELS,
  ROOM_LOG_LIST_DEFAULT_LIMIT,
  ROOM_LOG_MESSAGE_MAX_LENGTH,
  type RoomLog,
  type RoomLogContext,
  type RoomLogLevel,
} from '@quizzup/shared'

import type { TranslateFn } from '@/types'
import type { SelectFieldOption } from '@/types/form'

export type RoomLogLevelFilter = RoomLogLevel | 'all'

export const DEFAULT_ROOM_LOG_LEVEL_FILTER: RoomLogLevelFilter = 'all'

export function getRoomLogLevelFilterOptions(t: TranslateFn): SelectFieldOption[] {
  return [
    { value: 'all', label: t('rooms.logs.filters.level.all') },
    ...ROOM_LOG_LEVELS.map((level) => ({
      value: level,
      label: t(`rooms.logs.levels.${level}`),
    })),
  ]
}

export function parseRoomLogLevelFilter(value: string): RoomLogLevelFilter {
  return ROOM_LOG_LEVELS.find((level) => level === value) ?? DEFAULT_ROOM_LOG_LEVEL_FILTER
}

/** Couleur de la pastille : une erreur en danger, un avertissement en warn. */
export function getRoomLogTone(level: RoomLogLevel): 'danger' | 'warn' {
  return level === ROOM_LOG_LEVEL_ERROR ? 'danger' : 'warn'
}

/**
 * Le message vient d'un poste de salle : le serveur le borne déjà, on le borne aussi à
 * l'affichage (texte seulement, jamais de HTML) pour qu'une réponse inattendue ne casse pas la liste.
 */
export function truncateRoomLogMessage(message: string): string {
  return message.length > ROOM_LOG_MESSAGE_MAX_LENGTH
    ? `${message.slice(0, ROOM_LOG_MESSAGE_MAX_LENGTH - 1)}…`
    : message
}

/** Contexte en paires `clé, valeur`, dans l'ordre de la liste blanche ; toute autre clé est ignorée. */
export function getRoomLogContextEntries(
  context: RoomLogContext | null
): Array<{ key: string; value: string }> {
  if (!context) {
    return []
  }

  return ROOM_LOG_CONTEXT_KEYS.flatMap((key) =>
    context[key] === undefined ? [] : [{ key, value: String(context[key]) }]
  )
}

/** Une page pleine laisse supposer qu'il en reste ; une page courte est la dernière. */
export function hasMoreRoomLogs(page: RoomLog[]): boolean {
  return page.length >= ROOM_LOG_LIST_DEFAULT_LIMIT
}
