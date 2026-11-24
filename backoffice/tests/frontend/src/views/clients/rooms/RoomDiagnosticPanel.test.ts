import {
  liveErrorKeyMock,
  liveStateMock,
  setLiveRooms,
  useLiveCompanyMock,
} from '@frontend-tests/_helpers/liveCompanyMock'
import { createRoomLive } from '@frontend-tests/_helpers/liveMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { roomsFixture } from '@frontend-tests/_helpers/roomsServiceMock'
import { ROOM_PRESENCE, type RoomDiagnostics, type RoomStatusReport } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import RoomDiagnosticPanel from '@/views/clients/rooms/RoomDiagnosticPanel.vue'

resetFrontendMocksBeforeEach()

const ROOM = roomsFixture[0]
const ROOM_ID = ROOM?.id ?? 1
const UNKNOWN = 'rooms.diagnostic.unknown'

const diagnostics: RoomDiagnostics = {
  appVersion: '0.1.0',
  buzzerSource: 'keyboard',
  gamepadCount: 0,
  lightingDriver: 'simulation',
  lightingStatus: 'open',
  smokeEnabled: false,
  smokeArmed: false,
  lastErrorAt: null,
}

const status: RoomStatusReport = {
  screen: 'lobby',
  gameId: null,
  phase: null,
  round: null,
  questionIndex: null,
  miniGame: null,
  paused: false,
  scores: [],
  audioReady: true,
  diagnostics,
}

function mountPanel() {
  return mountWithFrontendMocks(RoomDiagnosticPanel, { props: { companyId: 1, room: ROOM } })
}

const row = (wrapper: ReturnType<typeof mountPanel>, id: string) =>
  wrapper.find(`[data-test="diagnostic-row-${id}"]`)

const unknownCount = (wrapper: ReturnType<typeof mountPanel>) =>
  wrapper.text().split(UNKNOWN).length - 1

describe('views/clients/rooms/RoomDiagnosticPanel.vue', () => {
  it('follows the live stream of the company of the room', () => {
    mountPanel()

    const [source] = useLiveCompanyMock.mock.calls[0] ?? []

    expect((source as () => number)()).toBe(1)
  })

  it('shows one row per element of an online room, read-only', () => {
    setLiveRooms([createRoomLive({ roomId: ROOM_ID, status })])

    const wrapper = mountPanel()

    expect(wrapper.findAll('[data-test^="diagnostic-row-"]')).toHaveLength(6)
    expect(row(wrapper, 'appVersion').text()).toContain('0.1.0')
    expect(row(wrapper, 'buzzers').text()).toContain('rooms.diagnostic.buzzers.keyboard')
    expect(row(wrapper, 'audio').text()).toContain('rooms.diagnostic.audio.ready')
    expect(row(wrapper, 'lastError').text()).toContain('rooms.diagnostic.lastError.none')
    expect(unknownCount(wrapper)).toBe(0)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('shows every element as unknown when the room is offline', () => {
    setLiveRooms([createRoomLive({ roomId: ROOM_ID, presence: ROOM_PRESENCE.OFFLINE, status })])

    const wrapper = mountPanel()

    expect(unknownCount(wrapper)).toBe(6)
    expect(wrapper.text()).not.toContain('0.1.0')
  })

  it('shows the hardware as unknown when the room screen does not send the field', () => {
    const { diagnostics: _omitted, ...oldStatus } = status

    setLiveRooms([createRoomLive({ roomId: ROOM_ID, status: oldStatus })])

    const wrapper = mountPanel()

    expect(row(wrapper, 'appVersion').text()).toContain(UNKNOWN)
    expect(row(wrapper, 'lights').text()).toContain(UNKNOWN)
    expect(row(wrapper, 'audio').text()).toContain('rooms.diagnostic.audio.ready')
  })

  it('shows unknown for a room missing from the live list', () => {
    setLiveRooms([createRoomLive({ roomId: 999, status })])

    expect(unknownCount(mountPanel())).toBe(6)
  })

  it('shows the loading state while the stream connects, then the rows', async () => {
    liveStateMock.value = 'connecting'

    const wrapper = mountPanel()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('true')

    liveStateMock.value = 'live'
    setLiveRooms([createRoomLive({ roomId: ROOM_ID, status })])
    await nextTick()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('false')
    expect(row(wrapper, 'appVersion').text()).toContain('0.1.0')
  })

  it('shows the translated error of the stream and no stale value', () => {
    liveStateMock.value = 'error'
    liveErrorKeyMock.value = 'errors.forbidden'
    setLiveRooms([createRoomLive({ roomId: ROOM_ID, status })])

    const wrapper = mountPanel()

    expect(wrapper.find('[data-test="diagnostic-error"]').text()).toBe('errors.forbidden')
    expect(wrapper.text()).not.toContain('0.1.0')
    expect(unknownCount(wrapper)).toBe(6)
  })
})
