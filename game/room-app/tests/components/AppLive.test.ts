import { flushPromises } from '@vue/test-utils'

import App from '@/App.vue'
import { stopRoomLive } from '@/live/roomLive'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import { setDemoMode, setRoomToken } from '@/utils/auth'

import { createFakeLiveServer, helloMessage } from '../_helpers/fakeLiveServer'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

const SESSION_ENDED = 'event: session_ended\ndata: {"error":"session_expired"}\n\n'

describe('App : présence en direct', () => {
  let server: ReturnType<typeof createFakeLiveServer>

  beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

  beforeEach(() => {
    localStorage.clear()
    server = createFakeLiveServer()
    vi.stubGlobal('fetch', server.fetchMock)
  })

  afterEach(() => {
    stopRoomLive()
    vi.unstubAllGlobals()
    setDemoMode(false)
    localStorage.clear()
    syncRoomAuth()
  })

  it('avec un compte de salle connecté : ouvre le flux, le referme au démontage', async () => {
    setRoomToken('jeton-salle')
    syncRoomAuth()

    const { wrapper } = await mountWithApp(App, { route: '/' })
    await vi.waitFor(() => expect(server.streams).toHaveLength(1))

    expect(server.streams[0]?.headers.get('Authorization')).toBe('Bearer jeton-salle')

    wrapper.unmount()
    expect(server.streams[0]?.aborted).toBe(true)
  })

  it('en mode démo : aucun appel réseau', async () => {
    syncRoomAuth()
    enterDemo()

    await mountWithApp(App, { route: '/' })
    await flushPromises()

    expect(server.fetchMock).not.toHaveBeenCalled()
  })

  it('session terminée côté serveur : retour à la connexion avec le message traduit', async () => {
    setRoomToken('jeton-salle')
    syncRoomAuth()

    const { wrapper, router } = await mountWithApp(App, { route: '/' })
    await vi.waitFor(() => expect(server.streams).toHaveLength(1))
    server.streams[0]?.push(helloMessage() + SESSION_ENDED)

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('La session de la salle a pris fin : reconnecte-toi.')
    )
  })
})
