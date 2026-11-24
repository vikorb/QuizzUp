import type { SerialPortLike } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import {
  connectDmxInterface,
  getBuzzerInput,
  resetRoomHardware,
  saveRoomHardwareConfig,
  startLighting,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'
import SetupLightsView from '@/views/SetupLightsView.vue'
import SetupView from '@/views/SetupView.vue'

import { createFakeUsbPort } from '../_helpers/fakeUsb'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

const FTDI = { usbVendorId: 0x04_03, usbProductId: 0x60_01 }
const UNO = { usbVendorId: 0x23_41, usbProductId: 0x00_43 }
const BOARD_ID = 'BBI-32 Button Box Interface (Vendor: 0483 Product: 5750)'

/** `getPorts()` rend les ports autorisés, `requestPort()` celui que l'opérateur choisit. */
function installPorts(granted: SerialPortLike[], chosen?: SerialPortLike) {
  const serial = {
    requestPort: async () => chosen ?? granted[0],
    getPorts: async () => granted,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  Object.defineProperty(navigator, 'serial', { value: serial, configurable: true })
}

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']
const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)
async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

const SMOKE_BOARD = { kind: 'uno-serial', ...UNO }

const makePad = (index: number) => ({
  index,
  id: BOARD_ID,
  connected: true,
  timestamp: 0,
  buttons: [{ pressed: false }],
})

/** Deux cartes manettes de même nom, lues par l'écran (l'API Gamepad ne les distingue pas). */
async function plugTwinGamepads() {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [makePad(0), makePad(1)],
  })
  await saveRoomHardwareConfig({
    buzzers: { source: { kind: 'gamepad', match: 'BBI' } },
  })
  getBuzzerInput()
  await vi.waitFor(() => expect(useRoomHardware().buzzerCardAmbiguous.value).toBe(2))
}

describe('signaux d’identité des périphériques : ce que l’opérateur voit', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
  })

  afterEach(async () => {
    await resetRoomHardware()
    Reflect.deleteProperty(navigator, 'serial')
    Reflect.deleteProperty(navigator, 'getGamepads')
    Reflect.deleteProperty(globalThis, 'isSecureContext')
  })

  it('Matériel : deux interfaces DMX identiques sont signalées', async () => {
    installPorts([createFakeUsbPort(FTDI), createFakeUsbPort(FTDI)])
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro', usb: FTDI } })
    await startLighting()

    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    expect(sel(wrapper, 'dmx-port-problem').text()).toContain('Deux interfaces DMX du même modèle')
    expect(sel(wrapper, 'buzzer-card-ambiguous').exists()).toBe(false)
  })

  it('Matériel : la carte de la fumée choisie comme interface est signalée', async () => {
    const board = createFakeUsbPort(UNO)
    installPorts([board], board)
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro', smoke: { board: SMOKE_BOARD } } })
    await startLighting()
    expect(await connectDmxInterface()).toBe(false)

    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    expect(sel(wrapper, 'dmx-port-problem').text()).toContain('carte de la fumée')
    expect(board.frames).toHaveLength(0)
  })

  it('Matériel : deux cartes de buzzers identiques sont signalées', async () => {
    await plugTwinGamepads()

    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    expect(sel(wrapper, 'buzzer-card-ambiguous').text()).toContain('2 cartes de buzzers identiques')
    expect(sel(wrapper, 'dmx-port-problem').exists()).toBe(false)
  })

  it('Matériel : rien n’est affiché quand tout est reconnu', async () => {
    installPorts([createFakeUsbPort(FTDI)])
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro', usb: FTDI } })
    await startLighting()

    const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })

    expect(sel(wrapper, 'dmx-port-problem').exists()).toBe(false)
    expect(sel(wrapper, 'buzzer-card-ambiguous').exists()).toBe(false)
  })

  it('/setup : deux cartes de buzzers identiques sont signalées pendant l’apprentissage', async () => {
    await plugTwinGamepads()

    const { wrapper } = await mountWithApp(SetupView, { route: '/setup' })
    await click(wrapper, 'setup-start')
    await click(wrapper, 'setup-layout-ok')
    await click(wrapper, 'setup-desks-ok')

    expect(sel(wrapper, 'setup-card-ambiguous').text()).toContain('2 cartes de buzzers identiques')
  })

  it('/setup/lights : la carte de la fumée choisie comme interface est refusée et signalée', async () => {
    const board = createFakeUsbPort(UNO)
    installPorts([board], board)
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro', smoke: { board: SMOKE_BOARD } } })

    const { wrapper } = await mountWithApp(SetupLightsView, { route: '/setup/lights' })
    await flushPromises()
    await click(wrapper, 'lights-usb')

    expect(sel(wrapper, 'lights-dmx-port-problem').text()).toContain('carte de la fumée')
    expect(sel(wrapper, 'lights-found-usb').exists()).toBe(false)
    expect(board.frames).toHaveLength(0)
  })
})
