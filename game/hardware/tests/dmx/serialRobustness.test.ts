import { createMeteredOutput } from '@hardware/dmx/meteredOutput'
import {
  createSerialOutput,
  describePort,
  describeSerialError,
  watchDmxPortReconnection,
} from '@hardware/dmx/serialOutput'
import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import { createUniverse } from '@hardware/dmx/universe'

import { createFakePort, createFakeSerial } from '../_helpers/fakeSerial'
import { createManualClock } from '../_helpers/manualClock'

const domError = (name: string, message = name) => Object.assign(new Error(message), { name })

describe('ouverture robuste du port série', () => {
  it('referme et rouvre un port resté ouvert par la page', async () => {
    const { port } = createFakePort()
    let attempts = 0
    const open = port.open
    port.open = async (options) => {
      attempts += 1
      if (attempts === 1) {
        throw domError('InvalidStateError', 'The port is already open.')
      }
      await open(options)
    }
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await output.open()
    expect(attempts).toBe(2)
    expect(port.closed).toBe(true)
  })

  it('traduit un port occupé par un autre logiciel', async () => {
    const { port } = createFakePort()
    port.open = async () => {
      throw domError('NetworkError', 'Failed to open serial port.')
    }
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await expect(output.open()).rejects.toThrow('Interface occupée ou inaccessible')
  })

  it('traduit l’échec de la seconde tentative', async () => {
    const { port } = createFakePort()
    port.open = async () => {
      throw domError('InvalidStateError')
    }
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await expect(output.open()).rejects.toThrow('déjà ouverte')
  })
})

describe('describeSerialError', () => {
  it.each([
    [domError('NotFoundError'), 'cancelled'],
    [domError('InvalidStateError'), 'already_open'],
    [new Error('Port is already open'), 'already_open'],
    [domError('NetworkError'), 'busy'],
    [new Error('Failed to open serial port.'), 'busy'],
    [domError('SecurityError'), 'forbidden'],
    [domError('NotAllowedError'), 'forbidden'],
    [domError('BreakError'), 'disconnected'],
    [domError('BufferOverrunError'), 'disconnected'],
    [new Error('The device has been lost.'), 'disconnected'],
    [new Error('Web Serial indisponible : utilisez Chrome'), 'unsupported'],
    [new Error('autre chose'), 'unknown'],
    [null, 'unknown'],
  ])('%s → %s', (error, code) => {
    const description = describeSerialError(error)
    expect(description.code).toBe(code)
    expect(description.message.length).toBeGreaterThan(0)
    expect(description.hint.length).toBeGreaterThan(0)
  })
})

describe('describePort', () => {
  it('affiche le fabricant et les identifiants USB', () => {
    const { port } = createFakePort()
    expect(describePort(port)).toBe('Port série')
    port.getInfo = () => ({ usbVendorId: 0x0403, usbProductId: 0x6001 })
    expect(describePort(port)).toBe('FTDI 0403:6001')
    port.getInfo = () => ({ usbVendorId: 0x1234 })
    expect(describePort(port)).toBe('USB 1234:0000')
  })
})

describe('reconnexion à chaud', () => {
  const connect = (serial: ReturnType<typeof createFakeSerial>, port: unknown) =>
    serial.emit('connect', port)

  it('prévient quand l’interface est rebranchée', () => {
    const serial = createFakeSerial([])
    const { port } = createFakePort()
    port.getInfo = () => ({ usbVendorId: 0x0403, usbProductId: 0x6001 })
    const other = createFakePort().port
    other.getInfo = () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 })
    const same = createFakePort().port
    same.getInfo = () => ({ usbVendorId: 0x0403, usbProductId: 0x6001 })

    const onReconnect = vi.fn()
    const stop = watchDmxPortReconnection({ serial, match: port, onReconnect })
    connect(serial, other)
    expect(onReconnect).not.toHaveBeenCalled()
    connect(serial, same)
    expect(onReconnect).toHaveBeenCalledWith(same)
    connect(serial, null)
    stop()
    connect(serial, same)
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('accepte toute interface sans filtre, et ne fait rien sans Web Serial', () => {
    const serial = createFakeSerial([])
    const onReconnect = vi.fn()
    watchDmxPortReconnection({ serial, onReconnect })
    const { port } = createFakePort()
    connect(serial, port)
    expect(onReconnect).toHaveBeenCalledWith(port)
    // Ports sans informations USB : seule la même instance correspond.
    const watched = vi.fn()
    watchDmxPortReconnection({ serial, match: port, onReconnect: watched })
    connect(serial, createFakePort().port)
    expect(watched).not.toHaveBeenCalled()
    connect(serial, port)
    expect(watched).toHaveBeenCalledTimes(1)

    expect(watchDmxPortReconnection({ serial: null, onReconnect })()).toBeUndefined()
    expect(watchDmxPortReconnection({ onReconnect })).toBeTypeOf('function')
  })
})

describe('mesure de la sortie', () => {
  it('compte les trames, la fréquence réelle et la durée des écritures', async () => {
    const clock = createManualClock(0)
    const inner = createSimulationOutput()
    const output = createMeteredOutput(inner, clock)
    await output.open()
    expect(output.getStats()).toMatchObject({ framesSent: 0, sinceLastFrameMs: null })
    for (let index = 0; index < 30; index += 1) {
      await output.write(createUniverse())
      clock.advance(33)
    }
    const stats = output.getStats()
    expect(stats.framesSent).toBe(30)
    expect(stats.measuredHz).toBeGreaterThanOrEqual(29)
    expect(stats.sinceLastFrameMs).toBe(33)
    expect(output.driver).toBe('simulation')
    clock.advance(2_000)
    expect(output.getStats().measuredHz).toBe(0)
    await output.close()
  })

  it('mesure les écritures lentes et les échecs', async () => {
    const clock = createManualClock(0)
    let fail = false
    const output = createMeteredOutput(
      {
        driver: 'usbpro',
        open: async () => undefined,
        write: async () => {
          clock.advance(12)
          if (fail) {
            throw new Error('USB')
          }
        },
        close: async () => undefined,
        onDisconnect: () => () => undefined,
      },
      clock
    )
    await output.write(createUniverse())
    fail = true
    await expect(output.write(createUniverse())).rejects.toThrow('USB')
    await expect(
      createMeteredOutput(
        { ...createSimulationOutput(), write: () => Promise.reject('brut') },
        clock
      ).write(createUniverse())
    ).rejects.toBe('brut')
    expect(output.getStats()).toMatchObject({
      framesSent: 1,
      failures: 1,
      averageWriteMs: 12,
      maxWriteMs: 12,
      lastError: 'USB',
    })
    output.resetStats()
    expect(output.getStats().failures).toBe(0)
  })

  it('garde un historique borné', async () => {
    const clock = createManualClock(0)
    const output = createMeteredOutput(createSimulationOutput(), clock)
    for (let index = 0; index < 600; index += 1) {
      await output.write(createUniverse())
    }
    expect(output.getStats().measuredHz).toBe(512)
  })
})
