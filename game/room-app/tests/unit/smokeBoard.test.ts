import { parseIntelHex, type SerialPortLike, writeIntelHex } from '@quizzup/hardware'

import {
  getLighting,
  getRoomHardwareConfig,
  saveRoomHardwareConfig,
  startLighting,
} from '@/hardware/roomHardware'
import {
  BACKUP_FILE_NAME,
  BUNDLED_PROGRAM_VERSION,
  connectSmokeBoard,
  installSmokeBoardProgram,
  reconnectSmokeBoard,
  resetSmokeBoard,
  restoreSmokeBoardProgram,
  useSmokeBoard,
} from '@/hardware/smokeBoard'

import bundledHex from '../../../hardware/firmware/fumee/fumee.hex?raw'
import { createFakeBoardPort, type FakeBoardOptions } from '../_helpers/fakeBoardPort'
import { saveWithSmokeProof } from '../_helpers/smokeProof'

type Listener = (event: Event) => void

const BOARD_USB = { usbVendorId: 0x2341, usbProductId: 0x0043 }
const SMOKE_LIGHTING = {
  fixtures: [{ id: 'fumee', name: 'Fumée', profileId: 'smoke-relay', address: 40 }],
  smoke: { enabled: true, requireConfirmation: false },
}

/** Faux `navigator.serial` : `granted` est la liste rendue par `getPorts`, `chosen` le port du sélecteur. */
function installSerial(chosen: SerialPortLike, granted: SerialPortLike[] = []) {
  const listeners = new Map<string, Set<Listener>>()
  const serial = {
    granted,
    requestPort: vi.fn(async () => chosen),
    getPorts: async () => serial.granted,
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

/** Salle avec fumée activée, carte retenue et test de coupure fait pour cette configuration. */
async function provisionedRoom(board = true) {
  await saveWithSmokeProof({
    lighting: {
      ...SMOKE_LIGHTING,
      smoke: {
        ...SMOKE_LIGHTING.smoke,
        ...(board ? { board: { kind: 'uno-serial', ...BOARD_USB } } : {}),
      },
    },
  })
  return startLighting()
}

const lighting = () => getLighting()!
const smoke = () => lighting().getState().smoke

async function readyBoard(options: FakeBoardOptions = {}) {
  const fake = createFakeBoardPort(options)
  const serial = installSerial(fake.port, [fake.port])
  await provisionedRoom()
  await reconnectSmokeBoard()
  await vi.waitFor(() => expect(useSmokeBoard().view.value).toBe('ready'))
  return { fake, serial }
}

afterEach(async () => {
  await resetSmokeBoard()
  Reflect.deleteProperty(navigator, 'serial')
})

describe('carte USB de la fumée : connexion et gardes', () => {
  it('retient la carte après la bannière, sans la prendre pour l’interface DMX', async () => {
    const fake = createFakeBoardPort()
    installSerial(fake.port)
    await provisionedRoom(false)

    await expect(connectSmokeBoard()).resolves.toBe('ready')

    expect(useSmokeBoard().view.value).toBe('ready')
    expect(getRoomHardwareConfig().lighting.smoke.board).toEqual({
      kind: 'uno-serial',
      ...BOARD_USB,
    })
    expect(getRoomHardwareConfig().lighting.usb).toBeUndefined()
  })

  it('refuse un port de même modèle que l’interface DMX de la salle', async () => {
    const fake = createFakeBoardPort()
    installSerial(fake.port)
    await saveRoomHardwareConfig({ lighting: { usb: BOARD_USB } })

    await expect(connectSmokeBoard()).resolves.toBe('same_as_dmx')

    expect(fake.opens).toEqual([])
    expect(getRoomHardwareConfig().lighting.smoke.board).toBeUndefined()
  })

  it('rend « annulé » quand l’opérateur ferme le sélecteur', async () => {
    const serial = installSerial(createFakeBoardPort().port)
    serial.requestPort.mockRejectedValueOnce(new Error('NotFoundError'))

    await expect(connectSmokeBoard()).resolves.toBe('cancelled')
  })

  it('refuse la fumée tant que la carte retenue n’est pas prête (board_unavailable)', async () => {
    installSerial(createFakeBoardPort().port)
    await provisionedRoom()
    expect(lighting().smoke.arm()).toBe(true)

    expect(lighting().smoke.fire(1000)).toEqual({ ok: false, reason: 'board_unavailable' })
  })

  it('refuse la fumée pendant la pause de démarrage de la carte', async () => {
    const { fake } = await readyBoard({ cool: true })
    expect(lighting().smoke.arm()).toBe(true)

    expect(lighting().smoke.fire(1000)).toEqual({ ok: false, reason: 'board_unavailable' })
    expect(fake.fireLines()).toBe(0)
  })

  it('envoie la fumée à la carte, puis la coupe et se désarme si le câble est arraché en plein tir', async () => {
    const { fake } = await readyBoard()
    expect(lighting().smoke.arm()).toBe(true)
    expect(lighting().smoke.fire(5000)).toMatchObject({ ok: true })
    await vi.waitFor(() => expect(fake.isOutputOn()).toBe(true))

    fake.unplug()

    await vi.waitFor(() => expect(smoke().status).not.toBe('firing'))
    expect(smoke().armed).toBe(false)
    expect(lighting().getState().lastWarning).toMatchObject({ kind: 'board_lost' })
    expect(lighting().smoke.fire(1000)).toMatchObject({ ok: false })
    expect(useSmokeBoard().view.value).toBe('disconnected')
  })

  it('reprend la carte rebranchée sans la réarmer', async () => {
    const { fake, serial } = await readyBoard()
    lighting().smoke.arm()
    fake.unplug()
    await vi.waitFor(() => expect(useSmokeBoard().view.value).toBe('disconnected'))

    const replugged = createFakeBoardPort()
    serial.granted = [replugged.port]
    serial.emit('connect', replugged.port)
    await vi.waitFor(() => expect(useSmokeBoard().view.value).toBe('ready'))

    expect(smoke().armed).toBe(false)
    expect(lighting().smoke.fire(1000)).toEqual({ ok: false, reason: 'not_armed' })
    expect(replugged.fireLines()).toBe(0)
    // Armée par l'opérateur, elle repart.
    lighting().smoke.arm()
    expect(lighting().smoke.fire(1000)).toMatchObject({ ok: true })
    await vi.waitFor(() => expect(replugged.isOutputOn()).toBe(true))
  })

  it('n’ouvre aucune carte quand deux ports ont le modèle retenu', async () => {
    const first = createFakeBoardPort()
    const second = createFakeBoardPort()
    installSerial(first.port, [first.port, second.port])
    await provisionedRoom()

    await reconnectSmokeBoard()

    expect(useSmokeBoard().ambiguous.value).toBe(true)
    expect([...first.opens, ...second.opens]).toEqual([])
  })

  it('l’arrêt d’urgence coupe la carte', async () => {
    const { fake } = await readyBoard()
    lighting().smoke.arm()
    lighting().smoke.fire(5000)
    await vi.waitFor(() => expect(fake.isOutputOn()).toBe(true))

    lighting().emergencyStop('operator')

    await vi.waitFor(() => expect(fake.isOutputOn()).toBe(false))
    expect(lighting().smoke.fire(1000)).toMatchObject({ ok: false })
  })
})

describe('carte USB de la fumée : installation du programme', () => {
  const OLD_PROGRAM = Uint8Array.from({ length: 600 }, (_value, index) => (index * 7 + 3) & 0xff)

  async function connected(options: FakeBoardOptions = {}) {
    const fake = createFakeBoardPort({ flash: OLD_PROGRAM, ...options })
    const serial = installSerial(fake.port, [fake.port])
    await provisionedRoom(false)
    // Carte sans programme QuizzUp : le port est tout de même celui de l'installation.
    await connectSmokeBoard()
    return { fake, serial }
  }

  it('le programme livré annonce la version attendue par l’écran', () => {
    const image = parseIntelHex(bundledHex)
    expect(new TextDecoder().decode(image)).toContain(`QZF READY 1 ${BUNDLED_PROGRAM_VERSION} `)
  })

  it('sauvegarde, installe, relit puis rouvre la carte désarmée, sans aucune commande de fumée', async () => {
    const { fake } = await connected()
    const downloads: { name: string; text: string }[] = []
    const duringInstall: unknown[] = []
    lighting().smoke.arm()

    await installSmokeBoardProgram({
      machineOff: true,
      download: (name, text) => {
        downloads.push({ name, text })
        // En pleine installation : armée ou non, aucune fumée ne part.
        duringInstall.push(lighting().smoke.fire(1000), useSmokeBoard().busy.value)
      },
    })

    expect(useSmokeBoard().install.value).toEqual({ phase: 'done', kind: 'install' })
    expect(downloads).toHaveLength(1)
    expect(downloads[0]?.name).toBe(BACKUP_FILE_NAME)
    expect(parseIntelHex(downloads[0]!.text).subarray(0, OLD_PROGRAM.length)).toEqual(OLD_PROGRAM)
    expect(duringInstall[0]).toMatchObject({ ok: false })
    expect(duringInstall[1]).toBe(true)
    const image = parseIntelHex(bundledHex)
    expect(fake.flash.subarray(0, image.length)).toEqual(image)
    expect(fake.fireLines()).toBe(0)
    expect(fake.opens).toEqual([9600, 115_200, 9600])
    await vi.waitFor(() => expect(useSmokeBoard().view.value).toBe('ready'))
    expect(smoke().armed).toBe(false)
    expect(getRoomHardwareConfig().lighting.smoke.board).toEqual({
      kind: 'uno-serial',
      ...BOARD_USB,
    })
  })

  it('n’écrit rien sans la case « machine éteinte »', async () => {
    const { fake } = await connected()

    await installSmokeBoardProgram({ machineOff: false, download: vi.fn() })

    expect(useSmokeBoard().install.value).toMatchObject({ phase: 'error', code: 'not_confirmed' })
    expect(fake.opens).toEqual([9600])
    expect(fake.stats.pagesWritten).toBe(0)
  })

  it('s’arrête sans écrire quand la signature n’est pas celle d’un Uno', async () => {
    const { fake } = await connected({ signature: [0x1e, 0x95, 0x14] })
    const download = vi.fn()

    await installSmokeBoardProgram({ machineOff: true, download })

    expect(useSmokeBoard().install.value).toMatchObject({ phase: 'error', code: 'wrong_signature' })
    expect(fake.stats.pagesWritten).toBe(0)
    expect(download).not.toHaveBeenCalled()
    expect(fake.flash.subarray(0, OLD_PROGRAM.length)).toEqual(OLD_PROGRAM)
  })

  it('sans carte choisie, il n’y a rien à installer', async () => {
    installSerial(createFakeBoardPort().port)

    await installSmokeBoardProgram({ machineOff: true, download: vi.fn() })

    expect(useSmokeBoard().install.value).toMatchObject({ phase: 'error', code: 'no_port' })
  })

  it('une installation interrompue se recommence, et la sauvegarde sert à restaurer', async () => {
    const { fake } = await connected({ corruptFirstWrite: true })
    const download = vi.fn()

    await installSmokeBoardProgram({ machineOff: true, download })
    expect(useSmokeBoard().install.value).toMatchObject({ phase: 'error', code: 'verify_failed' })
    expect(smoke().armed).toBe(false)
    expect(fake.fireLines()).toBe(0)

    await installSmokeBoardProgram({ machineOff: true, download })
    expect(useSmokeBoard().install.value).toEqual({ phase: 'done', kind: 'install' })
    expect(download).toHaveBeenCalledTimes(2)

    // Retour arrière : la dernière sauvegarde téléchargée est celle du programme déjà remplacé ;
    // la première (avant tout essai) contient l'ancien programme.
    const firstBackup = download.mock.calls[0]?.[1] as string
    await restoreSmokeBoardProgram({ machineOff: true, hex: firstBackup })

    expect(useSmokeBoard().install.value).toEqual({ phase: 'done', kind: 'restore' })
    expect(fake.flash.subarray(0, OLD_PROGRAM.length)).toEqual(OLD_PROGRAM)
    expect(fake.fireLines()).toBe(0)
  })

  it('refuse un fichier .hex illisible sans toucher à la carte', async () => {
    const { fake } = await connected()

    await restoreSmokeBoardProgram({ machineOff: true, hex: 'pas un hex' })

    expect(useSmokeBoard().install.value).toMatchObject({ phase: 'error', code: 'invalid_hex' })
    expect(fake.opens).toEqual([9600])
  })

  it('refuse une restauration sans la case « machine éteinte »', async () => {
    const { fake } = await connected()

    await restoreSmokeBoardProgram({ machineOff: false, hex: writeIntelHex(Uint8Array.of(1, 2)) })

    expect(useSmokeBoard().install.value).toMatchObject({ phase: 'error', code: 'not_confirmed' })
    expect(fake.opens).toEqual([9600])
  })
})
