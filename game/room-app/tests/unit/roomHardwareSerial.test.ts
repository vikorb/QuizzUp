import type { SerialPortLike } from '@quizzup/hardware'

import {
  BRIDGE_RETRY_MS,
  connectDmxInterface,
  EMERGENCY_STORAGE_KEY,
  getDmxPort,
  getDmxStats,
  getLighting,
  HARDWARE_STORAGE_KEY,
  resetRoomHardware,
  saveRoomHardwareConfig,
  startLighting,
  stopLighting,
  switchToSimulatedLights,
  triggerEmergencyStop,
  useRoomHardware,
} from '@/hardware/roomHardware'

type Listener = (event: Event) => void

/** Interface USB factice : accepte toutes les trames, se débranche à la demande. */
function createFakePort(): SerialPortLike & { frames: number } {
  const port = {
    frames: 0,
    open: async () => undefined,
    close: async () => undefined,
    getInfo: () => ({ usbVendorId: 0x04_03, usbProductId: 0x60_01 }),
    writable: {
      getWriter: () => ({
        write: async () => {
          port.frames += 1
        },
        releaseLock: () => undefined,
        abort: async () => undefined,
      }),
    } as unknown as WritableStream<Uint8Array>,
  }
  return port
}

function installSerial(port: SerialPortLike) {
  const listeners = new Map<string, Set<Listener>>()
  const serial = {
    requestPort: vi.fn(async () => port),
    getPorts: async () => [] as SerialPortLike[],
    addEventListener: (type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener)
    },
    emit: (type: string, target: SerialPortLike) => {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener({ target } as unknown as Event)
      }
    },
  }
  Object.defineProperty(navigator, 'serial', { value: serial, configurable: true })
  return serial
}

describe('interface USB DMX de la salle', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serial')
  })

  it('connecte l’interface choisie, mesure les trames et affiche le port', async () => {
    const port = createFakePort()
    installSerial(port)
    await startLighting()
    expect(getDmxStats()).toBeNull()
    expect(getDmxPort()).toBeNull()

    // Pilote passé par l'assistant, avant même d'enregistrer la config.
    await connectDmxInterface('usbpro')
    await vi.waitFor(() => expect(port.frames).toBeGreaterThan(0))
    expect(getLighting()?.getState().simulation).toBe(false)
    expect(getDmxPort()).toBe(port)
    await vi.waitFor(() => expect(getDmxStats()?.framesSent).toBeGreaterThan(0))

    await switchToSimulatedLights()
    expect(getDmxStats()).toBeNull()
    expect(getDmxPort()).toBeNull()
  })

  it('reprend l’interface rebranchée sans clic', async () => {
    const port = createFakePort()
    const serial = installSerial(port)
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro' } })
    await startLighting()
    await connectDmxInterface()
    const controller = getLighting()!

    // Débranchement : la sortie passe en erreur, puis le même modèle réapparaît.
    serial.emit('disconnect', port)
    await vi.waitFor(() => expect(controller.getState().outputStatus).toBe('error'))
    const replugged = createFakePort()
    serial.emit('connect', replugged)
    await vi.waitFor(() => expect(controller.getState().outputStatus).toBe('open'))
    await vi.waitFor(() => expect(replugged.frames).toBeGreaterThan(0))
    expect(getDmxPort()).toBe(replugged)
  })

  it('ne prend pas un autre appareil USB qui apparaît', async () => {
    const port = createFakePort()
    const serial = installSerial(port)
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro' } })
    await connectDmxInterface()
    const controller = getLighting()!
    serial.emit('disconnect', port)
    await vi.waitFor(() => expect(controller.getState().outputStatus).toBe('error'))

    const arduino = { ...createFakePort(), getInfo: () => ({ usbVendorId: 0x23_41 }) }
    serial.emit('connect', arduino)
    await Promise.resolve()
    expect(controller.getState().outputStatus).toBe('error')
  })
})

type BridgeMode = 'ready' | 'absent' | 'busy'

/** Pont Art-Net factice : répond à `hello`, refuse (`busy`) ou reste injoignable, garde les trames. */
class FakeBridgeSocket {
  static last: FakeBridgeSocket | null = null
  static instances: FakeBridgeSocket[] = []
  static mode: BridgeMode = 'ready'
  readyState = 0
  bufferedAmount = 0
  binaryType = 'blob'
  frames: Uint8Array[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null

  constructor(readonly url: string) {
    FakeBridgeSocket.last = this
    FakeBridgeSocket.instances.push(this)
    queueMicrotask(() => {
      if (FakeBridgeSocket.mode === 'absent') {
        this.readyState = 3
        this.onerror?.()
        return
      }
      this.readyState = 1
      this.onopen?.()
    })
  }

  send(data: unknown) {
    if (typeof data !== 'string') {
      this.frames.push(new Uint8Array(data as ArrayBuffer))
      return
    }
    queueMicrotask(() => {
      const busy = FakeBridgeSocket.mode === 'busy'
      this.onmessage?.({
        data: JSON.stringify(
          busy
            ? { type: 'error', code: 'busy', message: 'occupé' }
            : { type: 'ack', protocol: 1, bridge: 'quizzup-artnet-bridge' }
        ),
      })
    })
  }

  close() {
    this.readyState = 3
  }
}

const BRIDGE_CONFIG = {
  lighting: {
    driver: 'artnet-bridge',
    bridgeUrl: 'ws://127.0.0.1:7700',
    fixtures: [{ id: 'par1', name: 'PAR', profileId: 'par-rgb', address: 1 }],
  },
}

/** Trame de jeu (canaux DMX) sans l'en-tête de 3 octets du protocole. */
const isBlack = (frame: Uint8Array) => frame.subarray(3).every((value) => value === 0)

describe('pont Art-Net de la salle', () => {
  beforeEach(() => {
    FakeBridgeSocket.mode = 'ready'
    FakeBridgeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeBridgeSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    FakeBridgeSocket.last = null
  })

  it('reprend le pont sans clic au démarrage des lumières et mesure les trames', async () => {
    await saveRoomHardwareConfig({
      lighting: { driver: 'artnet-bridge', bridgeUrl: 'ws://127.0.0.1:7700' },
    })
    const { bridgeError } = useRoomHardware()
    await startLighting()

    expect(FakeBridgeSocket.last?.url).toBe('ws://127.0.0.1:7700')
    expect(getLighting()?.getState().simulation).toBe(false)
    expect(getLighting()?.getState().outputStatus).toBe('open')
    expect(bridgeError.value).toBeNull()
    await vi.waitFor(() => expect(FakeBridgeSocket.last?.frames.length).toBeGreaterThan(0))
    await vi.waitFor(() => expect(getDmxStats()?.framesSent).toBeGreaterThan(0))
    expect(getDmxPort()).toBeNull()

    // L'assistant change d'appareils : les lumières redémarrent et reprennent le pont.
    const first = FakeBridgeSocket.last
    await saveRoomHardwareConfig(BRIDGE_CONFIG)
    await vi.waitFor(() => expect(getLighting()?.getState().simulation).toBe(false))
    expect(FakeBridgeSocket.last).not.toBe(first)
  })

  it('reste en simulation quand le pont est absent, puis le reprend dès qu’il est lancé', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    FakeBridgeSocket.mode = 'absent'
    await saveRoomHardwareConfig(BRIDGE_CONFIG)
    const { bridgeError } = useRoomHardware()

    // Le démarrage n'est pas bloqué : il rend la main, les lumières tournent en simulation.
    const controller = await startLighting()
    expect(controller.getState().running).toBe(true)
    expect(controller.getState().simulation).toBe(true)
    expect(bridgeError.value).toContain('injoignable')
    expect(FakeBridgeSocket.instances).toHaveLength(1)

    // Pas de boucle serrée : rien avant le délai, puis un essai (toujours absent).
    await vi.advanceTimersByTimeAsync(BRIDGE_RETRY_MS - 1)
    expect(FakeBridgeSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeBridgeSocket.instances).toHaveLength(2)
    expect(getLighting()?.getState().simulation).toBe(true)

    // Le pont est lancé : l'essai suivant le reprend, sans clic.
    FakeBridgeSocket.mode = 'ready'
    await vi.advanceTimersByTimeAsync(BRIDGE_RETRY_MS)
    expect(FakeBridgeSocket.instances).toHaveLength(3)
    expect(getLighting()?.getState().simulation).toBe(false)
    expect(getLighting()?.getState().outputStatus).toBe('open')
    expect(bridgeError.value).toBeNull()

    // Connecté : plus aucun nouvel essai.
    await vi.advanceTimersByTimeAsync(BRIDGE_RETRY_MS * 3)
    expect(FakeBridgeSocket.instances).toHaveLength(3)
  })

  it('signale un pont occupé par un autre onglet, et le bouton « Connecter » refait un essai', async () => {
    FakeBridgeSocket.mode = 'busy'
    await saveRoomHardwareConfig(BRIDGE_CONFIG)
    const { bridgeError } = useRoomHardware()
    await startLighting()
    expect(getLighting()?.getState().simulation).toBe(true)
    expect(bridgeError.value).toContain('un autre onglet')

    FakeBridgeSocket.mode = 'ready'
    await connectDmxInterface()
    expect(getLighting()?.getState().simulation).toBe(false)
    expect(getLighting()?.getState().outputStatus).toBe('open')
    expect(bridgeError.value).toBeNull()
  })

  it('n’essaie plus le pont une fois la simulation choisie, ni après l’arrêt des lumières', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    FakeBridgeSocket.mode = 'absent'
    await saveRoomHardwareConfig(BRIDGE_CONFIG)
    await startLighting()
    await switchToSimulatedLights()
    await vi.advanceTimersByTimeAsync(BRIDGE_RETRY_MS * 3)
    expect(FakeBridgeSocket.instances).toHaveLength(1)

    await stopLighting()
    await vi.advanceTimersByTimeAsync(BRIDGE_RETRY_MS * 3)
    expect(FakeBridgeSocket.instances).toHaveLength(1)
  })

  describe('arrêt d’urgence et rechargement de la page', () => {
    it('ne laisse sortir que du noir après un rechargement, jusqu’au réarmement', async () => {
      await saveRoomHardwareConfig(BRIDGE_CONFIG)
      const before = await startLighting()
      // Témoin : sans arrêt d’urgence, la salle s’éclaire (au moins une trame non noire).
      await vi.waitFor(() =>
        expect(FakeBridgeSocket.last?.frames.some((frame) => !isBlack(frame))).toBe(true)
      )

      triggerEmergencyStop('operator')
      expect(before.getState().emergency).toBe(true)
      expect(localStorage.getItem(EMERGENCY_STORAGE_KEY)).toBe('operator')

      // Rechargement : la page repart de zéro, le stockage du PC reste.
      FakeBridgeSocket.instances = []
      await resetRoomHardware()
      const after = await startLighting()
      expect(after.getState().emergency).toBe(true)
      expect(after.getState().smoke.status).toBe('emergency')

      // Même une scène demandée avant tout réarmement ne sort pas.
      expect(after.playScene('victory')).toBe(false)
      await new Promise((resolve) => setTimeout(resolve, 150))
      const frames = FakeBridgeSocket.instances.flatMap((socket) => socket.frames)
      expect(frames.length).toBeGreaterThan(0)
      expect(frames.every(isBlack)).toBe(true)
      expect(localStorage.getItem(EMERGENCY_STORAGE_KEY)).toBe('operator')

      // Réarmement humain : la clé est effacée, la fumée reste désarmée.
      after.resetEmergency()
      expect(after.getState().emergency).toBe(false)
      expect(after.getState().smoke.armed).toBe(false)
      expect(localStorage.getItem(EMERGENCY_STORAGE_KEY)).toBeNull()
      await resetRoomHardware()
      expect((await startLighting()).getState().emergency).toBe(false)
    })

    it('garde l’arrêt d’urgence si le pont est absent au rechargement', async () => {
      FakeBridgeSocket.mode = 'absent'
      await saveRoomHardwareConfig(BRIDGE_CONFIG)
      localStorage.setItem(EMERGENCY_STORAGE_KEY, 'freeze_test_failed')
      const controller = await startLighting()
      expect(controller.getState().emergency).toBe(true)
      expect(controller.getState().emergencyReason).toBe('freeze_test_failed')
    })
  })

  it('applique une config sans l’enregistrer (test de coupure de la fumée)', async () => {
    await saveRoomHardwareConfig({ lighting: { refreshHz: 20 } })
    await saveRoomHardwareConfig(
      { lighting: { refreshHz: 25, smoke: { enabled: true } } },
      { persist: false }
    )
    expect(getLighting()).toBeNull()
    const stored = JSON.parse(localStorage.getItem(HARDWARE_STORAGE_KEY) ?? '{}')
    expect(stored.lighting.refreshHz).toBe(20)
    expect(stored.lighting.smoke.enabled).toBe(false)
  })
})
