import type { RoomLive } from '@quizzup/shared'
import { vi } from 'vitest'
import { computed, ref } from 'vue'

import type { LiveConnectionState } from '@/composables/useLiveCompany'

export const LIVE_NOW_MOCK = Date.parse('2026-11-23T10:05:00.000Z')

// Les vues reçoivent ces refs : un test les modifie pour simuler le flux en direct.
export const liveRoomsMock = ref<Record<number, RoomLive>>({})
export const liveStateMock = ref<LiveConnectionState>('live')
export const liveErrorKeyMock = ref<string | null>(null)
export const liveNowMock = ref(LIVE_NOW_MOCK)

export const useLiveCompanyMock = vi.fn((_companyId: unknown) => ({
  rooms: liveRoomsMock,
  state: liveStateMock,
  errorKey: liveErrorKeyMock,
  uncertain: computed(() => liveStateMock.value !== 'live'),
  now: liveNowMock,
  stop: vi.fn(),
}))

export function setLiveRooms(rooms: RoomLive[]): void {
  liveRoomsMock.value = Object.fromEntries(rooms.map((room) => [room.roomId, room]))
}

export function resetLiveCompanyMock(): void {
  liveRoomsMock.value = {}
  liveStateMock.value = 'live'
  liveErrorKeyMock.value = null
  liveNowMock.value = LIVE_NOW_MOCK
  useLiveCompanyMock.mockClear()
}
