import {
  createSseParser,
  GAME_COMMAND_REFUSALS,
  type GameCommandRefusal,
  LIVE_EVENT,
  LIVE_HEARTBEAT_MS,
  ROOM_COMMAND_RESULT,
  ROOM_COMMAND_TIMEOUT_MS,
  type RoomCommand,
  type RoomCommandResult,
  type RoomLive,
  type SseMessage,
} from '@quizzup/shared'
import {
  computed,
  getCurrentScope,
  type MaybeRefOrGetter,
  onScopeDispose,
  ref,
  toValue,
  watch,
} from 'vue'

import { authState, refreshMe } from '@/state/authState'
import { apiFetch } from '@/utils/api'

/** `idle` : rien à suivre (pas de compagnie), rien à afficher. */
export type LiveConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'

/**
 * Attente avant chaque nouvelle tentative ; le dernier palier se répète. Remis à zéro seulement
 * quand un flux est resté ouvert au moins un battement.
 */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
/** Un flux sans aucune donnée (pas même un `: ping`) pendant ce délai est considéré coupé. */
const SILENCE_LIMIT_MS = 3 * LIVE_HEARTBEAT_MS
/** Rafraîchissement de l'horloge qui sert aux « vu il y a … ». */
const CLOCK_TICK_MS = 30_000

/** Marge laissée au serveur pour annoncer `expired` avant que le client conclue seul. */
const COMMAND_RESULT_GRACE_MS = 2_000
/** Codes d'erreur de la route d'envoi d'une commande qui ont un texte (`live.command.error.*`). */
const COMMAND_ERROR_CODES = [
  'room_not_controllable',
  'command_id_conflict',
  'too_many_requests',
  'forbidden',
  'unauthorized',
  'room_not_found',
] as const
/** Code HTTP → code d'erreur, quand le corps n'en porte pas un connu (ex. un 401 de session). */
const COMMAND_STATUS_CODES: Record<number, string> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'room_not_found',
  429: 'too_many_requests',
}

/** Commandes offertes par le panneau : l'arrêt passe par la route d'arrêt de la partie. */
export type PanelRoomCommand = Exclude<RoomCommand, { command: 'abort' }>

/**
 * Issue d'une commande : le résultat rendu par la salle (ou `expired`), ou `error` quand l'envoi
 * lui-même a échoué (`code` : clé de `live.command.error`).
 */
export type RoomCommandOutcome =
  { result: RoomCommandResult; reason?: GameCommandRefusal } | { result: 'error'; code: string }

async function readCommandErrorCode(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  const known = COMMAND_ERROR_CODES.find((code) => code === body?.error)

  if (known) {
    return known
  }

  return COMMAND_STATUS_CODES[response.status] ?? 'server_error'
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isRoomLive(value: unknown): value is RoomLive {
  return (
    typeof value === 'object' && value !== null && typeof (value as RoomLive).roomId === 'number'
  )
}

/**
 * Présence des salles d'une compagnie en direct (US-LIVE-01) : flux SSE du personnel
 * `GET /companies/:id/live`, lu avec `fetch` (l'en-tête `Authorization` interdit `EventSource`).
 * Tant que le flux n'est pas `live`, les présences connues sont incertaines (`uncertain`).
 */
export function useLiveCompany(
  companyId: MaybeRefOrGetter<number | null>,
  /**
   * `onGameUpdated` : une partie de la compagnie a changé (`game_updated`), à relire par la route habituelle.
   * `onScheduleChanged` : le programme d'une salle a changé (`schedule_changed`), à relire de même.
   */
  options: {
    onGameUpdated?: (gameId: number) => void
    onScheduleChanged?: (roomId: number) => void
  } = {}
) {
  const rooms = ref<Record<number, RoomLive>>({})
  const state = ref<LiveConnectionState>('connecting')
  /** Clé i18n de l'erreur quand `state` vaut `error`. */
  const errorKey = ref<string | null>(null)
  /** Heure courante, rafraîchie toutes les 30 s, pour « vu il y a … ». */
  const now = ref(Date.now())
  const uncertain = computed(() => state.value !== 'live')

  let currentId: number | null = null
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let clockTimer: ReturnType<typeof setInterval> | undefined
  let attempt = 0
  /** Commandes envoyées qui attendent leur `command_result` : `commandId` → conclusion. */
  const pendingCommands = new Map<string, (outcome: RoomCommandOutcome) => void>()
  /** Un 401 du flux ne déclenche qu'une relance, même si `/me` confirme la session. */
  let unauthorizedRetried = false

  function close(): void {
    controller?.abort()
    controller = null
    clearTimeout(retryTimer)
    retryTimer = undefined
    clearInterval(clockTimer)
    clockTimer = undefined
    document.removeEventListener('visibilitychange', onVisible)
  }

  function fail(code: string): void {
    close()
    state.value = 'error'
    errorKey.value = `errors.${code}`
  }

  // Même traitement que le reste de l'application : on demande `/me`, qui efface le jeton si la
  // session est vraiment expirée. Avec `retryId`, un compte rendu par `/me` (session encore valide)
  // relance le flux, à moins que l'écran ait changé d'état entre-temps.
  async function sessionLost(code: string, retryId?: number): Promise<void> {
    fail(code)

    const account = await refreshMe()

    if (account && retryId !== undefined && currentId === retryId && state.value === 'error') {
      open(retryId)
    }
  }

  // `errorCode` : message gardé à l'écran pendant l'attente (sinon l'ancien message est effacé).
  function scheduleRetry(id: number, errorCode?: string): void {
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]

    attempt += 1
    state.value = 'reconnecting'
    errorKey.value = errorCode ? `errors.${errorCode}` : null
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      void run(id)
    }, delay)
  }

  // Onglet réaffiché pendant l'attente d'une nouvelle tentative : on ne fait pas attendre davantage.
  function onVisible(): void {
    if (document.visibilityState !== 'visible' || retryTimer === undefined || currentId === null) {
      return
    }

    clearTimeout(retryTimer)
    retryTimer = undefined
    now.value = Date.now()
    void run(currentId)
  }

  function handleMessage({ event, data }: SseMessage): void {
    if (event === LIVE_EVENT.SNAPSHOT) {
      const list = (parseJson(data) as { rooms?: unknown } | null)?.rooms

      if (Array.isArray(list)) {
        rooms.value = Object.fromEntries(list.filter(isRoomLive).map((room) => [room.roomId, room]))
        unauthorizedRetried = false
        errorKey.value = null
        state.value = 'live'
      }
    } else if (event === LIVE_EVENT.ROOM_STATUS) {
      const room = parseJson(data)

      // Une salle absente du dernier `snapshot` n'est pas affichée : on l'ignore.
      if (isRoomLive(room) && room.roomId in rooms.value) {
        rooms.value[room.roomId] = room
      }
    } else if (event === LIVE_EVENT.COMMAND_RESULT) {
      const message = parseJson(data) as {
        commandId?: unknown
        result?: unknown
        reason?: unknown
      } | null
      const result = Object.values(ROOM_COMMAND_RESULT).find((known) => known === message?.result)
      const reason = GAME_COMMAND_REFUSALS.find((known) => known === message?.reason)

      // Le flux porte les résultats de tout le personnel : on ne garde que les commandes d'ici.
      if (typeof message?.commandId === 'string' && result) {
        pendingCommands.get(message.commandId)?.({ result, reason })
      }
    } else if (event === LIVE_EVENT.GAME_UPDATED) {
      const gameId = (parseJson(data) as { gameId?: unknown } | null)?.gameId

      if (typeof gameId === 'number') {
        options.onGameUpdated?.(gameId)
      }
    } else if (event === LIVE_EVENT.SCHEDULE_CHANGED) {
      const changedRoomId = (parseJson(data) as { roomId?: unknown } | null)?.roomId

      if (typeof changedRoomId === 'number') {
        options.onScheduleChanged?.(changedRoomId)
      }
    } else if (event === LIVE_EVENT.SESSION_ENDED) {
      void sessionLost('session_ended')
    }
  }

  async function run(id: number): Promise<void> {
    const ctrl = new AbortController()
    let silence: ReturnType<typeof setTimeout> | undefined

    // Heure d'ouverture du flux ; `null` tant qu'il n'est pas ouvert.
    let openedAt: number | null = null

    controller = ctrl
    ctrl.signal.addEventListener('abort', () => clearTimeout(silence))

    // Coupure : on arrête cette lecture et on planifie la suivante (une seule fois par flux).
    // L'attente ne repart de 1 s que si le flux est resté ouvert au moins un battement : un serveur
    // qui envoie l'instantané puis ferme aussitôt ne doit pas provoquer une reconnexion par seconde.
    const lost = (errorCode?: string): void => {
      if (!ctrl.signal.aborted) {
        ctrl.abort()

        if (openedAt !== null && Date.now() - openedAt >= LIVE_HEARTBEAT_MS) {
          attempt = 0
        }

        scheduleRetry(id, errorCode)
      }
    }
    const armSilence = (): void => {
      clearTimeout(silence)
      silence = setTimeout(() => lost(), SILENCE_LIMIT_MS)
    }

    armSilence()

    const response = await apiFetch({
      path: `/companies/${id}/live`,
      authenticated: true,
      headers: { accept: 'text/event-stream' },
      signal: ctrl.signal,
    })

    if (ctrl.signal.aborted) {
      void response?.body?.cancel().catch(() => undefined)
      return
    }

    if (!response) {
      // Pas de jeton : inutile de réessayer. Sinon le serveur est injoignable.
      if (authState.token.value) {
        lost()
      } else {
        void sessionLost('unauthorized')
      }
      return
    }

    if (!response.ok) {
      const { status } = response

      if (status === 401) {
        // Une seule relance par refus : si `/me` confirme la session, le flux a été refusé à tort.
        const retryId = unauthorizedRetried ? undefined : id

        unauthorizedRetried = true
        void sessionLost('unauthorized', retryId)
      } else if (status === 403) {
        fail('forbidden')
      } else if (status === 429) {
        // Le serveur libère les flux morts au bout de plusieurs minutes : on réessaie au dernier
        // palier d'attente, en gardant le message à l'écran.
        attempt = RECONNECT_DELAYS_MS.length
        lost('too_many_streams')
      } else if (status >= 500) {
        lost()
      } else {
        fail('server_error')
      }
      return
    }

    if (!response.body) {
      lost()
      return
    }

    openedAt = Date.now()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parse = createSseParser((message) => {
      if (!ctrl.signal.aborted) {
        handleMessage(message)
      }
    })

    ctrl.signal.addEventListener('abort', () => void reader.cancel().catch(() => undefined))

    try {
      for (;;) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        armSilence()
        parse(decoder.decode(value, { stream: true }))
      }
    } catch {
      // Flux interrompu : même traitement qu'une fermeture par le serveur.
    }

    lost()
  }

  function start(id: number | null): void {
    close()
    currentId = id
    attempt = 0
    unauthorizedRetried = false
    rooms.value = {}

    if (id === null) {
      // Pas de compagnie : rien à afficher, sauf une erreur qui vient de se produire (la fin de
      // session vide le compte, donc la compagnie, juste après l'erreur : elle doit rester lisible).
      if (state.value !== 'error') {
        errorKey.value = null
        state.value = 'idle'
      }
      return
    }

    open(id)
  }

  function open(id: number): void {
    errorKey.value = null
    state.value = 'connecting'
    now.value = Date.now()
    clockTimer = setInterval(() => {
      now.value = Date.now()
    }, CLOCK_TICK_MS)
    document.addEventListener('visibilitychange', onVisible)
    void run(id)
  }

  /**
   * Envoie une commande à la salle (`POST …/rooms/:id/commands`, `202` dit seulement « partie ») puis
   * attend son résultat sur ce flux. Sans résultat à temps, la commande est donnée pour `expired`.
   */
  function sendCommand(roomId: number, command: PanelRoomCommand): Promise<RoomCommandOutcome> {
    const company = currentId

    if (company === null) {
      return Promise.resolve({ result: 'error', code: 'room_not_controllable' })
    }

    // `randomUUID` n'existe que dans un contexte sécurisé (HTTPS, localhost).
    let commandId: string

    try {
      commandId = crypto.randomUUID()
    } catch {
      return Promise.resolve({ result: 'error', code: 'server_error' })
    }

    return new Promise((resolve) => {
      const settle = (outcome: RoomCommandOutcome): void => {
        clearTimeout(timer)
        pendingCommands.delete(commandId)
        resolve(outcome)
      }
      const timer = setTimeout(
        () => settle({ result: ROOM_COMMAND_RESULT.EXPIRED }),
        ROOM_COMMAND_TIMEOUT_MS + COMMAND_RESULT_GRACE_MS
      )

      // Enregistrée avant l'envoi : le résultat peut arriver avant la réponse `202`.
      pendingCommands.set(commandId, settle)

      const post = () =>
        apiFetch({
          path: `/companies/${company}/rooms/${roomId}/commands`,
          method: 'POST',
          authenticated: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commandId, ...command }),
        })

      void (async () => {
        let response = await post()

        if (!response) {
          if (!authState.token.value) {
            settle({ result: 'error', code: 'unauthorized' })
            return
          }

          // Réponse perdue : la requête a pu arriver. Le serveur répond à l'identique à un
          // doublon (même `commandId`), donc on réessaie une fois. Si cela échoue encore, on
          // garde l'attente : le résultat viendra du flux, ou `expired` au délai local.
          if (!pendingCommands.has(commandId)) {
            return
          }

          response = await post()
        }

        if (response && !response.ok) {
          if (response.status === 401) {
            void refreshMe()
          }

          settle({ result: 'error', code: await readCommandErrorCode(response) })
        }
      })()
    })
  }

  const stopWatching = watch(() => toValue(companyId), start, { immediate: true })

  function stop(): void {
    stopWatching()
    close()
    // Plus de flux pour recevoir les résultats : les commandes en attente sont sans réponse.
    for (const settle of [...pendingCommands.values()]) {
      settle({ result: ROOM_COMMAND_RESULT.EXPIRED })
    }
    // Une réponse de `/me` qui arrive après l'arrêt ne doit rien relancer.
    currentId = null
  }

  if (getCurrentScope()) {
    onScopeDispose(stop)
  }

  return { rooms, state, errorKey, uncertain, now, sendCommand, stop }
}
