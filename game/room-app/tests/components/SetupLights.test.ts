import { createSixDeskRoomRig } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import { useConfirm } from '@/composables/useConfirm'
import type * as Hardware from '@/hardware/roomHardware'
import {
  getRoomHardwareConfig,
  saveBuzzerKeymap,
  saveRoomHardwareConfig,
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
    const { wrapper, router } = await mountLights()
    expect(sel(wrapper, 'lights-usb').attributes('disabled')).toBeDefined()
    expect(sel(wrapper, 'lights-none').text()).toBe('Aucune interface : on continue en simulation')
    expect(sel(wrapper, 'lights-scan-next').text()).toBe('Continuer en simulation')
    await click(wrapper, 'lights-scan-next')
    await click(wrapper, 'lights-later')
    expect(sel(wrapper, 'lights-done').text()).toBe('Les lumières, plus tard')
    await click(wrapper, 'lights-finish')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))
    expect(getRoomHardwareConfig().lighting.driver).toBe('simulation')
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
