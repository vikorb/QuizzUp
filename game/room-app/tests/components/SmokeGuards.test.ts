import { MAX_FREEZE_MS } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import { useConfirm } from '@/composables/useConfirm'
import { getLighting, saveBuzzerKeymap, stopLighting } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { createFakeUsbPort, installFakeSerial, uninstallFakeSerial } from '../_helpers/fakeUsb'
import { mountWithApp } from '../_helpers/mount'

type Wrapper = Awaited<ReturnType<typeof mountWithApp>>['wrapper']

const sel = (wrapper: Wrapper, name: string) => wrapper.find(`[data-test="${name}"]`)

async function click(wrapper: Wrapper, name: string) {
  await sel(wrapper, name).trigger('click')
  await flushPromises()
}

async function acceptConfirmations(count: number) {
  for (let index = 0; index < count; index += 1) {
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    useConfirm().accept()
    await flushPromises()
  }
}

/** Pont factice : annonce ses capacités, répond `held` aux demandes de gel et note leur durée. */
const bridge = { features: ['poll', 'hold'] as string[], holds: [] as number[] }

class BridgeSocket {
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
    if (typeof data !== 'string') {
      return
    }
    const message = JSON.parse(data) as { type: string; ms?: number }
    let reply: unknown = null
    if (message.type === 'hello') {
      reply = {
        type: 'ack',
        protocol: 1,
        bridge: 'b',
        universes: 16,
        artnet: { target: null, port: 6454, source: 'none' },
        features: bridge.features,
      }
    } else if (message.type === 'hold') {
      bridge.holds.push(message.ms ?? 0)
      reply = { type: 'held', ms: message.ms }
    }
    if (reply) {
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(reply) }))
    }
  }

  close() {
    this.readyState = 3
  }
}

function fullKeymap() {
  const keymap: Record<string, { desk: 1 | 2 | 3 | 4; button: 'A' | 'B' | 'C' | 'D' }> = {}
  for (const [index, letter] of [...'BCGHIJKLMNOPTUYZ'].entries()) {
    keymap[`Key${letter}`] = {
      desk: (Math.floor(index / 4) + 1) as 1 | 2 | 3 | 4,
      button: 'ABCD'[index % 4] as 'A' | 'B' | 'C' | 'D',
    }
  }
  return keymap
}

/** Assistant jusqu'à l'étape fumée, avec une seule machine de profil `profile`. */
async function openSmokeStep(driver: 'usbpro' | 'artnet-bridge', profile: string) {
  await saveBuzzerKeymap(fullKeymap())
  const { wrapper } = await mountWithApp(HardwareView, { route: '/hardware' })
  await click(wrapper, 'tab-assistant')
  await click(wrapper, 'assistant-next')
  await sel(wrapper, 'buzzer-source').setValue('gamepad')
  await sel(wrapper, 'gamepad-match').setValue('BU0836')
  await click(wrapper, 'assistant-next')
  await sel(wrapper, `driver-${driver}`).setValue(true)
  await click(wrapper, 'assistant-connect')
  await vi.waitFor(() => expect(getLighting()?.getState().simulation).toBe(false))
  await click(wrapper, 'assistant-next')
  await sel(wrapper, 'fixture-profile').setValue(profile)
  await click(wrapper, 'fixture-add')
  await click(wrapper, 'assistant-next')
  expect(sel(wrapper, 'step-smoke').exists()).toBe(true)
  await sel(wrapper, 'smoke-enable').setValue(true)
  return wrapper
}

/** Lance le test de perte de signal (machine sans relais) jusqu'à la question finale. */
async function runSignalLossTest(wrapper: Wrapper) {
  await sel(wrapper, 'smoke-cuts-on-signal-loss').setValue(true)
  await sel(wrapper, 'check-physicalStop').setValue(true)
  expect(sel(wrapper, 'freeze-hint').text()).toContain('vraie perte de signal')
  expect(sel(wrapper, 'assistant-freeze').text()).toContain('perte de signal')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const freeze = sel(wrapper, 'assistant-freeze').trigger('click')
  await acceptConfirmations(2)
  await freeze
  await flushPromises()
  // Guidage : débrancher le câble pendant que l'interface répète la fumée.
  expect(sel(wrapper, 'freeze-running').text()).toContain('Débranche')
  await vi.advanceTimersByTimeAsync(MAX_FREEZE_MS)
  vi.useRealTimers()
  await flushPromises()
  expect(sel(wrapper, 'freeze-question').text()).toContain('débranchement')
}

describe('assistant : garde-fous de la fumée', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
    bridge.features = ['poll', 'hold']
    bridge.holds = []
  })
  afterEach(async () => {
    await stopLighting()
    vi.unstubAllGlobals()
    uninstallFakeSerial()
    Reflect.deleteProperty(globalThis, 'isSecureContext')
  })

  it('machine sans relais : avertissement, raison de désactivation, case à cocher explicite', async () => {
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('usbpro', 'smoke-dmx')
    expect(sel(wrapper, 'smoke-no-relay').text()).toContain('pas de relais temporisé')
    expect(sel(wrapper, 'smoke-disabled').text()).toContain('sans relais temporisé')
    // Le relais n'existe pas : sa vérification n'est pas proposée.
    expect(sel(wrapper, 'check-timedRelay').exists()).toBe(false)
    expect(sel(wrapper, 'check-physicalStop').exists()).toBe(true)

    await sel(wrapper, 'smoke-cuts-on-signal-loss').setValue(true)
    expect(sel(wrapper, 'smoke-disabled').text()).toContain('liste de contrôle')
    expect(sel(wrapper, 'smoke-disabled').text()).not.toContain('sans relais temporisé')
    // Le test de gel devient possible sans relais, une fois l'arrêt physique coché.
    await sel(wrapper, 'check-physicalStop').setValue(true)
    expect(sel(wrapper, 'assistant-freeze').attributes('disabled')).toBeUndefined()

    // Décocher la case rétablit le refus.
    await sel(wrapper, 'smoke-cuts-on-signal-loss').setValue(false)
    expect(sel(wrapper, 'smoke-disabled').text()).toContain('sans relais temporisé')
  })

  it('sans relais : test guidé de perte de signal, « elle continue » désactive la fumée', async () => {
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('usbpro', 'smoke-dmx')
    await runSignalLossTest(wrapper)
    await click(wrapper, 'freeze-ko')
    expect(wrapper.text()).toContain('ne coupe pas toute seule sur perte de signal')
    expect(getLighting()?.getState().emergency).toBe(true)
    // La case est décochée : la fumée reste désactivée, avec la raison.
    const box = sel(wrapper, 'smoke-cuts-on-signal-loss').element as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(sel(wrapper, 'smoke-disabled').text()).toContain('sans relais temporisé')
    expect(wrapper.text()).toContain('réussir le test de perte de signal')
  })

  it('sans relais : « elle s’est arrêtée » valide le test de gel', async () => {
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('usbpro', 'smoke-dmx')
    await runSignalLossTest(wrapper)
    await click(wrapper, 'freeze-ok')
    expect((sel(wrapper, 'check-freezeTest').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).not.toContain('ne coupe pas toute seule')
    await sel(wrapper, 'check-siteRules').setValue(true)
    expect(sel(wrapper, 'smoke-disabled').exists()).toBe(false)
  })

  it('machine à relais : le test de gel garde son texte (relais temporisé)', async () => {
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('usbpro', 'smoke-relay')
    expect(sel(wrapper, 'freeze-hint').text()).toContain('relais temporisé')
    expect(sel(wrapper, 'freeze-hint').text()).not.toContain('vraie perte de signal')
  })

  it('machine à relais : ni case ni avertissement', async () => {
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('usbpro', 'smoke-relay')
    expect(sel(wrapper, 'smoke-no-relay').exists()).toBe(false)
    expect(sel(wrapper, 'check-timedRelay').exists()).toBe(true)
  })

  it('pont Art-Net : le test de gel gèle la sortie du pont (hold) pendant la durée du test', async () => {
    vi.stubGlobal('WebSocket', BridgeSocket)
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('artnet-bridge', 'smoke-relay')
    await sel(wrapper, 'check-physicalStop').setValue(true)
    await sel(wrapper, 'check-timedRelay').setValue(true)

    const freeze = sel(wrapper, 'assistant-freeze').trigger('click')
    await acceptConfirmations(2)
    await freeze
    await flushPromises()
    await vi.waitFor(() => expect(bridge.holds).toEqual([MAX_FREEZE_MS]))
    expect(sel(wrapper, 'freeze-running').exists()).toBe(true)
    await click(wrapper, 'freeze-abort')
    expect(getLighting()?.getState().emergency).toBe(true)
  })

  it('pont Art-Net trop ancien (sans hold) : test refusé avant toute confirmation', async () => {
    bridge.features = ['poll']
    vi.stubGlobal('WebSocket', BridgeSocket)
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('artnet-bridge', 'smoke-relay')
    await sel(wrapper, 'check-physicalStop').setValue(true)
    await sel(wrapper, 'check-timedRelay').setValue(true)

    await click(wrapper, 'assistant-freeze')
    expect(useConfirm().state.open).toBe(false)
    expect(wrapper.text()).toContain('trop ancien')
    expect(bridge.holds).toEqual([])
  })
})
