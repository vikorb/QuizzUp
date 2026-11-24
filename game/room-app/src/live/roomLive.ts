import {
  createSseParser,
  LIVE_EVENT,
  LIVE_HEARTBEAT_MS,
  LIVE_STATUS_EVERY_MS,
  ROOM_COMMAND_TIMEOUT_MS,
  ROOM_DIAGNOSTICS_MAX_GAMEPADS,
  type SseMessage,
} from '@quizzup/shared'
import { computed, ref, watch } from 'vue'

import { errorText, getLastErrorAt, reportRoomError } from '@/diagnostics/errorReporter'
import { readSavedBackofficeGame } from '@/game/backofficeGameMemory'
import { useRoomGame } from '@/game/useRoomGame'
import { getLighting, getRoomHardwareConfig } from '@/hardware/roomHardware'
import {
  answerRoomCommand,
  parseRoomCommand,
  resetRoomCommands,
  type RoomCommandAck,
} from '@/live/roomCommands'
import { buildRoomDiagnostics, buildRoomStatusReport } from '@/live/statusReport'
import { expireRoomSession } from '@/state/roomAuth'
import { authHeaders, getApiBase, getRoomToken, isDemoMode } from '@/utils/auth'

import { version as APP_VERSION } from '../../package.json'

/**
 * Présence en direct (US-LIVE-01) : l'écran de salle ouvre un flux `GET /room/stream` et publie son
 * état par `POST /room/status`, pour que le personnel voie la salle depuis le backoffice.
 *
 * La partie ne dépend jamais de ce module : il ne bloque rien, absorbe toute erreur réseau et ne
 * touche à la partie en cours que pour lire son état. Il ne tourne pas en mode démo.
 */

/**
 * Attentes avant chaque nouvelle ouverture du flux ; la dernière se répète. Remise à zéro quand le
 * flux a tenu un battement après son `hello` (un proxy qui coupe aussitôt ne la remet pas à zéro).
 */
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000] as const
/** Écart minimal entre deux rapports : les changements rapprochés sont regroupés. */
export const MIN_PUBLISH_GAP_MS = 1000
/** Un flux muet plus de ce nombre de battements est considéré coupé. */
export const SILENT_BEATS = 3
/** Délai maximal d'un `POST /room/status` (sans réponse, le suivant n'attendrait jamais). */
export const STATUS_TIMEOUT_MS = 10_000

const REPLACED_ERROR = 'room_instance_replaced'

const replaced = ref(false)
const sessionEnded = ref(false)
/** Flux ouvert et confirmé par son `hello` : tant qu'il l'est, les événements remplacent les lectures. */
const connected = ref(false)
const gameUpdatedListeners = new Set<() => void>()

const { session, state, paused } = useRoomGame()

let gen = 0
let running = false
let routeName: () => string | symbol | null | undefined = () => null
let streamId: string | undefined
let heartbeatMs: number = LIVE_HEARTBEAT_MS
let statusEveryMs: number = LIVE_STATUS_EVERY_MS
let attempt = 0
/** Instant du `hello` du flux courant, `null` tant qu'il n'est pas arrivé. */
let helloAt: number | null = null
let lastSentAt = Number.NEGATIVE_INFINITY
let lastKey = ''
let inFlight = false
let dirty = false

let streamAbort: AbortController | null = null
// Rapports en cours : leur contrôleur d'abandon et la minuterie de leur délai maximal.
const postAborts = new Map<AbortController, ReturnType<typeof setTimeout>>()
let watchdogTimer: ReturnType<typeof setTimeout> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let publishTimer: ReturnType<typeof setTimeout> | null = null
let keepaliveTimer: ReturnType<typeof setTimeout> | null = null
let stopWatchingState: (() => void) | null = null
let stopWatchingExpiry: (() => void) | null = null

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer !== null) {
    clearTimeout(timer)
  }
  return null
}

/** Le son est « prêt » quand le navigateur a vu un geste de l'utilisateur (règle d'autoplay). */
function isAudioReady(): boolean {
  return (
    (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
      ?.hasBeenActive ?? false
  )
}

/** Manettes que le navigateur voit (aucune sans l'API Gamepad). */
function countGamepads(): number {
  return Math.min(
    Array.from(navigator.getGamepads?.() ?? []).filter(Boolean).length,
    ROOM_DIAGNOSTICS_MAX_GAMEPADS
  )
}

/**
 * `withDiagnostics` faux pour la surveillance de l'état : l'état matériel n'est lu qu'à l'envoi, et
 * son évolution ne provoque pas de rapport en plus (le rythme de publication reste le même).
 */
function currentReport(
  backofficeGame: ReturnType<typeof readSavedBackofficeGame>,
  withDiagnostics = true
) {
  return buildRoomStatusReport({
    routeName: routeName(),
    state: state.value,
    backofficeGame,
    paused: paused.value,
    // Pas réactif : « son prêt » n'est publié qu'au prochain rapport (15 s au plus).
    audioReady: isAudioReady(),
    diagnostics: withDiagnostics
      ? buildRoomDiagnostics({
          appVersion: APP_VERSION,
          config: getRoomHardwareConfig(),
          lighting: getLighting()?.getState() ?? null,
          gamepadCount: countGamepads(),
          lastErrorAt: getLastErrorAt(),
        })
      : undefined,
  })
}

/** Arrête flux, requêtes, minuteries et surveillance de l'état. N'efface pas `replaced`. */
function halt(): void {
  gen += 1
  running = false
  streamId = undefined
  connected.value = false
  inFlight = false
  dirty = false
  streamAbort?.abort()
  streamAbort = null
  postAborts.forEach((timeout, controller) => {
    clearTimeout(timeout)
    controller.abort()
  })
  postAborts.clear()
  watchdogTimer = clearTimer(watchdogTimer)
  reconnectTimer = clearTimer(reconnectTimer)
  publishTimer = clearTimer(publishTimer)
  keepaliveTimer = clearTimer(keepaliveTimer)
  stopWatchingState?.()
  stopWatchingState = null
}

function markReplaced(): void {
  replaced.value = true
  halt()
}

/**
 * La session n'est plus valable. Sans partie ouverte : même traitement qu'un jeton refusé au
 * démarrage. Avec une partie : elle continue, la salle est déconnectée une fois la partie fermée.
 */
function endSession(): void {
  halt()
  sessionEnded.value = true

  if (session.value === null) {
    void expireRoomSession()
    return
  }

  // `sync` : une partie fermée puis une autre ouverte dans le même tour doit quand même être vue.
  stopWatchingExpiry = watch(
    () => session.value === null,
    (closed) => {
      if (closed) {
        stopWatchingExpiry?.()
        stopWatchingExpiry = null
        void expireRoomSession()
      }
    },
    { flush: 'sync' }
  )
}

function schedulePublish(): void {
  if (streamId === undefined || publishTimer !== null) {
    return
  }

  const wait = lastSentAt + MIN_PUBLISH_GAP_MS - Date.now()

  if (wait <= 0) {
    void publish()
    return
  }

  publishTimer = setTimeout(() => {
    publishTimer = null
    void publish()
  }, wait)
}

async function publish(): Promise<void> {
  const token = getRoomToken()
  const myGen = gen

  if (streamId === undefined || !token) {
    return
  }

  if (inFlight) {
    dirty = true
    return
  }

  inFlight = true
  lastSentAt = Date.now()
  keepaliveTimer = clearTimer(keepaliveTimer)
  keepaliveTimer = setTimeout(() => {
    keepaliveTimer = null
    schedulePublish()
  }, statusEveryMs)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS)
  const headers = authHeaders(token)
  const sentStreamId = streamId

  headers.set('Content-Type', 'application/json')
  postAborts.set(controller, timeout)

  try {
    const res = await fetch(`${getApiBase()}/room/status`, {
      method: 'POST',
      headers,
      // La mémoire locale n'est lue qu'ici, à l'envoi, jamais dans le calcul surveillé.
      body: JSON.stringify({ ...currentReport(readSavedBackofficeGame()), streamId: sentStreamId }),
      signal: controller.signal,
    })

    if (gen === myGen && res.status === 401) {
      endSession()
    } else if (gen === myGen && res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null

      // Un 409 pour un ancien flux (perdu depuis) ne dit rien du flux courant.
      if (gen === myGen && streamId === sentStreamId && body?.error === REPLACED_ERROR) {
        markReplaced()
      }
    }
  } catch {
    // Réseau coupé ou serveur lent : le prochain changement ou le rythme minimal renvoie l'état.
  } finally {
    clearTimeout(timeout)
    postAborts.delete(controller)
  }

  if (gen === myGen) {
    inFlight = false

    if (dirty) {
      dirty = false
      schedulePublish()
    }
  }
}

function armWatchdog(): void {
  watchdogTimer = clearTimer(watchdogTimer)
  watchdogTimer = setTimeout(() => streamAbort?.abort(), heartbeatMs * SILENT_BEATS + 1000)
}

/** Rend l'accusé d'une commande. Un échec est sans suite : le personnel verra `expired`. */
async function sendCommandAck(commandId: string, ack: RoomCommandAck): Promise<void> {
  const token = getRoomToken()

  if (!token) {
    return
  }

  const myGen = gen
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROOM_COMMAND_TIMEOUT_MS)
  const headers = authHeaders(token)

  headers.set('Content-Type', 'application/json')
  postAborts.set(controller, timeout)

  try {
    const res = await fetch(
      `${getApiBase()}/room/commands/${encodeURIComponent(commandId)}/result`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(ack),
        signal: controller.signal,
      }
    )

    if (gen === myGen && res.status === 401) {
      endSession()
    }
  } catch {
    // Réseau coupé ou serveur lent : la partie et le flux n'en savent rien.
  } finally {
    clearTimeout(timeout)
    postAborts.delete(controller)
  }
}

/** Une commande du personnel : seulement sur un flux confirmé par son `hello`, jamais ailleurs. */
function onCommand(data: string): void {
  const command = parseRoomCommand(data)

  if (!command || streamId === undefined) {
    return
  }

  let ack: RoomCommandAck

  try {
    ack = answerRoomCommand(command)
  } catch (error) {
    // Une commande qui plante n'est pas une coupure réseau : le flux reste ouvert, pas d'accusé
    // (le personnel verra `expired`).
    reportRoomError('room_command_failed', errorText(error))
    return
  }

  void sendCommandAck(command.commandId, ack)
}

function onMessage(message: SseMessage): void {
  if (message.event === LIVE_EVENT.COMMAND) {
    onCommand(message.data)
    return
  }

  if (message.event === LIVE_EVENT.REPLACED) {
    markReplaced()
    return
  }

  if (message.event === LIVE_EVENT.SESSION_ENDED) {
    endSession()
    return
  }

  // Aucune donnée n'est lue : l'écran qui écoute relit la partie et la prochaine session par
  // `GET /room/games/current`. `schedule_changed` (programme de la salle modifié) fait de même.
  if (message.event === LIVE_EVENT.GAME_UPDATED || message.event === LIVE_EVENT.SCHEDULE_CHANGED) {
    gameUpdatedListeners.forEach((listener) => listener())
    return
  }

  if (message.event !== LIVE_EVENT.HELLO) {
    return
  }

  try {
    const hello = JSON.parse(message.data) as {
      streamId?: unknown
      heartbeatMs?: unknown
      statusEveryMs?: unknown
    }

    if (typeof hello.streamId !== 'string') {
      return
    }

    streamId = hello.streamId
    connected.value = true
    heartbeatMs = Number(hello.heartbeatMs) > 0 ? Number(hello.heartbeatMs) : LIVE_HEARTBEAT_MS
    statusEveryMs =
      Number(hello.statusEveryMs) > 0 ? Number(hello.statusEveryMs) : LIVE_STATUS_EVERY_MS
    helloAt = Date.now()
    // Un nouveau flux : l'état est renvoyé tout de suite, sans attendre le prochain changement.
    lastSentAt = Number.NEGATIVE_INFINITY
    schedulePublish()
  } catch {
    // Message illisible : ignoré, le flux continue.
  }
}

function scheduleReconnect(): void {
  const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]

  attempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, delay)
}

async function connect(): Promise<void> {
  const myGen = gen
  const token = getRoomToken()

  if (!token) {
    halt()
    return
  }

  const controller = new AbortController()
  const headers = authHeaders(token)

  headers.set('Accept', 'text/event-stream')
  streamAbort = controller
  heartbeatMs = LIVE_HEARTBEAT_MS
  helloAt = null
  armWatchdog()

  try {
    const res = await fetch(`${getApiBase()}/room/stream`, { headers, signal: controller.signal })

    if (gen !== myGen) {
      return
    }

    if (res.status === 401) {
      endSession()
      return
    }

    if (!res.ok || !res.body) {
      throw new Error(`stream ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const parse = createSseParser(onMessage)

    for (;;) {
      const { done, value } = await reader.read()

      if (done || gen !== myGen) {
        break
      }

      armWatchdog()
      parse(decoder.decode(value, { stream: true }))

      if (gen !== myGen) {
        break
      }
    }
  } catch {
    // Coupure, délai dépassé ou flux muet : on rouvre le flux après l'attente prévue.
  }

  if (gen !== myGen) {
    return
  }

  // Flux perdu : plus de rapport tant qu'un nouveau `hello` n'a pas confirmé que cette salle est
  // la seule à publier (un autre poste a pu prendre la place sans qu'on le sache).
  controller.abort()
  streamId = undefined
  connected.value = false

  if (helloAt !== null && Date.now() - helloAt >= heartbeatMs) {
    attempt = 0
  }

  watchdogTimer = clearTimer(watchdogTimer)
  publishTimer = clearTimer(publishTimer)
  keepaliveTimer = clearTimer(keepaliveTimer)
  scheduleReconnect()
}

/**
 * Démarre la présence en direct. Sans effet en mode démo, sans jeton ou déjà démarrée.
 * `getRouteName` donne la route affichée ; elle est retenue pour les relances sans argument.
 */
export function startRoomLive(getRouteName?: () => string | symbol | null | undefined): void {
  if (getRouteName) {
    routeName = getRouteName
  }

  if (running || isDemoMode() || !getRoomToken()) {
    return
  }

  stopWatchingExpiry?.()
  stopWatchingExpiry = null
  replaced.value = false
  sessionEnded.value = false
  running = true
  attempt = 0
  lastKey = ''

  // Chaque changement utile de l'état déclenche un rapport (regroupé par `schedulePublish`). Le
  // calcul surveillé tourne à chaque tick du moteur : aucune lecture de la mémoire locale ici. La
  // graine fait changer la clé quand une autre partie remplace la précédente.
  stopWatchingState = watch(
    () => JSON.stringify([currentReport(null, false), state.value?.setup.seed]),
    (key) => {
      if (key !== lastKey) {
        lastKey = key
        schedulePublish()
      }
    },
    { immediate: true }
  )

  void connect()
}

/** Arrête la présence en direct (déconnexion de la salle). L'avis de fin de session reste affiché. */
export function stopRoomLive(): void {
  halt()
  resetRoomCommands()
  stopWatchingExpiry?.()
  stopWatchingExpiry = null
  replaced.value = false
}

/**
 * Écoute `game_updated` et `schedule_changed`. Un seul abonnement par écran suffit : il survit aux reconnexions du flux.
 * Retourne la fonction qui le retire.
 */
export function onRoomGameUpdated(listener: () => void): () => void {
  gameUpdatedListeners.add(listener)

  return () => gameUpdatedListeners.delete(listener)
}

export function useRoomLive() {
  return {
    /** Le flux de la salle est ouvert : sinon les écrans se rattrapent par une lecture lente. */
    connected: computed(() => connected.value),
    /** Un autre poste de la salle a pris la main : cet écran ne publie plus. */
    replaced: computed(() => replaced.value),
    /** La session de salle a pris fin : l'écran de connexion le dit. */
    sessionEnded: computed(() => sessionEnded.value),
  }
}
