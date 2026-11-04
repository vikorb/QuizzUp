import type { SerialPortLike } from '@quizzup/hardware'

import {
  connectDmxInterface,
  getDmxPort,
  getDmxStats,
  getLighting,
  saveRoomHardwareConfig,
  startLighting,
  switchToSimulatedLights,
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
