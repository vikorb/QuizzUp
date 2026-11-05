import { flushPromises } from '@vue/test-utils'

import {
  EMERGENCY_STORAGE_KEY,
  HARDWARE_STORAGE_KEY,
  resetRoomHardware,
  saveBuzzerKeymap,
  saveRoomDesksCount,
  saveRoomHardwareConfig,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { pressKey } from '../_helpers/keyboard'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

/** 16 touches libres, une par buzzer (pupitre 1 A → pupitre 4 D). */
const LEARN_CODES = 'BCGHIJKLMNOPTUYZ'.split('').map((letter) => `Key${letter}`)

async function openTab(wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper'], tab: string) {
  await wrapper.find(`[data-test="tab-${tab}"]`).trigger('click')
  await flushPromises()
}

/** « Lancer la configuration » puis « Continuer » : l'apprentissage commence après le choix des couleurs. */
async function startLearning(wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper']) {
  await wrapper.find('[data-test="start-config"]').trigger('click')
  await wrapper.find('[data-test="layout-continue"]').trigger('click')
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

    await startLearning(wrapper)
    expect(wrapper.find('[data-test="learning"]').text()).toContain(
      'Appuie sur le buzzer bleu (A) du pupitre 1'
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
    await startLearning(wrapper)
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
    await startLearning(wrapper)

    expect(wrapper.find('[data-test="learning"]').text()).toContain('Buzzer 1 sur 24')
    // Le nombre de pupitres ne se change pas en plein apprentissage.
    expect(wrapper.find('[data-test="desks-count"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()

    const smaller = await mountWithApp(HardwareView, { route: '/hardware' })
    await smaller.wrapper.find('[data-test="desks-count"]').setValue('2')
    await flushPromises()
    await startLearning(smaller.wrapper)
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
    expect(wrapper.find('[data-test="buzzer-6A"]').text()).toContain('T')
    expect(useRoomHardware().hardware.value.config.buzzers.keymap).toEqual(reserve)
  })

  it('garde la réserve des pupitres 5 et 6 quand on réapprend les buzzers à 4 pupitres', async () => {
    const reserve = Object.fromEntries([
      ['KeyV', { desk: 5, button: 'A' } as const],
      ['KeyX', { desk: 6, button: 'B' } as const],
    ])
    await saveRoomDesksCount(6)
    await saveBuzzerKeymap(reserve)
    await saveRoomDesksCount(4)
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    await startLearning(wrapper)
    for (const code of LEARN_CODES) {
      pressKey(code)
    }
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Enregistrer'))!
      .trigger('click')
    await flushPromises()

    const { keymap } = useRoomHardware().hardware.value.config.buzzers
    expect(Object.keys(keymap)).toHaveLength(18)
    expect(keymap['KeyV']).toEqual({ desk: 5, button: 'A' })
    expect(keymap['KeyX']).toEqual({ desk: 6, button: 'B' })
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

describe('HardwareView — arrêt d’urgence après un rechargement', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
  })

  it('affiche le bandeau d’arrêt d’urgence retenu, et le réarmement l’efface', async () => {
    // Arrêt pressé avant le rechargement : la clé du PC est restée.
    localStorage.setItem(EMERGENCY_STORAGE_KEY, 'operator')
    await resetRoomHardware()

    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'lights')
    await vi.waitFor(() => expect(useRoomHardware().lighting.value).not.toBeNull())
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Arrêt d’urgence actif')
    expect(wrapper.find('[data-test="emergency-stop"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="scene-victory"]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-test="emergency-reset"]').trigger('click')
    const { useConfirm } = await import('@/composables/useConfirm')
    useConfirm().accept()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Arrêt d’urgence actif')
    expect(wrapper.find('[data-test="emergency-stop"]').exists()).toBe(true)
    expect(localStorage.getItem(EMERGENCY_STORAGE_KEY)).toBeNull()
  })

  it('retient l’arrêt d’urgence pressé sur l’écran', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'lights')
    await vi.waitFor(() => expect(useRoomHardware().lighting.value).not.toBeNull())

    await wrapper.find('[data-test="emergency-stop"]').trigger('click')
    await flushPromises()

    expect(localStorage.getItem(EMERGENCY_STORAGE_KEY)).toBe('operator')
  })
})

describe('HardwareView — pont Art-Net', () => {
  /** Pont factice : injoignable tant que `available` est faux, prêt ensuite. */
  class BridgeSocket {
    static available = false
    readyState = 0
    bufferedAmount = 0
    binaryType = 'blob'
    onopen: (() => void) | null = null
    onmessage: ((event: { data: unknown }) => void) | null = null
    onerror: (() => void) | null = null
    onclose: ((event: { code: number; reason: string }) => void) | null = null

    constructor() {
      queueMicrotask(() => {
        if (BridgeSocket.available) {
          this.readyState = 1
          this.onopen?.()
        } else {
          this.readyState = 3
          this.onerror?.()
        }
      })
    }

    send(data: unknown) {
      if (typeof data === 'string') {
        queueMicrotask(() =>
          this.onmessage?.({ data: JSON.stringify({ type: 'ack', protocol: 1, bridge: 'b' }) })
        )
      }
    }

    close() {
      this.readyState = 3
    }
  }

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    BridgeSocket.available = false
    vi.stubGlobal('WebSocket', BridgeSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('propose « Connecter le pont » quand il est absent, puis disparaît une fois connecté', async () => {
    await saveRoomHardwareConfig({ lighting: { driver: 'artnet-bridge' } })
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'lights')
    await vi.waitFor(() => expect(wrapper.find('[data-test="bridge-banner"]').exists()).toBe(true))

    expect(wrapper.find('[data-test="bridge-banner"]').text()).toContain(
      'Pont Art-Net non connecté'
    )
    expect(wrapper.find('[data-test="bridge-banner"]').text()).toContain('injoignable')
    // Le démarrage n'est pas bloqué : les lumières tournent, en simulation.
    expect(useRoomHardware().lightingState.value?.simulation).toBe(true)

    BridgeSocket.available = true
    await wrapper.find('[data-test="bridge-connect"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-test="bridge-banner"]').exists()).toBe(false))
    expect(useRoomHardware().lightingState.value?.outputStatus).toBe('open')
  })

  it('n’affiche pas le bandeau avec un autre pilote', async () => {
    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
    await openTab(wrapper, 'lights')
    await vi.waitFor(() => expect(useRoomHardware().lighting.value).not.toBeNull())
    await flushPromises()
    expect(wrapper.find('[data-test="bridge-banner"]').exists()).toBe(false)
  })
})
