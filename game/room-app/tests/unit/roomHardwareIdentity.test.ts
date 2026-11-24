import type { SerialPortLike } from '@quizzup/hardware'

import {
  connectDmxInterface,
  getBuzzerInput,
  getDmxPort,
  getLighting,
  getRoomHardwareConfig,
  resetRoomHardware,
  saveLearnedBuzzers,
  saveRoomHardwareConfig,
  saveRoomSetup,
  startLighting,
  stopLighting,
  useRoomHardware,
} from '@/hardware/roomHardware'

const FTDI = { usbVendorId: 0x04_03, usbProductId: 0x60_01 }
const UNO = { usbVendorId: 0x23_41, usbProductId: 0x00_43 }
const CH340 = { usbVendorId: 0x1a_86, usbProductId: 0x75_23 }

/** Interface USB factice : accepte toutes les trames. */
function createFakePort(info = FTDI): SerialPortLike & { frames: number } {
  const port = {
    frames: 0,
    open: async () => undefined,
    close: async () => undefined,
    getInfo: () => info,
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

/** `getPorts()` rend les ports autorisés, `requestPort()` celui que l'opérateur choisit. */
function installSerial(granted: SerialPortLike[], chosen?: SerialPortLike) {
  const serial = {
    requestPort: vi.fn(async () => chosen ?? granted[0]),
    getPorts: async () => granted,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  Object.defineProperty(navigator, 'serial', { value: serial, configurable: true })
}

const usbOf = () => getRoomHardwareConfig().lighting.usb
const sourceOf = () => getRoomHardwareConfig().buzzers.source

describe('interface USB DMX : identité retenue et retrouvée après un redémarrage', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serial')
  })

  it('retient le modèle de l’interface connectée, sans relancer les lumières', async () => {
    const port = createFakePort(CH340)
    installSerial([port])
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro' } })
    const controller = await startLighting()

    await connectDmxInterface()

    expect(usbOf()).toEqual(CH340)
    expect(getLighting()).toBe(controller)
    expect(getDmxPort()).toBe(port)
  })

  it('après un redémarrage, reprend le port du modèle retenu parmi plusieurs autorisés', async () => {
    const arduino = createFakePort(UNO)
    const dmx = createFakePort(CH340)
    installSerial([arduino, dmx])
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro', usb: CH340 } })

    await startLighting()

    await vi.waitFor(() => expect(dmx.frames).toBeGreaterThan(0))
    expect(getDmxPort()).toBe(dmx)
    expect(arduino.frames).toBe(0)
    expect(useRoomHardware().dmxPortProblem.value).toBeNull()
  })

  it('ne prend pas un autre modèle quand celui qui est retenu est absent', async () => {
    const other = createFakePort(FTDI)
    installSerial([other])
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro', usb: CH340 } })

    await startLighting()

    expect(other.frames).toBe(0)
    expect(getLighting()?.getState().simulation).toBe(true)
    expect(useRoomHardware().dmxPortProblem.value).toBeNull()
  })

  it('au redémarrage des lumières, un autre modèle autorisé n’est pas pris à la place du retenu', async () => {
    const dmx = createFakePort(CH340)
    installSerial([dmx])
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro', usb: CH340 } })
    await startLighting()
    await vi.waitFor(() => expect(getDmxPort()).toBe(dmx))

    // L'interface retenue n'est plus autorisée ; une autre puce DMX connue l'est.
    const other = createFakePort(FTDI)
    installSerial([other])
    await stopLighting()
    await startLighting()

    expect(other.frames).toBe(0)
    expect(getDmxPort()).toBeNull()
  })

  it('deux interfaces identiques : aucune n’est ouverte et l’ambiguïté est signalée', async () => {
    const first = createFakePort(FTDI)
    const second = createFakePort(FTDI)
    installSerial([first, second])
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro', usb: FTDI } })

    await startLighting()

    expect(first.frames + second.frames).toBe(0)
    expect(getLighting()?.getState().simulation).toBe(true)
    expect(useRoomHardware().dmxPortProblem.value).toBe('ambiguous')
  })

  it('sans identité retenue, l’ancien choix est inchangé (une puce DMX connue)', async () => {
    const dmx = createFakePort(FTDI)
    installSerial([createFakePort({ usbVendorId: 0x12_34, usbProductId: 1 }), dmx])
    await saveRoomHardwareConfig({ lighting: { driver: 'usbpro' } })

    await startLighting()

    await vi.waitFor(() => expect(dmx.frames).toBeGreaterThan(0))
    expect(getDmxPort()).toBe(dmx)
    expect(usbOf()).toBeUndefined()
  })

  describe('la carte de la fumée n’est jamais ouverte en DMX', () => {
    const boardConfig = { kind: 'uno-serial', ...UNO }

    it('identité retenue égale à celle de la carte : refus signalé, aucune ouverture', async () => {
      const board = createFakePort(UNO)
      installSerial([board])
      await saveRoomHardwareConfig({
        lighting: { driver: 'usbpro', usb: UNO, smoke: { board: boardConfig } },
      })

      await startLighting()

      expect(board.frames).toBe(0)
      expect(getLighting()?.getState().simulation).toBe(true)
      expect(useRoomHardware().dmxPortProblem.value).toBe('smoke_board')
    })

    it('le choix sans identité retenue écarte aussi la carte', async () => {
      const board = createFakePort(UNO)
      installSerial([board, createFakePort(FTDI)])
      await saveRoomHardwareConfig({
        lighting: { driver: 'usbpro', smoke: { board: boardConfig } },
      })

      await startLighting()

      expect(board.frames).toBe(0)
    })

    it('refuse la carte choisie dans la fenêtre du navigateur : rien n’est ouvert ni retenu', async () => {
      const board = createFakePort(UNO)
      const open = vi.spyOn(board, 'open')
      installSerial([board], board)
      await saveRoomHardwareConfig({
        lighting: { driver: 'usbpro', smoke: { board: boardConfig } },
      })
      await startLighting()

      const connected = await connectDmxInterface()

      expect(connected).toBe(false)
      expect(open).not.toHaveBeenCalled()
      expect(board.frames).toBe(0)
      expect(usbOf()).toBeUndefined()
      expect(getLighting()?.getState().simulation).toBe(true)
      expect(useRoomHardware().dmxPortProblem.value).toBe('smoke_board')
    })

    it('un bon choix levé après un refus : l’interface s’ouvre et le signal disparaît', async () => {
      const board = createFakePort(UNO)
      const dmx = createFakePort(CH340)
      installSerial([board, dmx], board)
      await saveRoomHardwareConfig({
        lighting: { driver: 'usbpro', smoke: { board: boardConfig } },
      })
      await startLighting()
      expect(await connectDmxInterface()).toBe(false)

      installSerial([board, dmx], dmx)

      expect(await connectDmxInterface()).toBe(true)
      expect(useRoomHardware().dmxPortProblem.value).toBeNull()
      expect(usbOf()).toEqual(CH340)
      expect(board.frames).toBe(0)
    })
  })
})

describe('buzzers manette : id retenu à l’apprentissage, ambiguïté signalée', () => {
  const BOARD_ID = 'BBI-32 Button Box Interface (Vendor: 0483 Product: 5750)'
  const makePad = (index: number, id = BOARD_ID) => ({
    index,
    id,
    connected: true,
    timestamp: 0,
    buttons: [{ pressed: false }, { pressed: false }],
  })
  const KEYMAP = Object.fromEntries([['GamepadButton0', { desk: 1, button: 'A' } as const]])
  const withPads = (pads: ReturnType<typeof makePad>[]) =>
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    await resetRoomHardware()
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'getGamepads')
  })

  const start = async () => {
    await saveRoomHardwareConfig({
      buzzers: { keymap: KEYMAP, source: { kind: 'gamepad', match: 'BBI' } },
    })
    getBuzzerInput()
    await vi.advanceTimersByTimeAsync(10)
  }

  it('retient l’id de la carte lue quand les buzzers sont appris', async () => {
    withPads([makePad(0, 'Xbox Controller'), makePad(1)])
    await start()

    await saveLearnedBuzzers(KEYMAP)

    expect(sourceOf()).toEqual({ kind: 'gamepad', match: 'BBI', id: BOARD_ID })
  })

  it('l’assistant plein écran retient aussi l’id', async () => {
    withPads([makePad(0)])
    await start()

    await saveRoomSetup({
      layout: getRoomHardwareConfig().buzzers.layout,
      desksCount: 4,
      keymap: KEYMAP,
    })

    expect(sourceOf()).toMatchObject({ kind: 'gamepad', id: BOARD_ID })
  })

  it('ne retient rien au clavier', async () => {
    withPads([makePad(0)])
    await saveRoomHardwareConfig({ buzzers: { keymap: KEYMAP, source: { kind: 'keyboard' } } })

    await saveLearnedBuzzers(KEYMAP)

    expect(sourceOf()).toEqual({ kind: 'keyboard' })
  })

  it('deux cartes identiques : aucune carte retenue ni lue, ambiguïté signalée', async () => {
    withPads([makePad(0), makePad(1)])
    await start()

    expect(useRoomHardware().buzzerCardAmbiguous.value).toBe(2)
    expect(useRoomHardware().buzzerState.value?.active).toBe(false)
    await saveLearnedBuzzers(KEYMAP)
    expect(sourceOf()).toEqual({ kind: 'gamepad', match: 'BBI' })
  })

  it('l’ambiguïté se lève quand une carte est débranchée', async () => {
    const pads = [makePad(0), makePad(1)]
    withPads(pads)
    await start()
    expect(useRoomHardware().buzzerCardAmbiguous.value).toBe(2)

    const [, second] = pads
    if (second) {
      second.connected = false
    }
    await vi.advanceTimersByTimeAsync(10)

    expect(useRoomHardware().buzzerCardAmbiguous.value).toBe(0)
    expect(useRoomHardware().buzzerState.value?.active).toBe(true)
  })

  it('l’id retenu ne laisse lire que cette carte, même si une autre correspond à `match`', async () => {
    withPads([makePad(0, 'BBI-32 autre version'), makePad(1)])
    await saveRoomHardwareConfig({
      buzzers: { keymap: KEYMAP, source: { kind: 'gamepad', match: 'BBI', id: BOARD_ID } },
    })
    getBuzzerInput()
    await vi.advanceTimersByTimeAsync(10)

    expect(useRoomHardware().buzzerState.value?.active).toBe(true)
    expect(useRoomHardware().buzzerCardAmbiguous.value).toBe(0)
  })
})
