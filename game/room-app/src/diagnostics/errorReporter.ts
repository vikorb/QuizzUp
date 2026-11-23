import {
  cleanRoomLogText,
  pickRoomLogContext,
  ROOM_LOG_BATCH_MAX_ENTRIES,
  ROOM_LOG_LEVEL_ERROR,
  ROOM_LOG_MESSAGE_MAX_LENGTH,
  ROOM_LOG_OCCURRENCES_MAX,
  type RoomLogContext,
  type RoomLogEntryInput,
  type RoomLogLevel,
} from '@quizzup/shared'

import { getRoomToken, isDemoMode } from '@/utils/auth'
import { postRoomLogs, RoomApiError } from '@/utils/roomApi'

import { version as APP_VERSION } from '../../package.json'

/**
 * Journaux d'erreurs de la salle, envoyés au backoffice (`POST /room/logs`) pour que le personnel
 * voie ce qui s'est passé sans être sur place. Les erreurs sont gardées en mémoire, regroupées
 * quand elles se répètent, puis envoyées par paquets à intervalle régulier. Rien ne bloque la
 * partie : un échec d'envoi est silencieux (jamais signalé lui-même) et réessayé plus tard.
 *
 * Aucune donnée de joueur : les adresses e-mail sont masquées et le contexte se limite à la liste
 * blanche de `@quizzup/shared` (le serveur applique les mêmes filtres).
 */

/** Codes `snake_case` émis par l'écran de salle (le serveur refuse tout autre format). */
export type RoomErrorCode =
  | 'window_error'
  | 'unhandled_rejection'
  | 'vue_error'
  | 'finish_refused'
  | 'audio_play_failed'
  | 'dmx_output_error'
  | 'artnet_bridge_unavailable'

/** Intervalle d'envoi : bien au-dessus de la limite du serveur (6 envois par minute). */
export const FLUSH_EVERY_MS = 30_000
/** Entrées gardées en mémoire quand le réseau manque ; les plus anciennes partent d'abord. */
export const MAX_BUFFERED_ENTRIES = 100

/** Refus définitifs : le même paquet serait refusé indéfiniment, on l'abandonne. */
const DISCARDED_STATUSES: ReadonlySet<number> = new Set([400, 413])

const buffer: RoomLogEntryInput[] = []
const keys = new WeakMap<RoomLogEntryInput, string>()
let flushing: Promise<void> | null = null
let stopListening: (() => void) | null = null

/** Texte lisible d'une erreur quelconque (`Error`, texte, objet). */
export function errorText(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message === '' ? reason.name : reason.message
  }
  return typeof reason === 'string' ? reason : 'unknown_error'
}

/** Note une erreur : regroupée avec la précédente si c'est la même, sinon nouvelle entrée. */
export function reportRoomError(
  code: RoomErrorCode,
  message: string,
  options: { level?: RoomLogLevel; context?: RoomLogContext } = {}
): void {
  const level = options.level ?? ROOM_LOG_LEVEL_ERROR
  const text = cleanRoomLogText(message, ROOM_LOG_MESSAGE_MAX_LENGTH)
  const context = pickRoomLogContext(options.context)
  const key = `${level}|${code}|${text}|${JSON.stringify(context)}`

  const known = buffer.find((entry) => keys.get(entry) === key)
  if (known) {
    known.occurrences = Math.min((known.occurrences ?? 1) + 1, ROOM_LOG_OCCURRENCES_MAX)
    return
  }

  const entry: RoomLogEntryInput = {
    level,
    code,
    // Le serveur refuse un message vide : le code le remplace.
    message: text.trim() === '' ? code : text,
    occurrences: 1,
    occurredAt: new Date().toISOString(),
    ...(context ? { context } : {}),
  }
  keys.set(entry, key)
  buffer.push(entry)

  if (buffer.length > MAX_BUFFERED_ENTRIES) {
    buffer.shift()
  }
}

async function sendBuffered(): Promise<void> {
  const token = getRoomToken()
  if (!token || isDemoMode() || buffer.length === 0) {
    return
  }

  const batch = buffer.slice(0, ROOM_LOG_BATCH_MAX_ENTRIES)
  const sent = batch.map((entry) => ({ ...entry }))
  const forget = (): void => {
    // Les répétitions notées pendant l'envoi restent à envoyer.
    for (const [index, entry] of batch.entries()) {
      entry.occurrences = (entry.occurrences ?? 1) - (sent[index]?.occurrences ?? 1)
      const at = buffer.indexOf(entry)
      // Une entrée évincée de la mémoire pendant l'envoi n'y est plus.
      if (entry.occurrences <= 0 && at !== -1) {
        buffer.splice(at, 1)
      }
    }
  }

  try {
    await postRoomLogs(token, APP_VERSION, sent)
    forget()
  } catch (error) {
    if (error instanceof RoomApiError && DISCARDED_STATUSES.has(error.status)) {
      // Paquet refusé pour de bon : on l'abandonne (une répétition notée depuis est gardée).
      forget()
    }
    // Réseau coupé, 401, 429, 5xx : les entrées restent en mémoire, nouvel essai au prochain passage.
  }
}

/** Envoie les erreurs en attente (50 au plus par paquet). Ne lève jamais. */
export function flushRoomErrors(): Promise<void> {
  flushing ??= sendBuffered().finally(() => {
    flushing = null
  })
  return flushing
}

function onError(event: ErrorEvent): void {
  reportRoomError('window_error', event.message === '' ? errorText(event.error) : event.message)
}

function onRejection(event: PromiseRejectionEvent): void {
  reportRoomError('unhandled_rejection', errorText(event.reason))
}

function onOnline(): void {
  void flushRoomErrors()
}

/**
 * Écoute les erreurs non gérées de la page (`error`, `unhandledrejection`) et envoie les journaux
 * à intervalle régulier et au retour du réseau. Renvoie la fonction qui arrête tout.
 */
export function startErrorReporter(): () => void {
  stopListening?.()

  const timer = setInterval(onOnline, FLUSH_EVERY_MS)

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  window.addEventListener('online', onOnline)

  const stop = (): void => {
    clearInterval(timer)
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    window.removeEventListener('online', onOnline)
    stopListening = null
  }
  stopListening = stop

  return stop
}

/** Arrête l'écoute et vide la mémoire (tests). */
export function resetErrorReporter(): void {
  stopListening?.()
  buffer.length = 0
  flushing = null
}
