import {
  createSerialOutput,
  DMX_USB_VENDOR_IDS,
  getGrantedDmxPort,
  getWebSerial,
  isWebSerialSupported,
  OPEN_DMX_BREAK_MS,
  OPEN_DMX_FRAME_MS,
  requestDmxPort,
} from '@hardware/dmx/serialOutput'
import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import { createUniverse } from '@hardware/dmx/universe'

import { createFakePort, createFakeSerial } from '../_helpers/fakeSerial'

describe('sortie simulation', () => {
  it('garde la dernière trame et prévient les abonnés', async () => {
    const output = createSimulationOutput()
    const frames = vi.fn()
    output.onFrame(frames)
    await output.open()
    const universe = createUniverse()
    universe[0] = 9
    await output.write(universe)
    universe[0] = 1
    expect(output.lastFrame()[0]).toBe(9)
    expect(output.framesSent()).toBe(1)
    expect(frames).toHaveBeenCalledTimes(1)
    await output.close()
  })

  it('simule un débranchement', () => {
    const output = createSimulationOutput()
    const onDisconnect = vi.fn()
    output.onDisconnect(onDisconnect)
    output.simulateDisconnect()
    expect(onDisconnect).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('Web Serial', () => {
  it('détecte la disponibilité de l’API', () => {
    expect(getWebSerial({} as Navigator)).toBeNull()
    expect(isWebSerialSupported({} as Navigator)).toBe(false)
    expect(getWebSerial(undefined)).toBeNull()
    const serial = createFakeSerial([])
    expect(isWebSerialSupported({ serial } as unknown as Navigator)).toBe(true)
  })

  it('demande une interface en filtrant les puces USB-série connues', async () => {
    const { port } = createFakePort()
    const serial = createFakeSerial([port])
    expect(await requestDmxPort(serial)).toBe(port)
    expect(serial.requested[0]).toEqual({
      filters: DMX_USB_VENDOR_IDS.map((usbVendorId) => ({ usbVendorId })),
    })
    await expect(requestDmxPort(null)).rejects.toThrow('Chrome ou Edge')
  })

  it('retrouve une interface déjà autorisée', async () => {
    const { port } = createFakePort()
    expect(await getGrantedDmxPort(createFakeSerial([port]))).toBe(port)
    expect(await getGrantedDmxPort(createFakeSerial([]))).toBeNull()
    expect(await getGrantedDmxPort(null)).toBeNull()
  })
})

describe('sortie série DMX USB Pro', () => {
  it('ouvre le port et envoie des trames label 6', async () => {
    const { port, released } = createFakePort()
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await output.open()
    expect(port.openedWith).toEqual({ baudRate: 57_600 })
    const universe = createUniverse()
    universe[4] = 77
    await output.write(universe)
    expect(port.written[0]?.[0]).toBe(0x7e)
    expect(port.written[0]?.[9]).toBe(77)
    await output.close()
    expect(released()).toBe(1)
    expect(port.closed).toBe(true)
  })

  it('refuse d’écrire avant ouverture', async () => {
    const { port } = createFakePort()
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await expect(output.write(createUniverse())).rejects.toThrow('non ouverte')
  })

  it('échoue si le port n’a pas de flux d’écriture', async () => {
    const { port } = createFakePort({ noWritable: true })
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await expect(output.open()).rejects.toThrow('flux')
  })

  it('signale une erreur d’écriture et un débranchement', async () => {
    const { port } = createFakePort()
    const serial = createFakeSerial([port])
    const output = createSerialOutput({ port, driver: 'usbpro', serial })
    const onDisconnect = vi.fn()
    output.onDisconnect(onDisconnect)
    await output.open()

    port.failNextWrite(new Error('USB'))
    await expect(output.write(createUniverse())).rejects.toThrow('USB')
    expect(onDisconnect).toHaveBeenCalledTimes(1)

    // Après une écriture en échec, l'événement de débranchement n'est pas signalé deux fois.
    serial.disconnect(port)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    await output.close()

    const reopened = createSerialOutput({ port, driver: 'usbpro', serial })
    const onSecond = vi.fn()
    reopened.onDisconnect(onSecond)
    await reopened.open()
    serial.disconnect(createFakePort().port)
    expect(onSecond).not.toHaveBeenCalled()
    serial.disconnect(port)
    expect(onSecond).toHaveBeenCalledTimes(1)
    await output.close()
  })

  it('utilise navigator.serial par défaut', async () => {
    const { port } = createFakePort()
    const output = createSerialOutput({ port, driver: 'usbpro' })
    await output.open()
    await output.close()
    expect(port.closed).toBe(true)
  })

  it('ignore les erreurs de fermeture', async () => {
    const { port } = createFakePort()
    port.close = async () => {
      throw new Error('déjà fermé')
    }
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await expect(output.close()).resolves.toBeUndefined()
  })
})

describe('sortie série Open DMX', () => {
  it('ouvre en 250 kbauds 8N2 et envoie un break avant chaque trame', async () => {
    const { port } = createFakePort()
    const sleep = vi.fn().mockResolvedValue(undefined)
    const output = createSerialOutput({ port, driver: 'opendmx', serial: null, sleep })
    await output.open()
    expect(port.openedWith).toEqual({ baudRate: 250_000, dataBits: 8, stopBits: 2, parity: 'none' })
    await output.write(createUniverse())
    expect(port.signals).toEqual([{ break: true }, { break: false }])
    expect(sleep.mock.calls).toEqual([[OPEN_DMX_BREAK_MS], [OPEN_DMX_FRAME_MS]])
    expect(port.written[0]).toHaveLength(513)
  })

  it('attend par défaut avant de relâcher le break', async () => {
    const { port } = createFakePort()
    const output = createSerialOutput({ port, driver: 'opendmx', serial: null })
    await output.open()
    await output.write(createUniverse())
    expect(port.signals).toHaveLength(2)
  })

  it('échoue proprement sans setSignals', async () => {
    const { port } = createFakePort({ withSignals: false })
    const output = createSerialOutput({ port, driver: 'opendmx', serial: null })
    await output.open()
    await expect(output.write(createUniverse())).rejects.toThrow('break')
  })
})
