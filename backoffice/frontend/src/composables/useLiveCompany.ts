import {
  createSseParser,
  LIVE_EVENT,
  LIVE_HEARTBEAT_MS,
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
export function useLiveCompany(companyId: MaybeRefOrGetter<number | null>) {
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

  const stopWatching = watch(() => toValue(companyId), start, { immediate: true })

  function stop(): void {
    stopWatching()
    close()
    // Une réponse de `/me` qui arrive après l'arrêt ne doit rien relancer.
    currentId = null
  }

  if (getCurrentScope()) {
    onScopeDispose(stop)
  }

  return { rooms, state, errorKey, uncertain, now, stop }
}
