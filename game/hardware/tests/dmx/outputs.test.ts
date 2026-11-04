import type { SerialPortLike } from '@hardware/dmx/serialOutput'
import {
  createSerialOutput,
  DMX_USB_VENDOR_IDS,
  getGrantedDmxPort,
  getWebSerial,
  isWebSerialSupported,
  OPEN_DMX_FRAME_MS,
  requestDmxPort,
  SERIAL_CLOSE_TIMEOUT_MS,
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

  describe('choix parmi plusieurs ports autorisés', () => {
    const portWith = (usbVendorId?: number, usbProductId?: number): SerialPortLike => {
      const { port } = createFakePort()
      if (usbVendorId !== undefined) {
        port.getInfo = () => ({ usbVendorId, usbProductId })
      }
      return port
    }

    it('sans match, préfère une puce USB-série DMX connue, sinon le premier port', async () => {
      const unknown = portWith(0x1234, 1)
      const ftdi = portWith(0x0403, 0x6001)
      expect(await getGrantedDmxPort(createFakeSerial([unknown, ftdi]))).toBe(ftdi)
      expect(await getGrantedDmxPort(createFakeSerial([unknown]))).toBe(unknown)
      expect(await getGrantedDmxPort(createFakeSerial([portWith()]))).not.toBeNull()
    })

    it('avec match, préfère le même port, puis le même modèle, puis une puce DMX', async () => {
      const ftdi = portWith(0x0403, 0x6001)
      const ch340 = portWith(0x1a86, 0x7523)
      const sameModel = portWith(0x1a86, 0x7523)
      const unknown = portWith(0x1234, 1)

      const serial = createFakeSerial([unknown, ftdi, sameModel, ch340])
      expect(await getGrantedDmxPort(serial, { match: ch340 })).toBe(ch340)
      // Le même objet n'est plus listé (rechargement) : même fabricant + produit USB.
      const reloaded = createFakeSerial([unknown, ftdi, sameModel])
      expect(await getGrantedDmxPort(reloaded, { match: ch340 })).toBe(sameModel)
      // Modèle absent : une autre puce DMX connue plutôt qu'un port quelconque.
      expect(await getGrantedDmxPort(createFakeSerial([unknown, ftdi]), { match: ch340 })).toBe(
        ftdi
      )
    })

    it('avec match, ne renvoie jamais un port non DMX', async () => {
      const ch340 = portWith(0x1a86, 0x7523)
      const unknown = portWith(0x1234, 1)
      const noInfo = portWith()
      const serial = createFakeSerial([unknown, noInfo])
      expect(await getGrantedDmxPort(serial, { match: ch340 })).toBeNull()
      expect(await getGrantedDmxPort(createFakeSerial([]), { match: ch340 })).toBeNull()
      // Un port sans informations USB n'est repris que s'il s'agit du même objet.
      expect(await getGrantedDmxPort(serial, { match: noInfo })).toBe(noInfo)
      expect(await getGrantedDmxPort(serial, { match: portWith() })).toBeNull()
    })
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

  it('échoue si le port n’a pas de flux d’écriture, et le referme', async () => {
    const { port } = createFakePort({ noWritable: true })
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await expect(output.open()).rejects.toThrow('flux')
    expect(port.isOpen).toBe(false)
    // Le port n'est pas resté ouvert : une nouvelle tentative échoue pour la même raison.
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
    await reopened.close()
    expect(port.isOpen).toBe(false)
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

  it('libère le verrou après une erreur d’écriture : fermeture puis reconnexion du même port', async () => {
    const { port, aborted } = createFakePort()
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await output.open()
    port.failNextWrite(new Error('USB'))
    await expect(output.write(createUniverse())).rejects.toThrow('USB')
    expect(aborted()).toBe(1)
    expect(port.locked).toBe(false)

    await output.close()
    expect(port.isOpen).toBe(false)

    await output.open()
    await output.write(createUniverse())
    expect(port.written).toHaveLength(1)
    await output.close()
    expect(port.isOpen).toBe(false)
  })

  it('libère le verrou après un débranchement', async () => {
    const { port } = createFakePort()
    const serial = createFakeSerial([port])
    const output = createSerialOutput({ port, driver: 'usbpro', serial })
    await output.open()
    serial.disconnect(port)
    expect(port.locked).toBe(false)
    await output.close()
    expect(port.isOpen).toBe(false)
    await expect(output.open()).resolves.toBeUndefined()
    await output.close()
  })

  it('jette les octets en attente à la fermeture (abort) avant de fermer le port', async () => {
    const { port, aborted, released } = createFakePort()
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await output.open()
    await output.close()
    expect(aborted()).toBe(1)
    expect(released()).toBe(1)
    expect(port.isOpen).toBe(false)
  })

  it('abandonne une fermeture qui ne rend jamais la main (interface figée)', async () => {
    const { port } = createFakePort()
    const output = createSerialOutput({
      port,
      driver: 'usbpro',
      serial: null,
      closeTimeoutMs: 20,
    })
    await output.open()
    port.close = () => new Promise<void>(() => undefined)
    const started = Date.now()
    await expect(output.close()).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('borne la fermeture à environ une seconde par défaut', async () => {
    vi.useFakeTimers()
    try {
      const { port } = createFakePort()
      const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
      await output.open()
      port.close = () => new Promise<void>(() => undefined)
      let done = false
      const closing = output.close().then(() => {
        done = true
      })
      await vi.advanceTimersByTimeAsync(SERIAL_CLOSE_TIMEOUT_MS - 1)
      expect(done).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await closing
      expect(done).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('tolère un writer dont abort ou releaseLock échouent', async () => {
    const { port } = createFakePort()
    const writable = port.writable!
    port.writable = {
      getWriter: () => {
        const inner = writable.getWriter()
        return {
          write: (chunk: Uint8Array) => inner.write(chunk),
          abort: () => Promise.reject(new Error('abort impossible')),
          releaseLock: () => {
            inner.releaseLock()
            throw new TypeError('déjà libéré')
          },
        }
      },
    } as unknown as WritableStream<Uint8Array>
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await output.open()
    await expect(output.close()).resolves.toBeUndefined()
    expect(port.isOpen).toBe(false)
  })
})

describe('sortie série Open DMX', () => {
  it('ouvre en 250 kbauds 8N2 et envoie un break sans minuteur avant chaque trame', async () => {
    const { port } = createFakePort()
    const sleep = vi.fn().mockResolvedValue(undefined)
    const output = createSerialOutput({ port, driver: 'opendmx', serial: null, sleep })
    await output.open()
    expect(port.openedWith).toEqual({ baudRate: 250_000, dataBits: 8, stopBits: 2, parity: 'none' })
    await output.write(createUniverse())
    expect(port.signals).toEqual([{ break: true }, { break: false }])
    // Ni attente pour le break, ni attente après la trame.
    expect(sleep).not.toHaveBeenCalled()
    expect(port.written[0]).toHaveLength(513)
  })

  it('n’attend que le reste de la durée d’émission de la trame précédente', async () => {
    const { port } = createFakePort()
    let now = 100
    const sleep = vi.fn(async (ms: number) => {
      now += ms
    })
    const output = createSerialOutput({
      port,
      driver: 'opendmx',
      serial: null,
      sleep,
      now: () => now,
    })
    await output.open()
    await output.write(createUniverse())
    expect(sleep).not.toHaveBeenCalled()

    // Trame suivante 5 ms plus tard : la précédente est encore sur le câble.
    now += 5
    await output.write(createUniverse())
    expect(sleep.mock.calls).toEqual([[OPEN_DMX_FRAME_MS - 5]])

    // Rythme normal (30 Hz) ou onglet masqué (minuteurs bridés à ~1 s) : aucune attente.
    now += 33
    await output.write(createUniverse())
    now += 1000
    await output.write(createUniverse())
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(port.written).toHaveLength(4)
  })

  it('repart sans attente après une réouverture', async () => {
    const { port } = createFakePort()
    const now = 0
    const sleep = vi.fn().mockResolvedValue(undefined)
    const output = createSerialOutput({
      port,
      driver: 'opendmx',
      serial: null,
      sleep,
      now: () => now,
    })
    await output.open()
    await output.write(createUniverse())
    await output.close()
    await output.open()
    await output.write(createUniverse())
    expect(sleep).not.toHaveBeenCalled()
  })

  it('utilise l’horloge et l’attente par défaut', async () => {
    const { port } = createFakePort()
    const output = createSerialOutput({ port, driver: 'opendmx', serial: null })
    await output.open()
    await output.write(createUniverse())
    await output.write(createUniverse())
    expect(port.signals).toHaveLength(4)
    expect(port.written).toHaveLength(2)
  })

  it('échoue proprement sans setSignals', async () => {
    const { port } = createFakePort({ withSignals: false })
    const output = createSerialOutput({ port, driver: 'opendmx', serial: null })
    await output.open()
    await expect(output.write(createUniverse())).rejects.toThrow('break')
  })
})
