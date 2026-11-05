import { flushPromises } from '@vue/test-utils'

import { useConfirm } from '@/composables/useConfirm'
import { getRoomHardwareConfig, saveBuzzerKeymap, useRoomHardware } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import LaunchView from '@/views/LaunchView.vue'
import SetupView from '@/views/SetupView.vue'

import { pressKey } from '../_helpers/keyboard'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

async function press(code: string) {
  pressKey(code)
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  syncRoomAuth()
  enterDemo()
})

describe('accueil : configuration de la salle', () => {
  it('propose la configuration tant qu’aucun buzzer n’est associé', async () => {
    const { wrapper } = await mountWithApp(LaunchView)
    expect(sel(wrapper, 'start-setup').text()).toBe('Lancer la configuration de la salle')
    expect(sel(wrapper, 'reconfigure-room').exists()).toBe(false)
  })

  it('ne propose plus que le lien discret une fois la salle configurée', async () => {
    await saveBuzzerKeymap(Object.fromEntries([['KeyB', { desk: 1, button: 'A' } as const]]))
    const { wrapper } = await mountWithApp(LaunchView)
    expect(sel(wrapper, 'start-setup').exists()).toBe(false)
    expect(sel(wrapper, 'reconfigure-room').exists()).toBe(true)
  })

  it('le bouton ouvre le parcours plein écran', async () => {
    const { wrapper, router } = await mountWithApp(LaunchView)
    await click(wrapper, 'start-setup')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('setup'))
  })
})

describe('parcours de configuration plein écran', () => {
  it('configure la disposition, 2 pupitres et 8 buzzers au clavier, puis enregistre', async () => {
    const { wrapper, router } = await mountWithApp(SetupView, { route: '/setup' })
    expect(wrapper.text()).toContain('Bienvenue dans la configuration de ta salle')
    await click(wrapper, 'setup-start')

    // Disposition : A passe en rouge, puis en bas à droite (D prend sa place).
    await click(wrapper, 'setup-corner-tl')
    await click(wrapper, 'setup-color-red')
    expect(sel(wrapper, 'setup-color-red').attributes('aria-pressed')).toBe('true')
    await click(wrapper, 'setup-swap')
    await click(wrapper, 'setup-corner-br')
    await click(wrapper, 'setup-layout-ok')

    // Nombre de pupitres : 4 présélectionné, on passe à 2.
    expect(sel(wrapper, 'setup-desks-4').attributes('aria-checked')).toBe('true')
    await click(wrapper, 'setup-desks-2')
    await click(wrapper, 'setup-desks-ok')

    expect(sel(wrapper, 'setup-desk').text()).toContain('Pupitre 1')
    expect(sel(wrapper, 'setup-prompt').text()).toBe('Appuie sur le buzzer rouge (A)')
    expect(sel(wrapper, 'setup-prompt').find('strong').text()).toBe('rouge')
    const keys = ['KeyB', 'KeyC', 'KeyG', 'KeyH', 'KeyI', 'KeyJ', 'KeyK', 'KeyL']
    for (const code of keys) {
      await press(code)
    }
    expect(sel(wrapper, 'setup-done').exists()).toBe(true)
    // Rien n'est enregistré avant « Terminer ».
    expect(getRoomHardwareConfig().buzzers.keymap).toEqual({})

    await click(wrapper, 'setup-finish')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))

    const config = getRoomHardwareConfig()
    expect(config.desksCount).toBe(2)
    expect(config.buzzers.layout.A).toEqual({ color: 'red', corner: 'br' })
    expect(config.buzzers.layout.D.corner).toBe('tl')
    expect(Object.keys(config.buzzers.keymap)).toEqual(keys)
    expect(config.buzzers.keymap.KeyB).toEqual({ desk: 1, button: 'A' })
    expect(config.buzzers.keymap.KeyL).toEqual({ desk: 2, button: 'D' })
    expect(useRoomHardware().setupNeeded.value).toBe(false)
  })

  it('refuse une touche déjà prise et reste sur le même buzzer', async () => {
    const { wrapper } = await mountWithApp(SetupView, { route: '/setup' })
    await click(wrapper, 'setup-start')
    await click(wrapper, 'setup-layout-ok')
    await click(wrapper, 'setup-desks-ok')

    await press('KeyB')
    expect(sel(wrapper, 'setup-prompt').text()).toContain('(B)')
    await press('KeyB')
    const feedback = sel(wrapper, 'setup-feedback')
    expect(feedback.text()).toContain('déjà prise')
    expect(feedback.attributes('role')).toBe('alert')
    expect(sel(wrapper, 'setup-prompt').text()).toContain('(B)')
  })

  it('Passer et Retour naviguent entre les buzzers', async () => {
    const { wrapper } = await mountWithApp(SetupView, { route: '/setup' })
    await click(wrapper, 'setup-start')
    await click(wrapper, 'setup-layout-ok')
    await click(wrapper, 'setup-desks-ok')
    expect(sel(wrapper, 'setup-back').attributes('disabled')).toBeDefined()
    await click(wrapper, 'setup-skip')
    expect(sel(wrapper, 'setup-prompt').text()).toContain('(B)')
    await click(wrapper, 'setup-back')
    expect(sel(wrapper, 'setup-prompt').text()).toContain('(A)')
  })

  it('quitter demande confirmation et n’enregistre rien', async () => {
    const { wrapper, router } = await mountWithApp(SetupView, { route: '/setup' })
    await click(wrapper, 'setup-start')
    await click(wrapper, 'setup-color-red')
    await click(wrapper, 'setup-layout-ok')
    await click(wrapper, 'setup-desks-ok')
    await press('KeyB')

    // Refus : on reste dans le parcours.
    void sel(wrapper, 'setup-quit').trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().cancel()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('setup')

    // Échap : même confirmation, acceptée cette fois.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))

    const config = getRoomHardwareConfig()
    expect(config.buzzers.keymap).toEqual({})
    expect(config.buzzers.layout.A.color).toBe('blue')
    expect(useRoomHardware().setupNeeded.value).toBe(true)
  })
})
