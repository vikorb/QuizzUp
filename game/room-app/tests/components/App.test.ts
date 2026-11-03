import { flushPromises } from '@vue/test-utils'

import App from '@/App.vue'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'

import { mountWithApp } from '../_helpers/mount'

describe('App — alerte de perte de focus', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  afterEach(() => vi.restoreAllMocks())

  it('prévient que les buzzers sont inactifs quand la page perd le focus dans le lobby', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const { wrapper } = await mountWithApp(App, { route: '/lobby' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Buzzers inactifs')

    hasFocus.mockReturnValue(false)
    window.dispatchEvent(new Event('blur'))
    await flushPromises()
    expect(wrapper.text()).toContain('Buzzers inactifs')

    hasFocus.mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Buzzers inactifs')
  })

  it('ne dérange pas sur l’écran de lancement', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const { wrapper } = await mountWithApp(App, { route: '/' })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Buzzers inactifs')
  })
})
