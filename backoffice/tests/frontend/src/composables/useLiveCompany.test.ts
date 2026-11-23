import { refreshMeMock, tokenMock } from '@frontend-tests/_helpers/authStateMock'
import {
  createLiveStream,
  createRoomLive,
  jsonErrorResponse,
  roomStatusEvent,
  snapshotEvent,
  sseEvent,
} from '@frontend-tests/_helpers/liveMock'
import { LIVE_EVENT, LIVE_HEARTBEAT_MS, ROOM_PRESENCE } from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type EffectScope, effectScope, ref } from 'vue'

import type * as UseLiveCompanyModule from '@/composables/useLiveCompany'

// Contourne le mock global (registerFrontendMocks) pour tester le vrai composable.
const { useLiveCompany } = await vi.importActual<typeof UseLiveCompanyModule>(
  '@/composables/useLiveCompany'
)

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('@/utils/api', () => ({ apiFetch: apiFetchMock }))

type FetchOptions = { path: string; authenticated: boolean; signal: AbortSignal }

const scopes: EffectScope[] = []

function mountLive(companyId: number | null = 1) {
  const id = ref<number | null>(companyId)
  const scope = effectScope()
  const live = scope.run(() => useLiveCompany(() => id.value))

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
    expect(live.state.value).toBe('connecting')
    expect(live.uncertain.value).toBe(true)
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
    healthy.end()
    await settle()
    nextStream()
    // Sans remise à zéro, l'attente suivante serait de 5 s.
    await vi.advanceTimersByTimeAsync(1_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(4)
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

  it('stops on 429 too_many_streams without reconnecting in a loop', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(429, 'too_many_streams'))
    const { live } = mountLive()

    await vi.advanceTimersByTimeAsync(120_000)

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(live.state.value).toBe('error')
    expect(live.errorKey.value).toBe('errors.too_many_streams')
    expect(live.uncertain.value).toBe(true)
    expect(refreshMeMock).not.toHaveBeenCalled()
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
    apiFetchMock.mockResolvedValueOnce(jsonErrorResponse(429, 'too_many_streams'))
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
})
