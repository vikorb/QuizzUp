/**
 * Journaux d'erreurs des salles (lot 7e) : l'écran de salle envoie ses erreurs au backoffice
 * (`POST /room/logs`), le personnel les lit (`GET /companies/:companyId/rooms/:roomId/logs`).
 * Un journal ne contient jamais d'e-mail ni de donnée de joueur : l'écran de salle et le serveur
 * appliquent les mêmes filtres (`cleanRoomLogText`, `pickRoomLogContext`).
 */

export const ROOM_LOG_LEVEL_ERROR = 'error' as const
export const ROOM_LOG_LEVEL_WARN = 'warn' as const

export const ROOM_LOG_LEVELS = [ROOM_LOG_LEVEL_ERROR, ROOM_LOG_LEVEL_WARN] as const

export type RoomLogLevel = (typeof ROOM_LOG_LEVELS)[number]

/** Code d'une entrée : `snake_case`, 64 caractères au plus (`dmx_output_error`). */
export const ROOM_LOG_CODE_MAX_LENGTH = 64
export const ROOM_LOG_CODE_PATTERN = /^[a-z][a-z0-9_]*$/
export const ROOM_LOG_MESSAGE_MAX_LENGTH = 300
export const ROOM_LOG_APP_VERSION_MAX_LENGTH = 32
/** Taille maximale du contexte stocké, une fois sérialisé en JSON. */
export const ROOM_LOG_CONTEXT_MAX_LENGTH = 1024
export const ROOM_LOG_CONTEXT_VALUE_MAX_LENGTH = 64

/**
 * Seules clés admises dans le contexte d'une entrée : route, phase, mini-jeu, numéro de pupitre,
 * pilote des lumières, code HTTP. Toute autre clé est écartée ; jamais de nom ni d'e-mail.
 */
export const ROOM_LOG_CONTEXT_KEYS = [
  'route',
  'phase',
  'miniGame',
  'desk',
  'driver',
  'httpStatus',
] as const

export type RoomLogContextKey = (typeof ROOM_LOG_CONTEXT_KEYS)[number]

export type RoomLogContext = Partial<Record<RoomLogContextKey, string | number>>

/** Entrées d'un même envoi : au plus 50. */
export const ROOM_LOG_BATCH_MAX_ENTRIES = 50
/** Nombre maximal d'occurrences regroupées dans une entrée. */
export const ROOM_LOG_OCCURRENCES_MAX = 10_000

/** Conservation par défaut (réglable par `ROOM_LOG_RETENTION_DAYS`) et plafond de lignes par salle. */
export const ROOM_LOG_DEFAULT_RETENTION_DAYS = 30
export const ROOM_LOG_MAX_PER_ROOM = 5000

export const ROOM_LOG_LIST_DEFAULT_LIMIT = 100
export const ROOM_LOG_LIST_MAX_LIMIT = 200

/** Entrée telle que l'écran de salle l'envoie. */
export type RoomLogEntryInput = {
  level: RoomLogLevel
  code: string
  message: string
  context?: RoomLogContext
  occurrences?: number
  /** Date ISO de la première occurrence. */
  occurredAt: string
}

/** Entrée telle que le personnel la lit. */
export type RoomLog = {
  id: number
  level: RoomLogLevel
  code: string
  message: string
  context: RoomLogContext | null
  appVersion: string
  occurrences: number
  occurredAt: string
  createdAt: string
}

export const ROOM_LOG_EMAIL_PLACEHOLDER = '[email]'

/** Tout mot contenant un `@` est pris pour une adresse : mieux vaut en masquer trop que pas assez. */
const EMAIL_LIKE = /\S*@\S*/g

export function scrubEmails(text: string): string {
  return text.replace(EMAIL_LIKE, ROOM_LOG_EMAIL_PLACEHOLDER)
}

/** Texte de journal : adresses masquées d'abord, puis texte coupé à `maxLength` caractères. */
export function cleanRoomLogText(text: string, maxLength: number): string {
  return scrubEmails(text).slice(0, maxLength)
}

/**
 * Contexte réduit à la liste blanche : une chaîne (nettoyée, 64 caractères au plus) ou un nombre
 * fini par clé autorisée, le reste est écarté. `null` s'il ne reste rien.
 */
export function pickRoomLogContext(raw: unknown): RoomLogContext | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const source = raw as Record<string, unknown>
  const context: RoomLogContext = {}

  for (const key of ROOM_LOG_CONTEXT_KEYS) {
    const value = source[key]

    if (typeof value === 'string') {
      const text = cleanRoomLogText(value, ROOM_LOG_CONTEXT_VALUE_MAX_LENGTH)

      if (text !== '') {
        context[key] = text
      }
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      context[key] = value
    }
  }

  return Object.keys(context).length > 0 ? context : null
}
