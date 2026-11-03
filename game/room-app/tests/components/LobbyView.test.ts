import { flushPromises } from '@vue/test-utils'

import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, useRoomGame } from '@/game/useRoomGame'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import LobbyView from '@/views/LobbyView.vue'

import { mountWithApp } from '../_helpers/mount'

function findButton(wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper'], label: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(label))
}

describe('LobbyView', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    configureRoomGame({ storage: createMemorySessionStorage() })
  })

  afterEach(() => closeGame())

  it('demande au moins un joueur', async () => {
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })

    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')

    expect(wrapper.text()).toContain('Inscris au moins un joueur')
    expect(router.currentRoute.value.name).toBe('lobby')
    wrapper.unmount()
  })

  it('bloque un email sans consentement, puis démarre une fois la case cochée', async () => {
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })

    await wrapper.find('input[name=desk-2-name]').setValue('Hugo')
    await wrapper.find('input[name=desk-2-email]').setValue('hugo@exemple.fr')
    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Coche la case de consentement')
    expect(router.currentRoute.value.name).toBe('lobby')

    await wrapper.find('.consent__box').setValue(true)
    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
    const { state, session } = useRoomGame()
    expect(state.value?.setup.participants).toEqual([{ id: 2, podium: 2, displayName: 'Hugo' }])
    // Mode démo : partie courte par défaut.
    expect(state.value?.setup.roundsCount).toBe(3)
    expect(session.value?.savedRegistrations[0]).toMatchObject({
      email: 'hugo@exemple.fr',
      consent: true,
    })
    wrapper.unmount()
  })

  it('changer l’email retire le consentement donné', async () => {
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })

    await wrapper.find('input[name=desk-1-email]').setValue('lea@exemple.fr')
    await wrapper.find('.consent__box').setValue(true)
    expect((wrapper.find('.consent__box').element as HTMLInputElement).checked).toBe(true)

    await wrapper.find('input[name=desk-1-email]').setValue('lea2@exemple.fr')
    expect((wrapper.find('.consent__box').element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })

  it('fait briller le pupitre dont un buzzer est pressé', async () => {
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }))
    await flushPromises()

    expect(wrapper.find('.desk--4').classes()).toContain('desk--ping')
    expect(wrapper.find('.desk--4').text()).toContain('Buzzer OK')
    wrapper.unmount()
  })
})

describe('LobbyView — échec au démarrage', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    configureRoomGame({ storage: createMemorySessionStorage() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    closeGame()
  })

  it('affiche un message si le contenu ne peut pas être chargé', async () => {
    const content = await import('@/game/content')
    vi.spyOn(content, 'loadRoomThemes').mockRejectedValueOnce(new Error('api down'))
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })

    await wrapper.find('input[name=desk-1-name]').setValue('Léa')
    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Impossible de démarrer la partie')
    expect(router.currentRoute.value.name).toBe('lobby')
  })
})
