import { setAuthenticatedAdmin, tokenMock } from '@frontend-tests/_helpers/authStateMock'
import {
  listGamesServiceMock,
  resetGamesServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import {
  createLiveStream,
  createRoomLive,
  roomStatusEvent,
  snapshotEvent,
} from '@frontend-tests/_helpers/liveMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { ROOM_PRESENCE } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import GamesView from '@/views/GamesView.vue'

// Ici le vrai composable lit un faux flux : la présence arrive comme en production.
vi.mock('@/composables/useLiveCompany', async () => {
  return await vi.importActual('@/composables/useLiveCompany')
})

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('@/utils/api', () => ({ apiFetch: apiFetchMock }))

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetGamesServiceMock()
  apiFetchMock.mockReset()
  tokenMock.value = 'staff-token'
})

function presenceOf(wrapper: VueWrapper, gameId: number) {
  return wrapper.get(
    `[data-test="base-table-row"][data-row-key="${gameId}"] [data-test="room-presence"]`
  )
}

describe('views/GamesView.vue with a simulated live stream', () => {
  it('shows the presence sent by the server and follows its changes', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    const stream = createLiveStream()

    apiFetchMock.mockResolvedValueOnce(stream.response)

    const wrapper = mountWithFrontendMocks(GamesView)

    await flushPromises()

    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/companies/1/live', authenticated: true })
    )
    // Avant le premier `snapshot`, on n'affirme rien.
    expect(presenceOf(wrapper, 4).attributes('data-presence')).toBe('unknown')
    expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe(
      'live.connection.connecting'
    )

    stream.push(
      snapshotEvent([
        createRoomLive({ roomId: 10, presence: ROOM_PRESENCE.ONLINE }),
        createRoomLive({ roomId: 11, presence: ROOM_PRESENCE.IN_GAME }),
      ])
    )
    await flushPromises()

    expect(presenceOf(wrapper, 4).attributes('data-presence')).toBe('online')
    expect(presenceOf(wrapper, 3).attributes('data-presence')).toBe('in_game')
    expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe('live.connection.live')

    stream.push(roomStatusEvent(createRoomLive({ roomId: 10, presence: ROOM_PRESENCE.OFFLINE })))
    await flushPromises()

    expect(presenceOf(wrapper, 4).attributes('data-presence')).toBe('offline')
    expect(presenceOf(wrapper, 4).text()).toContain('live.presence.seenAgo')

    // Flux coupé : la dernière présence connue n'est plus affirmée.
    stream.end()
    await flushPromises()

    expect(presenceOf(wrapper, 4).attributes('data-presence')).toBe('unknown')
    expect(presenceOf(wrapper, 3).attributes('data-presence')).toBe('unknown')
    expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe(
      'live.connection.reconnecting'
    )

    wrapper.unmount()
  })

  it('closes the stream when the screen is left', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    const stream = createLiveStream()

    apiFetchMock.mockResolvedValueOnce(stream.response)

    const wrapper = mountWithFrontendMocks(GamesView)

    stream.push(snapshotEvent([createRoomLive({ roomId: 10 })]))
    await flushPromises()
    wrapper.unmount()
    await flushPromises()

    const { signal } = apiFetchMock.mock.calls[0][0] as { signal: AbortSignal }

    expect(signal.aborted).toBe(true)
    expect(stream.cancelled).toBe(true)
    expect(listGamesServiceMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the games list when the stream is refused', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'too_many_streams' }), { status: 429 })
    )

    const wrapper = mountWithFrontendMocks(GamesView)

    await flushPromises()

    expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe('errors.too_many_streams')
    expect(wrapper.findAll('[data-test="base-table-row"]')).toHaveLength(4)
    expect(presenceOf(wrapper, 4).attributes('data-presence')).toBe('unknown')
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })
})
