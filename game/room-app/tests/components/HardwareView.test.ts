import { flushPromises } from '@vue/test-utils'

import {
  HARDWARE_STORAGE_KEY,
  saveBuzzerKeymap,
  saveRoomDesksCount,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { pressKey } from '../_helpers/keyboard'
import { mountWithApp } from '../_helpers/mount'

/** 16 touches libres, une par buzzer (pupitre 1 A → pupitre 4 D). */
const LEARN_CODES = 'BCGHIJKLMNOPTUYZ'.split('').map((letter) => `Key${letter}`)

async function openTab(wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper'], tab: string) {
  await wrapper.find(`[data-test="tab-${tab}"]`).trigger('click')
  await flushPromises()
}

describe('HardwareView', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('associe les 16 buzzers puis enregistre le mapping', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    expect(wrapper.text()).toContain('Aucun buzzer associé')

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Associer'))!
      .trigger('click')
    expect(wrapper.find('[data-test="learning"]').text()).toContain(
      'Appuie sur le buzzer A du pupitre 1'
    )

    pressKey(LEARN_CODES[0]!)
    await flushPromises()
    expect(wrapper.text()).toContain('Buzzer A du pupitre 1 associé (touche B)')

    // Même touche pour le buzzer suivant : refusée.
    pressKey(LEARN_CODES[0]!)
    await flushPromises()
    expect(wrapper.text()).toContain('La touche B est déjà utilisée')

    for (const code of LEARN_CODES.slice(1)) {
      pressKey(code)
    }
    await flushPromises()
    expect(wrapper.text()).toContain('16 buzzers associés.')

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Enregistrer'))!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Association enregistrée')
    expect(wrapper.text()).toContain('16 buzzers associés')
    expect(Object.keys(useRoomHardware().hardware.value.config.buzzers.keymap)).toHaveLength(16)
    expect(
      JSON.parse(localStorage.getItem(HARDWARE_STORAGE_KEY) ?? '{}').buzzers.keymap.KeyB
    ).toEqual({ desk: 1, button: 'A' })
  })

  it('annule l’apprentissage sans rien changer', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Associer'))!
      .trigger('click')
    pressKey(LEARN_CODES[0]!)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Passer ce buzzer')!
      .trigger('click')
    expect(wrapper.text()).toContain('Buzzer 3 sur 16')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Buzzer précédent')!
      .trigger('click')
    expect(wrapper.text()).toContain('Buzzer 2 sur 16')

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Annuler')!
      .trigger('click')

    expect(wrapper.find('[data-test="learning"]').exists()).toBe(false)
    expect(useRoomHardware().usesSimulationKeys.value).toBe(true)
  })

  it('allume le buzzer testé', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    pressKey('KeyS') // pupitre 3, B
    await flushPromises()
    expect(wrapper.find('[data-test="buzzer-3B"]').classes()).toContain('desk-test__btn--lit')
    expect(wrapper.find('[data-test="buzzer-3B"]').text()).toContain('S')

    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(wrapper.find('[data-test="buzzer-3B"]').classes()).not.toContain('desk-test__btn--lit')
    vi.useRealTimers()
  })

  it('pilote l’arrêt d’urgence et la fumée', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'lights')
    await vi.waitFor(() => expect(useRoomHardware().lighting.value).not.toBeNull())
    await flushPromises()

    expect(wrapper.find('[data-test="lights-status"]').text()).toContain('Simulation')
    expect(wrapper.text()).toContain('Fumée désactivée')
    expect(wrapper.text()).toContain('Aucun appareil déclaré')

    await wrapper.find('[data-test="emergency-stop"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Arrêt d’urgence actif')

    await wrapper.find('[data-test="emergency-reset"]').trigger('click')
    // Le réarmement est confirmé (la modale n'est pas montée ici).
    const { useConfirm } = await import('@/composables/useConfirm')
    useConfirm().accept()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Arrêt d’urgence actif')

    await wrapper.find('[data-test="scene-victory"]').trigger('click')
    expect(useRoomHardware().lightingState.value?.currentSceneId).toBe('victory')
  })

  it('arme la fumée quand la salle l’autorise', async () => {
    localStorage.setItem(
      HARDWARE_STORAGE_KEY,
      JSON.stringify({
        lighting: {
          fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 }],
          smoke: { enabled: true, requireConfirmation: true },
        },
      })
    )
    const { resetRoomHardware } = await import('@/hardware/roomHardware')
    await resetRoomHardware()

    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'lights')
    await vi.waitFor(() => expect(useRoomHardware().lighting.value).not.toBeNull())
    await flushPromises()

    await wrapper.find('[data-test="smoke-test"]').trigger('click')
    expect(wrapper.find('[data-test="smoke-test"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-test="smoke-arm"]').setValue(true)
    await flushPromises()
    expect(useRoomHardware().lightingState.value?.smoke.armed).toBe(true)

    await wrapper.find('[data-test="smoke-test"]').trigger('click')
    await flushPromises()
    expect(useRoomHardware().lightingState.value?.smoke.status).toBe('firing')
    expect(wrapper.find('[data-test="rig"]').text()).toContain('Fumée')

    await wrapper.find('[data-test="smoke-arm"]').setValue(false)
    await flushPromises()
    expect(useRoomHardware().lightingState.value?.smoke.armed).toBe(false)
  })

  it('valide et enregistre la configuration avancée', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'advanced')
    const textarea = wrapper.find('[data-test="config-json"]')

    await textarea.setValue('{ pas du json')
    await wrapper.find('[data-test="config-save"]').trigger('click')
    expect(wrapper.text()).toContain('JSON invalide')

    await textarea.setValue(
      JSON.stringify({
        lighting: {
          driver: 'usbpro',
          fixtures: [
            { id: 'par1', name: 'PAR 1', profileId: 'par-rgb', address: 1, desk: 1 },
            { id: 'x', name: 'Inconnu', profileId: 'nope', address: 9 },
          ],
        },
      })
    )
    await wrapper.find('[data-test="config-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Configuration enregistrée')
    expect(wrapper.find('[data-test="config-problems"]').exists()).toBe(true)
    expect(useRoomHardware().hardware.value.config.lighting.driver).toBe('usbpro')

    await openTab(wrapper, 'lights')
    await vi.waitFor(() => expect(wrapper.find('[data-test="rig"]').exists()).toBe(true))
    expect(wrapper.find('[data-test="rig"]').text()).toContain('PAR 1')
    expect(wrapper.find('[data-test="dmx-connect"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('utilise Chrome ou Edge')
  })

  it('revient à l’écran de lancement', async () => {
    const { wrapper, router } = await mountWithApp(HardwareView, { route: '/hardware' })
    await wrapper.find('[aria-label="Retour"]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))
  })
})

describe('HardwareView — nombre de pupitres', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('propose 4 pupitres par défaut et les règle de 1 à 6', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    const select = wrapper.find<HTMLSelectElement>('[data-test="desks-count"]')

    expect(select.element.value).toBe('4')
    expect(select.findAll('option').map((option) => option.text())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ])
    expect(wrapper.findAll('.desk-test')).toHaveLength(4)

    await select.setValue('6')
    await flushPromises()

    expect(useRoomHardware().hardware.value.config.desksCount).toBe(6)
    expect(wrapper.findAll('.desk-test')).toHaveLength(6)
    expect(JSON.parse(localStorage.getItem(HARDWARE_STORAGE_KEY) ?? '{}').desksCount).toBe(6)
    // Le test des buzzers montre les touches de simulation des pupitres 5 et 6.
    expect(wrapper.find('[data-test="buzzer-5A"]').text()).toContain('5')
    expect(wrapper.find('[data-test="buzzer-6D"]').text()).toContain('I')
  })

  it('apprend les buzzers des pupitres de la salle seulement', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    await wrapper.find('[data-test="desks-count"]').setValue('6')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Associer'))!
      .trigger('click')

    expect(wrapper.find('[data-test="learning"]').text()).toContain('Buzzer 1 sur 24')
    // Le nombre de pupitres ne se change pas en plein apprentissage.
    expect(wrapper.find('[data-test="desks-count"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()

    const smaller = await mountWithApp(HardwareView, { route: '/hardware' })
    await smaller.wrapper.find('[data-test="desks-count"]').setValue('2')
    await flushPromises()
    await smaller.wrapper
      .findAll('button')
      .find((button) => button.text().includes('Associer'))!
      .trigger('click')
    expect(smaller.wrapper.find('[data-test="learning"]').text()).toContain('Buzzer 1 sur 8')
    smaller.wrapper.unmount()
  })

  it('garde 4 pupitres à la réouverture de l’assistant après avoir réduit depuis l’onglet Buzzers', async () => {
    await saveRoomDesksCount(6)
    await saveBuzzerKeymap(
      Object.fromEntries([
        ['KeyT', { desk: 6, button: 'A' } as const],
        ['KeyP', { desk: 1, button: 'D' } as const],
      ])
    )
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    await wrapper.find('[data-test="desks-count"]').setValue('4')
    await flushPromises()
    await openTab(wrapper, 'assistant')
    await wrapper.find('[data-test="assistant-next"]').trigger('click')
    await flushPromises()

    expect(wrapper.find<HTMLSelectElement>('[data-test="desk-count"]').element.value).toBe('4')
    expect(useRoomHardware().hardware.value.config.desksCount).toBe(4)
  })

  it('garde les buzzers des pupitres retirés en réserve et les restitue en remontant', async () => {
    const reserve = Object.fromEntries([
      ['KeyT', { desk: 6, button: 'A' } as const],
      ['KeyP', { desk: 1, button: 'D' } as const],
    ])
    await saveRoomDesksCount(6)
    await saveBuzzerKeymap(reserve)
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    await wrapper.find('[data-test="desks-count"]').setValue('4')
    await flushPromises()
    expect(wrapper.find('[data-test="buzzer-6A"]').exists()).toBe(false)
    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual(reserve)

    await wrapper.find('[data-test="desks-count"]').setValue('6')
    await flushPromises()
    expect(wrapper.find('[data-test="buzzer-6A"]').exists()).toBe(true)
    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual(reserve)
  })

  it('règle aussi le nombre de pupitres depuis l’assistant d’installation', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'assistant')
    // Première étape : le navigateur ; on avance jusqu'aux buzzers.
    await wrapper.find('[data-test="assistant-next"]').trigger('click')
    await flushPromises()
    const select = wrapper.find<HTMLSelectElement>('[data-test="desk-count"]')

    expect(select.element.value).toBe('4')
    await select.setValue('5')
    await flushPromises()

    expect(wrapper.find<HTMLSelectElement>('[data-test="desk-count"]').element.value).toBe('5')
  })
})
