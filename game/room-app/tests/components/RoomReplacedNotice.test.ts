import { flushPromises } from '@vue/test-utils'

import RoomReplacedNotice from '@/components/live/RoomReplacedNotice.vue'
import { startRoomLive, stopRoomLive } from '@/live/roomLive'
import { setDemoMode, setRoomToken } from '@/utils/auth'

import { createFakeLiveServer, helloMessage } from '../_helpers/fakeLiveServer'
import { mountWithApp } from '../_helpers/mount'

const REPLACED = 'event: replaced\ndata: {}\n\n'

describe('RoomReplacedNotice : salle ouverte sur un autre poste', () => {
  let server: ReturnType<typeof createFakeLiveServer>

  beforeEach(() => {
    localStorage.clear()
    setRoomToken('jeton-salle')
    setDemoMode(false)
    server = createFakeLiveServer()
    vi.stubGlobal('fetch', server.fetchMock)
  })

  afterEach(() => {
    stopRoomLive()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('n’affiche rien tant que la salle publie normalement', async () => {
    const { wrapper } = await mountWithApp(RoomReplacedNotice)

    startRoomLive()
    await vi.waitFor(() => expect(server.streams).toHaveLength(1))
    server.streams[0]?.push(helloMessage())
    await flushPromises()

    expect(wrapper.find('[data-test="room-replaced"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('affiche le message et le bouton quand un autre poste a pris la main', async () => {
    const { wrapper } = await mountWithApp(RoomReplacedNotice)

    startRoomLive()
    await vi.waitFor(() => expect(server.streams).toHaveLength(1))
    server.streams[0]?.push(helloMessage() + REPLACED)

    await vi.waitFor(() => expect(wrapper.find('[data-test="room-replaced"]').exists()).toBe(true))
    expect(wrapper.find('[role="alert"]').text()).toContain('autre PC')
    expect(wrapper.find('[data-test="room-live-resume"]').text()).toBe('Reprendre la main ici')
  })

  it('« Reprendre la main ici » rouvre le flux et masque l’avis', async () => {
    const { wrapper } = await mountWithApp(RoomReplacedNotice)

    startRoomLive()
    await vi.waitFor(() => expect(server.streams).toHaveLength(1))
    server.streams[0]?.push(REPLACED)
    await vi.waitFor(() => expect(wrapper.find('[data-test="room-replaced"]').exists()).toBe(true))

    await wrapper.find('[data-test="room-live-resume"]').trigger('click')
    await vi.waitFor(() => expect(server.streams).toHaveLength(2))

    expect(wrapper.find('[data-test="room-replaced"]').exists()).toBe(false)
  })
})
