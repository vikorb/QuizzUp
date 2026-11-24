import { createSixDeskRoomRig, ROOM_TEMPLATES } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import { useConfirm } from '@/composables/useConfirm'
import type * as Hardware from '@/hardware/roomHardware'
import {
  getLighting,
  getRoomHardwareConfig,
  saveBuzzerKeymap,
  saveRoomHardwareConfig,
  startLighting,
  stopLighting,
} from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import SetupLightsView from '@/views/SetupLightsView.vue'

import { createFakeUsbPort, installFakeSerial, uninstallFakeSerial } from '../_helpers/fakeUsb'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

// Pont Art-Net factice : `nodes` = boîtiers du réseau, `null` = pont absent.
const bridge = vi.hoisted(() => ({ nodes: null as { ip: string; shortName: string }[] | null }))
vi.mock('@/hardware/roomHardware', async (importOriginal) => {
  const actual = await importOriginal<typeof Hardware>()
  const { BridgePollError: PollError } = await import('@quizzup/hardware')
  return {
    ...actual,
    connectDmxInterface: (driver?: Parameters<typeof actual.connectDmxInterface>[0]) =>
      driver === 'artnet-bridge' ? Promise.resolve() : actual.connectDmxInterface(driver),
    pollArtnetNodes: () =>
      bridge.nodes
        ? Promise.resolve(bridge.nodes)
        : Promise.reject(new PollError('not_connected', 'pont absent')),
  }
})

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

const stepOf = (wrapper: Wrapper) => wrapper.find('[data-step]').attributes('data-step')

const RIG_SIZE = createSixDeskRoomRig().fixtures.length

const SMOKE_ROOM = {
  fixtures: [
    { id: 'par1', name: 'PAR du fond', profileId: 'par-rgb', address: 1 },
    { id: 'fumee', name: 'Fumée', profileId: 'smoke-dmx', address: 20 },
  ],
}

async function seedLighting(patch: Record<string, unknown>) {
  const config = getRoomHardwareConfig()
  await saveRoomHardwareConfig({ ...config, lighting: { ...config.lighting, ...patch } })
}

beforeEach(() => {
  bridge.nodes = null
  localStorage.clear()
  syncRoomAuth()
  enterDemo()
})

afterEach(() => {
  uninstallFakeSerial()
})

async function mountLights() {
  const mounted = await mountWithApp(SetupLightsView, { route: '/setup/lights' })
  await flushPromises()
  return mounted
}

async function toEquip() {
  const mounted = await mountLights()
  await click(mounted.wrapper, 'lights-scan-next')
  return mounted
}

describe('lumières plein écran : interface', () => {
  it('trouve une interface USB et passe à l’équipement', async () => {
    installFakeSerial(createFakeUsbPort())
    const { wrapper } = await mountLights()
    expect(wrapper.text()).toContain('Passons aux lumières !')
    expect(wrapper.text()).toContain('ne répondent pas')
    await click(wrapper, 'lights-usb')
    expect(sel(wrapper, 'lights-found-usb').text()).toBe('Interface USB trouvée')
    expect(sel(wrapper, 'lights-none').exists()).toBe(false)
    await click(wrapper, 'lights-scan-next')
    expect(wrapper.text()).toContain('Comment est équipée ta salle ?')
  })

  it('propose le boîtier réseau trouvé par le pont', async () => {
    bridge.nodes = [{ ip: '192.168.1.20', shortName: 'NET-3' }]
    const { wrapper } = await mountLights()
    expect(sel(wrapper, 'lights-found-node').text()).toBe('Boîtier réseau 192.168.1.20 trouvé')
    expect(sel(wrapper, 'lights-found-node').attributes('aria-pressed')).toBe('true')
    expect(sel(wrapper, 'lights-none').exists()).toBe(false)
  })

  it('sans interface, continue en simulation', async () => {
    const before = getRoomHardwareConfig().lighting
    const { wrapper, router } = await mountLights()
    expect(sel(wrapper, 'lights-usb').attributes('disabled')).toBeDefined()
    expect(sel(wrapper, 'lights-none').text()).toBe('Aucune interface : on continue en simulation')
    expect(sel(wrapper, 'lights-scan-next').text()).toBe('Continuer en simulation')
    await click(wrapper, 'lights-scan-next')
    await click(wrapper, 'lights-later')
    expect(sel(wrapper, 'lights-done').text()).toBe('Les lumières, plus tard')
    await click(wrapper, 'lights-finish')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))
    // « Plus tard » n'enregistre rien.
    expect(getRoomHardwareConfig().lighting).toEqual(before)
  })

  it('Retour de l’équipement ramène à la recherche d’interface', async () => {
    const { wrapper } = await toEquip()
    expect(stepOf(wrapper)).toBe('equip')
    await click(wrapper, 'lights-equip-back')
    expect(stepOf(wrapper)).toBe('scan')
  })

  it('Retour est inactif tant qu’un choix d’équipement est en cours', async () => {
    await seedLighting(SMOKE_ROOM)
    const { wrapper } = await toEquip()
    expect(sel(wrapper, 'lights-equip-back').attributes('disabled')).toBeUndefined()

    // Les lumières existent : le remplacement demande confirmation, Retour attend la réponse.
    void sel(wrapper, 'lights-six-desk').trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    expect(sel(wrapper, 'lights-equip-back').attributes('disabled')).toBeDefined()

    useConfirm().cancel()
    await flushPromises()
    expect(stepOf(wrapper)).toBe('equip')
    expect(sel(wrapper, 'lights-equip-back').attributes('disabled')).toBeUndefined()
  })

  it('quitter après une recherche USB referme la connexion ouverte', async () => {
    installFakeSerial(createFakeUsbPort())
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-usb')
    expect(getLighting()?.getState().simulation).toBe(false)
    wrapper.unmount()
    await vi.waitFor(() => expect(getLighting()?.getState().simulation).toBe(true))
  })
})

describe('lumières plein écran : appareils', () => {
  it('importe le modèle 6 pupitres et teste le premier appareil', async () => {
    await seedLighting({ fixtures: [] })
    const { wrapper } = await toEquip()
    expect(sel(wrapper, 'lights-keep').exists()).toBe(false)
    await click(wrapper, 'lights-six-desk')
    expect(sel(wrapper, 'lights-fixture').exists()).toBe(true)
    expect(wrapper.text()).toContain(`Appareil 1 sur ${RIG_SIZE}`)
    expect(sel(wrapper, 'lights-question').text()).toBe('Est-ce que ça s’allume ?')
  })

  it('Oui, Non puis Passer, et le récapitulatif garde les buzzers', async () => {
    await saveBuzzerKeymap(Object.fromEntries([['KeyB', { desk: 1, button: 'A' } as const]]))
    await seedLighting({ fixtures: [] })
    const { wrapper, router } = await toEquip()
    await click(wrapper, 'lights-six-desk')

    await click(wrapper, 'lights-yes')
    expect(wrapper.text()).toContain(`Appareil 2 sur ${RIG_SIZE}`)

    // Non : l'aide propose de vérifier l'adresse et le câble ; « Réessayer » repose la question.
    await click(wrapper, 'lights-no')
    expect(sel(wrapper, 'lights-help').text()).toContain('adresse DMX')
    expect(sel(wrapper, 'lights-help').text()).toContain('câble DMX')
    await click(wrapper, 'lights-retry')
    expect(sel(wrapper, 'lights-question').exists()).toBe(true)

    await click(wrapper, 'lights-no')
    await click(wrapper, 'lights-skip')
    expect(wrapper.text()).toContain(`Appareil 3 sur ${RIG_SIZE}`)

    for (let remaining = RIG_SIZE - 2; remaining > 0; remaining -= 1) {
      await click(wrapper, 'lights-yes')
    }
    expect(sel(wrapper, 'lights-done').text()).toBe('Tes lumières sont prêtes !')
    expect(sel(wrapper, 'lights-recap').text()).toBe(
      `${RIG_SIZE - 1} appareil(s) OK, 1 à vérifier.`
    )

    await click(wrapper, 'lights-finish')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))
    const config = getRoomHardwareConfig()
    expect(config.lighting.fixtures).toHaveLength(RIG_SIZE)
    expect(config.buzzers.keymap).toEqual(Object.fromEntries([['KeyB', { desk: 1, button: 'A' }]]))
  })

  it('quitter pendant l’application des lumières ne lance pas le test', async () => {
    await seedLighting({ fixtures: [] })
    const { wrapper } = await toEquip()
    const controller = await startLighting()
    const begin = vi.spyOn(controller.diagnostics, 'begin')
    void sel(wrapper, 'lights-six-desk').trigger('click')
    wrapper.unmount()
    await flushPromises()
    expect(begin).not.toHaveBeenCalled()
  })

  it('quitter en cours de test n’enregistre rien', async () => {
    await seedLighting({ fixtures: [] })
    const { wrapper, router } = await toEquip()
    await click(wrapper, 'lights-six-desk')
    void sel(wrapper, 'lights-quit').trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))
    // La page reprend les lumières enregistrées en quittant l'écran.
    wrapper.unmount()
    await flushPromises()
    expect(getRoomHardwareConfig().lighting.fixtures).toEqual([])
  })
})

describe('lumières plein écran : fumée', () => {
  it('fumée conservée après le modèle 6 pupitres', async () => {
    await seedLighting({
      fixtures: [
        { id: 'par1', name: 'PAR du fond', profileId: 'par-rgb', address: 1 },
        { id: 'fumee', name: 'Fumée', profileId: 'smoke-dmx', address: 400 },
      ],
    })
    const { wrapper } = await toEquip()
    await click(wrapper, 'lights-six-desk')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await flushPromises()
    for (let remaining = RIG_SIZE; remaining > 0; remaining -= 1) {
      await click(wrapper, 'lights-yes')
    }
    await click(wrapper, 'lights-smoke-next')
    await click(wrapper, 'lights-finish')
    const fixtures = getRoomHardwareConfig().lighting.fixtures
    expect(fixtures).toHaveLength(RIG_SIZE + 1)
    expect(fixtures.find((item) => item.profileId === 'smoke-dmx')?.address).toBe(400)
  })

  it('refuse le modèle si une adresse chevauche la machine à fumée', async () => {
    await seedLighting({
      fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-dmx', address: 20 }],
    })
    const { wrapper } = await toEquip()
    await click(wrapper, 'lights-six-desk')
    expect(sel(wrapper, 'lights-equip-error').exists()).toBe(true)
    expect(sel(wrapper, 'lights-fixture').exists()).toBe(false)
  })

  it('renvoie vers l’assistant et laisse la fumée désactivée', async () => {
    await seedLighting(SMOKE_ROOM)
    const { wrapper, router } = await mountLights()
    await click(wrapper, 'lights-scan-next')
    await click(wrapper, 'lights-keep')
    // La machine à fumée n'est jamais « allumée » pour un test : seul le PAR l'est.
    expect(wrapper.text()).toContain('Appareil 1 sur 1')
    await click(wrapper, 'lights-yes')

    expect(sel(wrapper, 'lights-smoke').exists()).toBe(true)
    expect(wrapper.text()).toContain('reste désactivée')
    await click(wrapper, 'lights-smoke-link')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('hardware'))
    expect(router.currentRoute.value.query.tab).toBe('assistant')
    expect(getRoomHardwareConfig().lighting.smoke.enabled).toBe(false)
  })

  it('« Continuer » mène à la fin sans activer la fumée', async () => {
    await seedLighting(SMOKE_ROOM)
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-scan-next')
    await click(wrapper, 'lights-keep')
    await click(wrapper, 'lights-yes')
    await click(wrapper, 'lights-smoke-next')
    expect(sel(wrapper, 'lights-done').exists()).toBe(true)
    await click(wrapper, 'lights-finish')
    expect(getRoomHardwareConfig().lighting.smoke.enabled).toBe(false)
  })
})

const FOUR_PAR = 'lights-model-four-desks-four-par-rgbw'
const SIX_DESKS = 'lights-model-six-desks-eight-heads'

async function answerYes(wrapper: Wrapper, count: number) {
  for (let remaining = count; remaining > 0; remaining -= 1) {
    await click(wrapper, 'lights-yes')
  }
}

describe('lumières plein écran : modèles de salle', () => {
  it('liste les modèles du paquet matériel avec leur taille', async () => {
    const { wrapper } = await toEquip()
    const names = ROOM_TEMPLATES.map((template) => sel(wrapper, `lights-model-${template.id}`))
    expect(names.every((button) => button.exists())).toBe(true)
    expect(sel(wrapper, FOUR_PAR).text()).toContain('4 pupitres, 4 PAR RVBW')
    expect(sel(wrapper, FOUR_PAR).text()).toContain('4 pupitres, 4 appareils')
  })

  it('sur une salle vide, applique le modèle sans confirmation et teste ses appareils', async () => {
    await seedLighting({ fixtures: [] })
    const desksCount = getRoomHardwareConfig().desksCount
    const { wrapper } = await toEquip()
    await click(wrapper, FOUR_PAR)
    expect(useConfirm().state.open).toBe(false)
    expect(wrapper.text()).toContain('Appareil 1 sur 4')

    await answerYes(wrapper, 4)
    await click(wrapper, 'lights-finish')
    const config = getRoomHardwareConfig()
    expect(config.lighting.fixtures).toHaveLength(4)
    expect(config.desksCount).toBe(desksCount)
  })

  it('sur une salle déjà réglée, demande confirmation ; refuser ne change rien', async () => {
    await seedLighting({
      fixtures: [{ id: 'par1', name: 'PAR du fond', profileId: 'par-rgb', address: 1 }],
    })
    const before = getRoomHardwareConfig().lighting
    const { wrapper } = await toEquip()

    void sel(wrapper, FOUR_PAR).trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    expect(useConfirm().state.message).toContain('4 pupitres, 4 PAR RVBW')
    useConfirm().cancel()
    await flushPromises()

    expect(stepOf(wrapper)).toBe('equip')
    expect(getRoomHardwareConfig().lighting).toEqual(before)
    // Les appareils actuels sont toujours ceux proposés au test.
    await click(wrapper, 'lights-keep')
    expect(wrapper.text()).toContain('Appareil 1 sur 1')
  })

  it('sur une salle déjà réglée, confirmer remplace les appareils', async () => {
    await seedLighting({
      fixtures: [{ id: 'par1', name: 'PAR du fond', profileId: 'par-rgb', address: 1 }],
    })
    const { wrapper } = await toEquip()
    void sel(wrapper, FOUR_PAR).trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await flushPromises()
    expect(wrapper.text()).toContain('Appareil 1 sur 4')
    await answerYes(wrapper, 4)
    await click(wrapper, 'lights-finish')
    const names = getRoomHardwareConfig().lighting.fixtures.map((fixture) => fixture.name)
    expect(names).toHaveLength(4)
    expect(names).not.toContain('PAR du fond')
  })

  it('un modèle ne touche jamais à la fumée : machine et réglages gardés', async () => {
    await seedLighting({
      fixtures: [
        { id: 'par1', name: 'PAR du fond', profileId: 'par-rgb', address: 1 },
        { id: 'fumee', name: 'Fumée', profileId: 'smoke-dmx', address: 400 },
      ],
    })
    const smokeBefore = getRoomHardwareConfig().lighting.smoke
    expect(smokeBefore.enabled).toBe(false)
    const { wrapper } = await toEquip()
    void sel(wrapper, FOUR_PAR).trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await flushPromises()
    await answerYes(wrapper, 4)
    await click(wrapper, 'lights-smoke-next')
    await click(wrapper, 'lights-finish')

    const { fixtures, smoke } = getRoomHardwareConfig().lighting
    expect(smoke).toEqual(smokeBefore)
    expect(fixtures.filter((fixture) => fixture.profileId === 'smoke-dmx')).toHaveLength(1)
    expect(fixtures).toHaveLength(5)
  })

  it('refuse un modèle qui chevauche la machine à fumée, sans rien changer', async () => {
    await seedLighting({
      fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-dmx', address: 5 }],
    })
    const { wrapper } = await toEquip()
    await click(wrapper, FOUR_PAR)
    expect(sel(wrapper, 'lights-equip-error').exists()).toBe(true)
    expect(stepOf(wrapper)).toBe('equip')
  })

  it('désactive un modèle à plusieurs univers sur une interface USB', async () => {
    installFakeSerial(createFakeUsbPort())
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-usb')
    await click(wrapper, 'lights-scan-next')
    const multi = sel(wrapper, SIX_DESKS)
    expect(multi.attributes('disabled')).toBeDefined()
    expect(multi.text()).toContain('Demande un boîtier réseau')
    expect(sel(wrapper, FOUR_PAR).attributes('disabled')).toBeUndefined()
  })

  it('les modèles sont des boutons nommés, dans un groupe titré, sans bouton principal de plus', async () => {
    const { wrapper } = await toEquip()
    const group = sel(wrapper, 'lights-models')
    const title = document.getElementById(group.attributes('aria-labelledby') ?? '')
    expect(title?.textContent?.trim()).toBe('Ou pars d’un modèle de salle')
    for (const button of group.findAll('button')) {
      expect(button.attributes('type')).toBe('button')
      expect(button.text()).not.toBe('')
    }
    expect(primaryTests(wrapper)).toEqual([])
  })
})

const node = (universes?: string[]) => [
  {
    ip: '192.168.1.20',
    shortName: 'NET-3',
    longName: 'Boîtier',
    ...(universes ? { universes } : {}),
  },
]

// Pont Art-Net factice : il s'ouvre et acquitte le hello (l'application des lumières s'y connecte).
class AckSocket {
  readyState = 0
  bufferedAmount = 0
  binaryType = 'blob'
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null

  constructor() {
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
    })
  }

  send(data: unknown) {
    if (typeof data === 'string' && (JSON.parse(data) as { type: string }).type === 'hello') {
      const ack = { type: 'ack', protocol: 1, bridge: 'b', universes: 16 }
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(ack) }))
    }
  }

  close() {
    this.readyState = 3
  }
}

describe('lumières plein écran : proposition d’univers', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', AckSocket)
  })

  afterEach(async () => {
    await stopLighting()
    vi.unstubAllGlobals()
  })

  it('propose les sorties du boîtier ; confirmer place les appareils', async () => {
    await seedLighting({ fixtures: [] })
    bridge.nodes = node(['0.0.1'])
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-scan-next')
    void sel(wrapper, FOUR_PAR).trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    expect(useConfirm().state.message).toContain('0.0.1')
    expect(useConfirm().state.message).toContain('4 appareil(s)')
    useConfirm().accept()
    await flushPromises()

    await answerYes(wrapper, 4)
    await click(wrapper, 'lights-finish')
    const { fixtures, driver } = getRoomHardwareConfig().lighting
    expect(driver).toBe('artnet-bridge')
    expect(fixtures.map((fixture) => fixture.universe)).toEqual([1, 1, 1, 1])
  })

  it('refuser la proposition garde les univers actuels', async () => {
    await seedLighting({ fixtures: [] })
    bridge.nodes = node(['0.0.1'])
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-scan-next')
    void sel(wrapper, FOUR_PAR).trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().cancel()
    await flushPromises()

    expect(wrapper.text()).toContain('Appareil 1 sur 4')
    await answerYes(wrapper, 4)
    await click(wrapper, 'lights-finish')
    const universes = getRoomHardwareConfig().lighting.fixtures.map(
      (fixture) => fixture.universe ?? 0
    )
    expect(universes).toEqual([0, 0, 0, 0])
  })

  it('ne propose rien quand le boîtier n’annonce aucune sortie', async () => {
    await seedLighting({ fixtures: [] })
    bridge.nodes = node()
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-scan-next')
    await click(wrapper, FOUR_PAR)
    expect(useConfirm().state.open).toBe(false)
    expect(wrapper.text()).toContain('Appareil 1 sur 4')
  })

  it('sur les appareils gardés, décale les univers dans un ordre sans chevauchement', async () => {
    await seedLighting({
      fixtures: [
        { id: 'haut', name: 'Haut', profileId: 'par-rgb', address: 1, universe: 2 },
        { id: 'bas', name: 'Bas', profileId: 'par-rgb', address: 1, universe: 1 },
      ],
    })
    bridge.nodes = node(['0.0.0', '0.0.1'])
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-scan-next')
    void sel(wrapper, 'lights-keep').trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await flushPromises()

    await answerYes(wrapper, 2)
    await click(wrapper, 'lights-finish')
    const universes = Object.fromEntries(
      getRoomHardwareConfig().lighting.fixtures.map((fixture) => [
        fixture.id,
        fixture.universe ?? 0,
      ])
    )
    expect(universes).toEqual({ haut: 1, bas: 0 })
  })

  it('placer les appareils ne change pas les réglages de la fumée', async () => {
    await seedLighting({
      fixtures: [
        { id: 'par1', name: 'PAR du fond', profileId: 'par-rgb', address: 1 },
        { id: 'fumee', name: 'Fumée', profileId: 'smoke-dmx', address: 400 },
      ],
    })
    const smokeBefore = getRoomHardwareConfig().lighting.smoke
    bridge.nodes = node(['0.0.1'])
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-scan-next')
    void sel(wrapper, 'lights-keep').trigger('click')
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await flushPromises()
    await answerYes(wrapper, 1)
    await click(wrapper, 'lights-smoke-next')
    await click(wrapper, 'lights-finish')
    expect(getRoomHardwareConfig().lighting.smoke).toEqual(smokeBefore)
  })
})

const barTests = (wrapper: Wrapper) =>
  wrapper.findAll('[data-test="wizard-bar"] button').map((button) => button.attributes('data-test'))
const primaryTests = (wrapper: Wrapper) =>
  wrapper.findAll('.ui-btn--primary').map((button) => button.attributes('data-test'))

describe('lumières plein écran : squelette, bouton principal et accessibilité', () => {
  it('chaque étape a un seul principal à droite, tous les boutons de la barre de même taille', async () => {
    await seedLighting(SMOKE_ROOM)
    const { wrapper } = await mountLights()

    const check = (bar: string[], primaries: string[]) => {
      expect(barTests(wrapper)).toEqual(bar)
      expect(primaryTests(wrapper)).toEqual(primaries)
      for (const button of wrapper.findAll('[data-test="wizard-bar"] button')) {
        expect(button.classes()).toContain('ui-btn--lg')
      }
    }

    check(['lights-scan-next'], ['lights-scan-next'])
    await click(wrapper, 'lights-scan-next')
    // Équipement : le choix se fait sur les cartes, la barre ne garde que Retour.
    check(['lights-equip-back'], [])
    await click(wrapper, 'lights-keep')
    check(['lights-no', 'lights-yes'], ['lights-yes'])
    await click(wrapper, 'lights-no')
    check(['lights-skip', 'lights-retry'], ['lights-retry'])
    await click(wrapper, 'lights-retry')
    await click(wrapper, 'lights-yes')
    check(['lights-smoke-link', 'lights-smoke-next'], ['lights-smoke-next'])
    await click(wrapper, 'lights-smoke-next')
    check(['lights-finish'], ['lights-finish'])
  })

  it('les cartes de choix de l’équipement ont un nom accessible non vide', async () => {
    await seedLighting(SMOKE_ROOM)
    const { wrapper } = await toEquip()

    const cards = wrapper.findAll('.choice')
    expect(cards.map((card) => card.attributes('data-test'))).toEqual([
      'lights-six-desk',
      'lights-keep',
      'lights-later',
    ])
    for (const card of cards) {
      const ids = (card.attributes('aria-labelledby') ?? '').split(' ').filter(Boolean)
      expect(ids.length).toBeGreaterThan(0)
      const name = ids
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim()
      expect(name).not.toBe('')
      expect(card.attributes('aria-describedby')).toBeTruthy()
    }
  })

  it('les messages d’état sont du texte avec role="status", jamais un bouton', async () => {
    // Rien trouvé.
    const empty = await mountLights()
    const none = sel(empty.wrapper, 'lights-none')
    expect(none.element.tagName).toBe('LI')
    expect(none.attributes('role')).toBe('status')
    expect(none.find('button').exists()).toBe(false)
    empty.wrapper.unmount()

    // Interface USB trouvée.
    installFakeSerial(createFakeUsbPort())
    const { wrapper } = await mountLights()
    await click(wrapper, 'lights-usb')
    const found = sel(wrapper, 'lights-found-usb')
    expect(found.element.tagName).toBe('LI')
    expect(found.attributes('role')).toBe('status')
    expect(found.find('button').exists()).toBe(false)
  })
})
