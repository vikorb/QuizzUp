import {
  refreshMeMock,
  setAuthenticatedUser,
  setUnauthenticated,
  tokenMock,
} from '@frontend-tests/_helpers/authStateMock'
import {
  createDeferred,
  createLiveStream,
  createRoomLive,
  jsonErrorResponse,
  roomStatusEvent,
  snapshotEvent,
  sseEvent,
} from '@frontend-tests/_helpers/liveMock'
import {
  LIVE_EVENT,
  LIVE_HEARTBEAT_MS,
  ROOM_COMMAND_TIMEOUT_MS,
  ROOM_PRESENCE,
} from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type EffectScope, effectScope, ref } from 'vue'

import type * as UseLiveCompanyModule from '@/composables/useLiveCompany'
import type { PanelRoomCommand } from '@/composables/useLiveCompany'

// Contourne le mock global (registerFrontendMocks) pour tester le vrai composable.
const { useLiveCompany } = await vi.importActual<typeof UseLiveCompanyModule>(
  '@/composables/useLiveCompany'
)

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('@/utils/api', () => ({ apiFetch: apiFetchMock }))

type FetchOptions = { path: string; authenticated: boolean; signal: AbortSignal }

const scopes: EffectScope[] = []

function mountLive(companyId: number | null = 1, options?: Parameters<typeof useLiveCompany>[1]) {
  const id = ref<number | null>(companyId)
  const scope = effectScope()
  const live = scope.run(() => useLiveCompany(() => id.value, options))

  if (!live) {
    throw new Error('composable not created')
  }

  scopes.push(scope)

  return { id, scope, live }
}

/** Enchaîne les micro-tâches (lecture du flux) sans avancer l'horloge. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

function fetchCall(index: number): FetchOptions {
  return apiFetchMock.mock.calls[index][0] as FetchOptions
}

/** Programme le prochain appel du composable sur un flux piloté par le test. */
function nextStream() {
  const stream = createLiveStream()

  apiFetchMock.mockResolvedValueOnce(stream.response)

  return stream
}

function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  apiFetchMock.mockReset()
  refreshMeMock.mockClear()
  tokenMock.value = 'staff-token'
})

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  Reflect.deleteProperty(document, 'visibilityState')
  vi.useRealTimers()
})

/** Flux ouvert sur la compagnie 7 ; la réponse du POST se programme ensuite. */
async function openStream() {
  const stream = nextStream()
  const { live } = mountLive(7)

  stream.push(snapshotEvent([createRoomLive({ roomId: 10 })]))
  await settle()

  return { stream, live }
}

const resultEvent = (commandId: string, payload: Record<string, unknown>) =>
  sseEvent(LIVE_EVENT.COMMAND_RESULT, { commandId, roomId: 10, command: 'pause', ...payload })

describe('composables/useLiveCompany', () => {
  it('opens the company stream through apiFetch, never with a token in the URL', async () => {
    nextStream()
    mountLive(7)
    await settle()

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(fetchCall(0)).toMatchObject({ path: '/companies/7/live', authenticated: true })
    expect(fetchCall(0).path).not.toContain('staff-token')
  })

  it('does not open anything without a company', async () => {
    const { live } = mountLive(null)

    await settle()

    expect(apiFetchMock).not.toHaveBeenCalled()
    // Rien à suivre : un état neutre, que l'écran n'affiche pas.
    expect(live.state.value).toBe('idle')
    expect(live.errorKey.value).toBeNull()
    expect(live.uncertain.value).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('goes idle, without error, when the company disappears from a healthy stream', async () => {
    const stream = nextStream()
    const { live, id } = mountLive()

    stream.push(snapshotEvent([createRoomLive()]))
    await settle()
    id.value = null
    await settle()

    expect(live.state.value).toBe('idle')
    expect(live.errorKey.value).toBeNull()
    expect(live.rooms.value).toEqual({})
    expect(stream.cancelled).toBe(true)
  })

  it('replaces the table with the snapshot, then applies room_status', async () => {
    const stream = nextStream()
    const { live } = mountLive()

    expect(live.state.value).toBe('connecting')
    expect(live.uncertain.value).toBe(true)

    stream.push(
      snapshotEvent([
        createRoomLive({ roomId: 10 }),
        createRoomLive({ roomId: 11, presence: ROOM_PRESENCE.OFFLINE }),
      ])
    )
    await settle()

    expect(live.state.value).toBe('live')
    expect(live.uncertain.value).toBe(false)
    expect(Object.keys(live.rooms.value)).toEqual(['10', '11'])

    stream.push(roomStatusEvent(createRoomLive({ roomId: 11, presence: ROOM_PRESENCE.IN_GAME })))
    await settle()

    expect(live.rooms.value[11].presence).toBe(ROOM_PRESENCE.IN_GAME)
    expect(live.rooms.value[10].presence).toBe(ROOM_PRESENCE.ONLINE)

    stream.push(snapshotEvent([createRoomLive({ roomId: 12 })]))
    await settle()

    expect(Object.keys(live.rooms.value)).toEqual(['12'])
  })

  it('reads events cut at any position, even inside a multi-byte character', async () => {
    const stream = nextStream()
    const { live } = mountLive()
    const lastSeenAt = '2026-11-23T10:00:00.000Z é'
    const bytes = new TextEncoder().encode(
      snapshotEvent([createRoomLive({ roomId: 10, lastSeenAt })])
    )

    // Un octet à la fois : « é » (deux octets) est coupé en deux.
    for (const byte of bytes) {
      stream.push(Uint8Array.of(byte))
    }
    await settle()

    expect(live.state.value).toBe('live')
    expect(live.rooms.value[10].lastSeenAt).toBe(lastSeenAt)
  })

  it('tells the caller which game changed on game_updated, and ignores a malformed one', async () => {
    const onGameUpdated = vi.fn()
    const stream = nextStream()

    mountLive(7, { onGameUpdated })
    stream.push(snapshotEvent([createRoomLive({ roomId: 10 })]))
    stream.push(sseEvent(LIVE_EVENT.GAME_UPDATED, { gameId: 42 }))
    stream.push(sseEvent(LIVE_EVENT.GAME_UPDATED, { gameId: 'x' }))
    stream.push('event: game_updated\ndata: {oops\n\n')
    await settle()

    expect(onGameUpdated.mock.calls).toEqual([[42]])
  })

  it('tells the caller which room changed on schedule_changed, and ignores a malformed one', async () => {
    const onScheduleChanged = vi.fn()
    const stream = nextStream()

    mountLive(7, { onScheduleChanged })
    stream.push(snapshotEvent([createRoomLive({ roomId: 10 })]))
    stream.push(sseEvent(LIVE_EVENT.SCHEDULE_CHANGED, { roomId: 10 }))
    stream.push(sseEvent(LIVE_EVENT.SCHEDULE_CHANGED, { roomId: 'x' }))
    stream.push('event: schedule_changed\ndata: {oops\n\n')
    await settle()

    expect(onScheduleChanged.mock.calls).toEqual([[10]])
  })

  it('does not fail on schedule_changed when nobody listens', async () => {
    const stream = nextStream()
    const { live } = mountLive(7)

    stream.push(snapshotEvent([]))
    stream.push(sseEvent(LIVE_EVENT.SCHEDULE_CHANGED, { roomId: 10 }))
    await settle()

    expect(live.state.value).toBe('live')
  })

  it('does not fail on game_updated when nobody listens', async () => {
    const stream = nextStream()
    const { live } = mountLive(7)

    stream.push(snapshotEvent([]))
    stream.push(sseEvent(LIVE_EVENT.GAME_UPDATED, { gameId: 42 }))
    await settle()

    expect(live.state.value).toBe('live')
  })

  it('ignores a room_status for a room it does not know', async () => {
    const stream = nextStream()
    const { live } = mountLive()

    stream.push(snapshotEvent([createRoomLive({ roomId: 10 })]))
    stream.push(roomStatusEvent(createRoomLive({ roomId: 99 })))
    await settle()

    expect(Object.keys(live.rooms.value)).toEqual(['10'])
    expect(live.state.value).toBe('live')
    expect(live.errorKey.value).toBeNull()
  })

  it('ignores malformed events and keeps the stream open', async () => {
    const stream = nextStream()
    const { live } = mountLive()

    stream.push('event: snapshot\ndata: {pas du json\n\n')
    stream.push(sseEvent(LIVE_EVENT.SNAPSHOT, { rooms: 'nope' }))
    await settle()

    expect(live.state.value).toBe('connecting')
    expect(stream.cancelled).toBe(false)

    stream.push(snapshotEvent([createRoomLive()]))
    await settle()

    expect(live.state.value).toBe('live')
  })

  it('reconnects after 1, 2, 5, 10 then 30 seconds, and keeps 30 seconds', async () => {
    nextStream().end()
    const { live } = mountLive()

    // Le serveur ferme chaque flux aussitôt : pas de `snapshot`, donc pas de remise à zéro.
    await settle()
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(live.state.value).toBe('reconnecting')

    for (const [index, delay] of [1_000, 2_000, 5_000, 10_000, 30_000, 30_000].entries()) {
      nextStream().end()

      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(apiFetchMock).toHaveBeenCalledTimes(index + 1)

      await vi.advanceTimersByTimeAsync(1)
      expect(apiFetchMock).toHaveBeenCalledTimes(index + 2)

      await settle()
      expect(live.state.value).toBe('reconnecting')
    }
  })

  it('resets the reconnection delay to 1 second after a snapshot', async () => {
    nextStream().end()
    mountLive()
    await settle()
    nextStream().end()
    await vi.advanceTimersByTimeAsync(1_000)
    await settle()
    const healthy = nextStream()

    await vi.advanceTimersByTimeAsync(2_000)
    expect(apiFetchMock).toHaveBeenCalledTimes(3)

    healthy.push(snapshotEvent([createRoomLive()]))
    await settle()
    await vi.advanceTimersByTimeAsync(LIVE_HEARTBEAT_MS)
    healthy.end()
    await settle()
    nextStream()
    // Sans remise à zéro, l'attente suivante serait de 5 s.
    await vi.advanceTimersByTimeAsync(1_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(4)
  })

  it('keeps growing the delay when the server closes each stream right after its snapshot', async () => {
    for (let index = 0; index < 3; index += 1) {
      const stream = nextStream()

      stream.push(snapshotEvent([createRoomLive()]))
      stream.end()
    }
    mountLive()
    await settle()
    expect(apiFetchMock).toHaveBeenCalledTimes(1)

    // 1 s puis 2 s : une remise à zéro à chaque `snapshot` ferait réessayer toutes les secondes.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(apiFetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1_999)
    expect(apiFetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)
    expect(apiFetchMock).toHaveBeenCalledTimes(3)
  })

  it('marks the last known presences as uncertain while the stream is cut', async () => {
    const first = nextStream()
    const { live } = mountLive()

    first.push(snapshotEvent([createRoomLive({ roomId: 10 })]))
    await settle()
    expect(live.uncertain.value).toBe(false)

    first.end()
    await settle()

    expect(live.state.value).toBe('reconnecting')
    expect(live.uncertain.value).toBe(true)
    expect(live.rooms.value[10].presence).toBe(ROOM_PRESENCE.ONLINE)

    const second = nextStream()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(live.uncertain.value).toBe(true)

    second.push(snapshotEvent([createRoomLive({ roomId: 10, presence: ROOM_PRESENCE.OFFLINE })]))
    await settle()

    expect(live.uncertain.value).toBe(false)
    expect(live.rooms.value[10].presence).toBe(ROOM_PRESENCE.OFFLINE)
  })

  it('treats a stream silent for three heartbeats as cut and reopens it', async () => {
    const stream = nextStream()
    const { live } = mountLive()

    stream.push(snapshotEvent([createRoomLive()]))
    await settle()
    await vi.advanceTimersByTimeAsync(3 * LIVE_HEARTBEAT_MS - 1)

    expect(live.state.value).toBe('live')

    await vi.advanceTimersByTimeAsync(1)

    expect(live.state.value).toBe('reconnecting')
    expect(live.uncertain.value).toBe(true)
    expect(stream.cancelled).toBe(true)

    nextStream()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the stream open as long as pings arrive', async () => {
    const stream = nextStream()
    const { live } = mountLive()

    stream.push(snapshotEvent([createRoomLive()]))
    await settle()

    for (let ping = 0; ping < 6; ping += 1) {
      await vi.advanceTimersByTimeAsync(LIVE_HEARTBEAT_MS)
      stream.push(': ping\n\n')
      await settle()
    }

    expect(live.state.value).toBe('live')
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a 429 too_many_streams every 30 seconds, keeping the message until it works', async () => {
    apiFetchMock.mockImplementation(async () => jsonErrorResponse(429, 'too_many_streams'))
    const { live } = mountLive()

    await settle()
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(live.state.value).toBe('reconnecting')
    expect(live.errorKey.value).toBe('errors.too_many_streams')
    expect(live.uncertain.value).toBe(true)

    // Dernier palier d'emblée (le serveur libère les flux morts au bout de plusieurs minutes).
    await vi.advanceTimersByTimeAsync(29_999)
    expect(apiFetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(live.errorKey.value).toBe('errors.too_many_streams')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(apiFetchMock).toHaveBeenCalledTimes(3)

    const stream = createLiveStream()

    apiFetchMock.mockImplementation(async () => stream.response)
    await vi.advanceTimersByTimeAsync(30_000)
    stream.push(snapshotEvent([createRoomLive()]))
    await settle()

    expect(live.state.value).toBe('live')
    expect(live.errorKey.value).toBeNull()
    expect(refreshMeMock).not.toHaveBeenCalled()
  })

  it('drops a stale error message when a later cut has another cause', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(429, 'too_many_streams'))
    const { live } = mountLive()

    await settle()
    expect(live.errorKey.value).toBe('errors.too_many_streams')

    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(503, 'server_error'))
    await vi.advanceTimersByTimeAsync(30_000)

    expect(live.state.value).toBe('reconnecting')
    expect(live.errorKey.value).toBeNull()
  })

  it('stops on 403 with the forbidden message', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(403, 'forbidden'))
    const { live } = mountLive()

    await vi.advanceTimersByTimeAsync(120_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(live.state.value).toBe('error')
    expect(live.errorKey.value).toBe('errors.forbidden')
    expect(refreshMeMock).not.toHaveBeenCalled()
  })

  it('stops on 401 and asks /me to confirm the session, like the rest of the application', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(401, 'unauthorized'))
    const { live } = mountLive()

    await vi.advanceTimersByTimeAsync(120_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(live.state.value).toBe('error')
    expect(live.errorKey.value).toBe('errors.unauthorized')
    expect(refreshMeMock).toHaveBeenCalledTimes(1)
  })

  it('reopens the stream once when /me says the session is still valid after a 401', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(401, 'unauthorized'))
    refreshMeMock.mockResolvedValueOnce(setAuthenticatedUser())
    const stream = nextStream()
    const { live } = mountLive()

    await settle()

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(live.state.value).toBe('connecting')
    expect(live.errorKey.value).toBeNull()

    stream.push(snapshotEvent([createRoomLive()]))
    await settle()

    expect(live.state.value).toBe('live')
    setUnauthenticated()
  })

  it('does not loop on 401: a second refusal in a row stops on the error', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(401, 'unauthorized'))
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(401, 'unauthorized'))
    refreshMeMock.mockResolvedValueOnce(setAuthenticatedUser())
    refreshMeMock.mockResolvedValueOnce(setAuthenticatedUser())
    const { live } = mountLive()

    await vi.advanceTimersByTimeAsync(120_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(refreshMeMock).toHaveBeenCalledTimes(2)
    expect(live.state.value).toBe('error')
    expect(live.errorKey.value).toBe('errors.unauthorized')
    expect(vi.getTimerCount()).toBe(0)
    setUnauthenticated()
  })

  it('does not reopen after a 401 if the scope was stopped while /me was answering', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(401, 'unauthorized'))
    const account = setAuthenticatedUser()
    let answer: (() => void) | undefined

    refreshMeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(account)
        })
    )
    const { live } = mountLive()

    await settle()
    live.stop()
    answer?.()
    await vi.advanceTimersByTimeAsync(120_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    setUnauthenticated()
  })

  it('keeps the end-of-session message when /me then empties the account and the company', async () => {
    const stream = nextStream()
    const { live, id } = mountLive()

    // Comme en production : /me répond 401, le jeton est vidé, la compagnie passe à `null`.
    refreshMeMock.mockImplementationOnce(async () => {
      tokenMock.value = null
      id.value = null
      return null
    })
    stream.push(sseEvent(LIVE_EVENT.SESSION_ENDED, { error: 'unauthorized' }))
    await vi.advanceTimersByTimeAsync(1_000)

    expect(id.value).toBeNull()
    expect(live.state.value).toBe('error')
    expect(live.errorKey.value).toBe('errors.session_ended')
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops on session_ended, drops the stream and asks /me to confirm the session', async () => {
    const stream = nextStream()
    const { live } = mountLive()

    // Un événement qui suit `session_ended` dans le même morceau n'est plus pris en compte.
    stream.push(
      snapshotEvent([createRoomLive()]) +
        sseEvent(LIVE_EVENT.SESSION_ENDED, { error: 'unauthorized' }) +
        roomStatusEvent(createRoomLive({ presence: ROOM_PRESENCE.OFFLINE }))
    )
    await vi.advanceTimersByTimeAsync(120_000)

    expect(live.state.value).toBe('error')
    expect(live.errorKey.value).toBe('errors.session_ended')
    expect(live.uncertain.value).toBe(true)
    expect(live.rooms.value[10].presence).toBe(ROOM_PRESENCE.ONLINE)
    expect(stream.cancelled).toBe(true)
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(refreshMeMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries after a 5xx response but gives up on another client error', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(503, 'server_error'))
    const { live } = mountLive()

    await settle()
    expect(live.state.value).toBe('reconnecting')

    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(400, 'invalid_params'))
    await vi.advanceTimersByTimeAsync(1_000)

    expect(live.state.value).toBe('error')
    expect(live.errorKey.value).toBe('errors.server_error')

    await vi.advanceTimersByTimeAsync(120_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries when the API is unreachable, but stops when the token is gone', async () => {
    apiFetchMock.mockResolvedValueOnce(null)
    const { live } = mountLive()

    await settle()
    expect(live.state.value).toBe('reconnecting')

    tokenMock.value = null
    apiFetchMock.mockResolvedValueOnce(null)
    await vi.advanceTimersByTimeAsync(1_000)

    expect(live.state.value).toBe('error')
    expect(live.errorKey.value).toBe('errors.unauthorized')
    expect(refreshMeMock).toHaveBeenCalledTimes(1)
  })

  it('reopens at once when the tab is shown again while waiting to reconnect', async () => {
    nextStream().end()
    mountLive()
    await settle()
    expect(apiFetchMock).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    await settle()
    expect(apiFetchMock).toHaveBeenCalledTimes(1)

    nextStream()
    setVisibility('visible')
    await settle()
    expect(apiFetchMock).toHaveBeenCalledTimes(2)

    // La minuterie de la tentative remplacée a été retirée : pas de troisième ouverture.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(apiFetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not reopen a healthy stream when the tab is shown again', async () => {
    const stream = nextStream()

    mountLive()
    stream.push(snapshotEvent([createRoomLive()]))
    await settle()
    setVisibility('visible')
    await settle()

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not reopen a stopped stream (error) when the tab is shown again', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(403, 'forbidden'))
    mountLive()
    await settle()

    setVisibility('visible')
    await settle()

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves no request, timer or listener behind when the scope is stopped', async () => {
    const stream = nextStream()
    const { scope } = mountLive()

    stream.push(snapshotEvent([createRoomLive()]))
    await settle()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    scope.stop()
    await settle()

    expect(fetchCall(0).signal.aborted).toBe(true)
    expect(stream.cancelled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves no timer behind when stopped while waiting to reconnect', async () => {
    nextStream().end()
    const { live } = mountLive()

    await settle()
    expect(live.state.value).toBe('reconnecting')

    live.stop()

    expect(vi.getTimerCount()).toBe(0)

    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it('closes a response that arrives after the stop', async () => {
    const late = createLiveStream()

    // La réponse n'arrive que 100 ms plus tard, une fois l'arrêt demandé.
    apiFetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(late.response), 100))
    )
    const { scope } = mountLive()

    scope.stop()
    await vi.advanceTimersByTimeAsync(100)

    expect(late.cancelled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('closes the old stream and starts from scratch when the company changes', async () => {
    const first = nextStream()
    const { live, id } = mountLive(1)

    first.push(snapshotEvent([createRoomLive({ roomId: 10 })]))
    await settle()

    const second = nextStream()

    id.value = 2
    await settle()

    expect(fetchCall(0).signal.aborted).toBe(true)
    expect(first.cancelled).toBe(true)
    expect(fetchCall(1).path).toBe('/companies/2/live')
    expect(live.rooms.value).toEqual({})
    expect(live.state.value).toBe('connecting')

    second.push(snapshotEvent([createRoomLive({ roomId: 20 })]))
    await settle()

    expect(Object.keys(live.rooms.value)).toEqual(['20'])
    expect(live.state.value).toBe('live')
  })

  it('cancels the reconnection of the old company when the company changes', async () => {
    nextStream().end()
    const { id } = mountLive(1)

    await settle()
    nextStream()
    id.value = 2
    await vi.advanceTimersByTimeAsync(20_000)

    // Un appel pour la compagnie 1, un pour la 2 : la tentative en attente de la 1 est annulée.
    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(fetchCall(1).path).toBe('/companies/2/live')
  })

  it('refreshes the clock used for "seen ago"', async () => {
    nextStream()
    const { live } = mountLive()
    const start = live.now.value

    await vi.advanceTimersByTimeAsync(30_000)

    expect(live.now.value).toBe(start + 30_000)
  })

  describe('sendCommand', () => {
    type PostOptions = FetchOptions & { method: string; body: string }

    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

    /** Identifiant de la commande envoyée par l'appel `index` d'`apiFetch` (0 = le flux). */
    const sentId = (index: number) =>
      (JSON.parse((fetchCall(index) as PostOptions).body) as { commandId: string }).commandId

    it.each<PanelRoomCommand>([
      { command: 'pause' },
      { command: 'resume' },
      { command: 'skip', round: 2, questionIndex: 3 },
    ])('posts « $command » with a fresh uuid and only its own fields', async (command) => {
      const { stream, live } = await openStream()

      apiFetchMock.mockResolvedValueOnce(new Response('{"commandId":"x"}', { status: 202 }))

      const outcome = live.sendCommand(10, command)

      await settle()

      const { commandId, ...fields } = JSON.parse((fetchCall(1) as PostOptions).body) as {
        commandId: string
      }

      expect(fetchCall(1)).toMatchObject({
        path: '/companies/7/rooms/10/commands',
        method: 'POST',
        authenticated: true,
      })
      expect(commandId).toMatch(UUID)
      expect(fields).toEqual(command)

      stream.push(resultEvent(commandId, { result: 'applied' }))

      await expect(outcome).resolves.toEqual({ result: 'applied' })
    })

    it('uses a different identifier for each command', async () => {
      await openStream().then(async ({ live }) => {
        apiFetchMock.mockResolvedValue(new Response('{}', { status: 202 }))
        void live.sendCommand(10, { command: 'pause' })
        void live.sendCommand(10, { command: 'pause' })
        await settle()
      })

      expect(sentId(1)).not.toBe(sentId(2))
    })

    it('gives the refusal reason sent by the room, and drops a reason it does not know', async () => {
      const { stream, live } = await openStream()

      apiFetchMock.mockResolvedValue(new Response('{}', { status: 202 }))

      const refused = live.sendCommand(10, { command: 'resume' })
      const odd = live.sendCommand(10, { command: 'pause' })

      await settle()
      stream.push(resultEvent(sentId(1), { result: 'refused', reason: 'not_paused' }))
      stream.push(resultEvent(sentId(2), { result: 'refused', reason: 'something_new' }))

      await expect(refused).resolves.toEqual({ result: 'refused', reason: 'not_paused' })
      await expect(odd).resolves.toEqual({ result: 'refused' })
    })

    it('gives expired when the server says so', async () => {
      const { stream, live } = await openStream()

      apiFetchMock.mockResolvedValueOnce(new Response('{}', { status: 202 }))

      const outcome = live.sendCommand(10, { command: 'pause' })

      await settle()
      stream.push(resultEvent(sentId(1), { result: 'expired' }))

      await expect(outcome).resolves.toEqual({ result: 'expired' })
    })

    it('ignores the result of a command it did not send, and a malformed result', async () => {
      const { stream, live } = await openStream()
      let done = false

      apiFetchMock.mockResolvedValueOnce(new Response('{}', { status: 202 }))

      const outcome = live.sendCommand(10, { command: 'pause' }).then((value) => {
        done = true

        return value
      })

      await settle()
      stream.push(resultEvent(crypto.randomUUID(), { result: 'applied' }))
      stream.push(resultEvent(sentId(1), { result: 'bogus' }))
      await settle()

      expect(done).toBe(false)

      stream.push(resultEvent(sentId(1), { result: 'applied' }))

      await expect(outcome).resolves.toEqual({ result: 'applied' })
    })

    it('keeps a result that arrives before the 202 answer', async () => {
      const { stream, live } = await openStream()
      const gate = createDeferred<Response>()

      apiFetchMock.mockReturnValueOnce(gate.promise)

      const outcome = live.sendCommand(10, { command: 'pause' })

      await settle()
      stream.push(resultEvent(sentId(1), { result: 'applied' }))
      await settle()
      gate.resolve(new Response('{}', { status: 202 }))

      await expect(outcome).resolves.toEqual({ result: 'applied' })
    })

    it('concludes expired by itself when no result comes, a little after the server delay', async () => {
      const { live } = await openStream()
      let done = false

      apiFetchMock.mockResolvedValueOnce(new Response('{}', { status: 202 }))

      const outcome = live.sendCommand(10, { command: 'pause' }).then((value) => {
        done = true

        return value
      })

      await vi.advanceTimersByTimeAsync(ROOM_COMMAND_TIMEOUT_MS)
      expect(done).toBe(false)

      await vi.advanceTimersByTimeAsync(2_000)

      await expect(outcome).resolves.toEqual({ result: 'expired' })
    })

    it('gives expired to the commands still waiting when the follow-up stops', async () => {
      const { live } = await openStream()

      apiFetchMock.mockResolvedValueOnce(new Response('{}', { status: 202 }))

      const outcome = live.sendCommand(10, { command: 'pause' })

      await settle()
      live.stop()

      await expect(outcome).resolves.toEqual({ result: 'expired' })
    })

    it.each([
      [409, 'room_not_controllable', 'room_not_controllable'],
      [409, 'command_id_conflict', 'command_id_conflict'],
      [429, 'too_many_requests', 'too_many_requests'],
      [403, 'forbidden', 'forbidden'],
      [401, 'unauthorized', 'unauthorized'],
      [401, 'session_expired_inactive', 'unauthorized'],
      [401, 'session_invalid', 'unauthorized'],
      [403, 'account_inactive', 'forbidden'],
      [429, 'rate_limited', 'too_many_requests'],
      [404, 'room_not_found', 'room_not_found'],
      [404, 'something_else', 'room_not_found'],
      [500, 'boom', 'server_error'],
      [400, 'invalid_body', 'server_error'],
    ])(
      'answers the HTTP error %i « %s » with the code %s, without waiting',
      async (status, error, code) => {
        const { live } = await openStream()

        apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(status, error))

        await expect(live.sendCommand(10, { command: 'pause' })).resolves.toEqual({
          result: 'error',
          code,
        })
      }
    )

    it('answers server_error when the error has no readable body', async () => {
      const { live } = await openStream()

      apiFetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }))

      await expect(live.sendCommand(10, { command: 'pause' })).resolves.toEqual({
        result: 'error',
        code: 'server_error',
      })
    })

    it('asks /me to confirm the session after a 401, like the rest of the application', async () => {
      const { live } = await openStream()

      apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(401, 'session_expired_inactive'))
      refreshMeMock.mockClear()

      await live.sendCommand(10, { command: 'pause' })

      expect(refreshMeMock).toHaveBeenCalledTimes(1)
    })

    it('does not ask /me after another error', async () => {
      const { live } = await openStream()

      apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(403, 'forbidden'))
      refreshMeMock.mockClear()

      await live.sendCommand(10, { command: 'pause' })

      expect(refreshMeMock).not.toHaveBeenCalled()
    })

    it('sends the same request again, same identifier, when the answer is lost', async () => {
      const { stream, live } = await openStream()

      apiFetchMock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(new Response('{}', { status: 202 }))

      const outcome = live.sendCommand(10, { command: 'pause' })

      await settle()

      expect(apiFetchMock).toHaveBeenCalledTimes(3)
      expect(sentId(2)).toBe(sentId(1))
      expect((fetchCall(2) as PostOptions).body).toBe((fetchCall(1) as PostOptions).body)

      stream.push(resultEvent(sentId(1), { result: 'applied' }))

      await expect(outcome).resolves.toEqual({ result: 'applied' })
    })

    it('does not send twice when the answer is lost after the room already answered', async () => {
      const { stream, live } = await openStream()
      const gate = createDeferred<Response | null>()

      apiFetchMock.mockReturnValueOnce(gate.promise)

      const outcome = live.sendCommand(10, { command: 'pause' })

      await settle()
      stream.push(resultEvent(sentId(1), { result: 'applied' }))
      await expect(outcome).resolves.toEqual({ result: 'applied' })

      gate.resolve(null)
      await settle()

      expect(apiFetchMock).toHaveBeenCalledTimes(2)
    })

    it('gives the error of the second attempt when the server answers it with one', async () => {
      const { live } = await openStream()

      apiFetchMock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(jsonErrorResponse(409, 'command_id_conflict'))

      await expect(live.sendCommand(10, { command: 'pause' })).resolves.toEqual({
        result: 'error',
        code: 'command_id_conflict',
      })
    })

    it('keeps waiting after two lost answers, and takes the result sent by the stream', async () => {
      const { stream, live } = await openStream()
      let done = false

      apiFetchMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

      const outcome = live.sendCommand(10, { command: 'pause' }).then((value) => {
        done = true

        return value
      })

      await settle()

      expect(apiFetchMock).toHaveBeenCalledTimes(3)
      expect(done).toBe(false)

      stream.push(resultEvent(sentId(1), { result: 'applied' }))

      await expect(outcome).resolves.toEqual({ result: 'applied' })
    })

    it('concludes expired at the local delay after two lost answers', async () => {
      const { live } = await openStream()
      let done = false

      apiFetchMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

      const outcome = live.sendCommand(10, { command: 'pause' }).then((value) => {
        done = true

        return value
      })

      await vi.advanceTimersByTimeAsync(ROOM_COMMAND_TIMEOUT_MS)
      expect(done).toBe(false)

      await vi.advanceTimersByTimeAsync(2_000)

      await expect(outcome).resolves.toEqual({ result: 'expired' })
    })

    it('answers unauthorized, without a second attempt, when there is no token', async () => {
      const { live } = await openStream()

      tokenMock.value = null
      apiFetchMock.mockResolvedValueOnce(null)

      await expect(live.sendCommand(10, { command: 'pause' })).resolves.toEqual({
        result: 'error',
        code: 'unauthorized',
      })
      expect(apiFetchMock).toHaveBeenCalledTimes(2)
    })

    it('answers server_error instead of rejecting when randomUUID is not available', async () => {
      const { live } = await openStream()
      const randomUUID = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
        throw new TypeError('crypto.randomUUID is not a function')
      })

      try {
        await expect(live.sendCommand(10, { command: 'pause' })).resolves.toEqual({
          result: 'error',
          code: 'server_error',
        })
        expect(apiFetchMock).toHaveBeenCalledTimes(1)
      } finally {
        randomUUID.mockRestore()
      }
    })

    it('sends nothing without a company', async () => {
      const { live } = mountLive(null)

      await expect(live.sendCommand(10, { command: 'pause' })).resolves.toEqual({
        result: 'error',
        code: 'room_not_controllable',
      })
      expect(apiFetchMock).not.toHaveBeenCalled()
    })
  })
})
