import { MAX_FREEZE_MS } from '@quizzup/hardware'
import { flushPromises } from '@vue/test-utils'

import { useConfirm } from '@/composables/useConfirm'
import {
  getLighting,
  getRoomHardwareConfig,
  saveBuzzerKeymap,
  saveRoomHardwareConfig,
  SMOKE_PROOF_STORAGE_KEY,
  stopLighting,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { connectSmokeBoard, resetSmokeBoard, useSmokeBoard } from '@/hardware/smokeBoard'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import HardwareView from '@/views/hardware/HardwareView.vue'

import { createFakeBoardPort } from '../_helpers/fakeBoardPort'
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

/** Lance le test de gel (deux confirmations) jusqu'à « en cours », sans répondre. */
async function startFreezeTest(wrapper: Wrapper) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const freeze = sel(wrapper, 'assistant-freeze').trigger('click')
  await acceptConfirmations(2)
  await freeze
  await flushPromises()
  vi.useRealTimers()
  expect(sel(wrapper, 'freeze-running').exists()).toBe(true)
}

/** Carte retenue dans la config de la salle, avant l'assistant (un lien prêt n'est pas nécessaire aux textes). */
async function rememberBoard() {
  const config = getRoomHardwareConfig()
  await saveRoomHardwareConfig({
    ...config,
    lighting: {
      ...config.lighting,
      smoke: {
        ...config.lighting.smoke,
        board: { kind: 'uno-serial', usbVendorId: 0x2341, usbProductId: 0x0043 },
      },
    },
  })
}

async function confirmationTexts(wrapper: Wrapper) {
  await sel(wrapper, 'check-physicalStop').setValue(true)
  await sel(wrapper, 'check-timedRelay').setValue(true)
  const freeze = sel(wrapper, 'assistant-freeze').trigger('click')
  const texts: string[] = []
  for (let index = 0; index < 2; index += 1) {
    await vi.waitFor(() => expect(useConfirm().state.open).toBe(true))
    texts.push(useConfirm().state.message)
    useConfirm().accept()
    await flushPromises()
  }
  await freeze
  await flushPromises()
  return texts
}

/** Carte et interface DMX ensemble : le sélecteur propose d'abord la carte, puis l'interface. */
async function openWithBoard(profile = 'smoke-relay') {
  const board = createFakeBoardPort()
  const dmx = createFakeUsbPort()
  const requests = [board.port, dmx]
  Object.defineProperty(navigator, 'serial', {
    value: {
      requestPort: async () => requests.shift(),
      getPorts: async () => [dmx, board.port],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    configurable: true,
  })
  await expect(connectSmokeBoard()).resolves.toBe('ready')
  const wrapper = await openSmokeStep('usbpro', profile)
  return { board, wrapper }
}

/** Test de coupure lancé jusqu'à la question, `beforeAnswer` agit pendant que la fumée « tourne ». */
async function freezeUntilQuestion(wrapper: Wrapper, beforeAnswer = () => {}) {
  await sel(wrapper, 'check-physicalStop').setValue(true)
  if (sel(wrapper, 'check-timedRelay').exists()) {
    await sel(wrapper, 'check-timedRelay').setValue(true)
  }
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const freeze = sel(wrapper, 'assistant-freeze').trigger('click')
  await acceptConfirmations(2)
  await freeze
  await flushPromises()
  expect(sel(wrapper, 'freeze-running').exists()).toBe(true)
  beforeAnswer()
  await vi.advanceTimersByTimeAsync(MAX_FREEZE_MS)
  vi.useRealTimers()
  await flushPromises()
  expect(sel(wrapper, 'freeze-question').text()).toContain('La carte a-t-elle coupé')
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
    await resetSmokeBoard()
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

  it('test relancé puis abandonné : l’ancienne preuve est effacée, la fumée reste refusée', async () => {
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('usbpro', 'smoke-dmx')
    await runSignalLossTest(wrapper)
    await click(wrapper, 'freeze-ok')
    expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).not.toBeNull()
    await sel(wrapper, 'check-siteRules').setValue(true)

    // Nouveau test : la fumée ne s'arrête pas, l'installateur recharge la page sans répondre.
    await startFreezeTest(wrapper)
    expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).toBeNull()
    wrapper.unmount()
    await flushPromises()

    await vi.waitFor(() => expect(getLighting()?.getState().smoke.status).toBe('disabled'))
    expect(useRoomHardware().smokeNeedsTest.value).toBe(true)
  })

  it('« elle s’est arrêtée » sans preuve posée : message, test non validé', async () => {
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('usbpro', 'smoke-dmx')
    await runSignalLossTest(wrapper)
    const original = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === SMOKE_PROOF_STORAGE_KEY) {
        throw new Error('quota')
      }
      original.call(this, key, value)
    })
    await click(wrapper, 'freeze-ok')
    spy.mockRestore()

    expect(sel(wrapper, 'freeze-proof-missing').text()).toContain('refais le test')
    expect((sel(wrapper, 'check-freezeTest').element as HTMLInputElement).checked).toBe(false)
    expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).toBeNull()
  })

  it('« elle s’est arrêtée » avec preuve posée : pas de message', async () => {
    installFakeSerial(createFakeUsbPort())
    const wrapper = await openSmokeStep('usbpro', 'smoke-dmx')
    await runSignalLossTest(wrapper)
    await click(wrapper, 'freeze-ok')

    expect(sel(wrapper, 'freeze-proof-missing').exists()).toBe(false)
    expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).not.toBeNull()
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

  describe('fumée par la carte USB : texte du test de coupure', () => {
    it('carte : le texte dit que la carte coupe en moins d’une seconde', async () => {
      installFakeSerial(createFakeUsbPort())
      await rememberBoard()
      const wrapper = await openSmokeStep('usbpro', 'smoke-relay')

      expect(sel(wrapper, 'freeze-hint').text()).toContain('la carte USB')
      expect(sel(wrapper, 'freeze-hint').text()).toContain('en moins d’une seconde')
      expect(sel(wrapper, 'freeze-hint').text()).not.toContain('relais temporisé')
      expect(sel(wrapper, 'assistant-freeze').text()).toContain('plantage simulé')
      const [, second] = await confirmationTexts(wrapper)
      expect(second).toContain('La carte doit couper la fumée toute seule, en moins d’une seconde')
    })

    it('carte : réponse « elle s’est arrêtée » avec la carte restée prête valide le test', async () => {
      const { wrapper } = await openWithBoard()
      await freezeUntilQuestion(wrapper)

      await click(wrapper, 'freeze-ok')

      expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).not.toBeNull()
      expect((sel(wrapper, 'check-freezeTest').element as HTMLInputElement).checked).toBe(true)
      expect(wrapper.text()).not.toContain('la carte n’a pas coupé à temps')
    })

    it.each([
      ['fault', (board: ReturnType<typeof createFakeBoardPort>) => board.reboot()],
      ['disconnected', (board: ReturnType<typeof createFakeBoardPort>) => board.unplug()],
    ])(
      'carte en %s pendant le test : « elle s’est arrêtée » ne valide rien',
      async (view, breakBoard) => {
        const { board, wrapper } = await openWithBoard()
        await freezeUntilQuestion(wrapper, () => breakBoard(board))
        await vi.waitFor(() => expect(useSmokeBoard().view.value).toBe(view))

        await click(wrapper, 'freeze-ok')

        expect(wrapper.text()).toContain('la carte n’a pas coupé à temps')
        expect(localStorage.getItem(SMOKE_PROOF_STORAGE_KEY)).toBeNull()
        expect((sel(wrapper, 'check-freezeTest').element as HTMLInputElement).checked).toBe(false)
        expect(getLighting()?.getState().emergency).toBe(true)
      }
    )

    it('carte : l’échec ne décoche pas « coupe sur perte de signal » (ce n’est pas ce qui a été testé)', async () => {
      const { wrapper } = await openWithBoard('smoke-dmx')
      await sel(wrapper, 'smoke-cuts-on-signal-loss').setValue(true)
      await freezeUntilQuestion(wrapper)

      await click(wrapper, 'freeze-ko')

      expect(wrapper.text()).toContain('la carte n’a pas coupé à temps')
      const box = sel(wrapper, 'smoke-cuts-on-signal-loss').element as HTMLInputElement
      expect(box.checked).toBe(true)
    })

    it('DMX : le texte garde le relais temporisé', async () => {
      installFakeSerial(createFakeUsbPort())
      const wrapper = await openSmokeStep('usbpro', 'smoke-relay')

      expect(sel(wrapper, 'freeze-hint').text()).toContain('relais temporisé')
      expect(sel(wrapper, 'freeze-hint').text()).not.toContain('la carte USB')
      const [, second] = await confirmationTexts(wrapper)
      expect(second).toContain('Si la fumée ne s’arrête pas seule')
      expect(second).not.toContain('La carte')
    })
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
