import { IntelHexError, writeIntelHex } from '@hardware/firmware/intelHex'
import {
  connectBootloader,
  FirmwareError,
  type FirmwareProgress,
  installFirmware,
  restoreFirmware,
  UNO_FLASH_SIZE,
} from '@hardware/firmware/stk500'

import { createFakeOptiboot, type OptibootOptions, runWithClock } from '../_helpers/fakeOptiboot'
import { createManualClock, flushPromises, type ManualClock } from '../_helpers/manualClock'

const domError = (name: string) => Object.assign(new Error(name), { name })

/** Octets reconnaissables, jamais 0xFF : une page mal copiée ne passe pas inaperçue. */
const pattern = (length: number, seed: number) =>
  Uint8Array.from({ length }, (_value, index) => ((index * 31 + seed) % 250) + 1)

const hexOfImage = (image: Uint8Array) => writeIntelHex(image)

/** Page 0 inerte : `rjmp .-2` (`FF CF`) puis de la flash effacée. */
const INERT_PAGE = new Uint8Array(128).fill(0xff)
INERT_PAGE[1] = 0xcf

/** Adresses des pages écrites (`PROG_PAGE`), dans l'ordre, d'après ce que la carte a reçu. */
function programmedAddresses(board: ReturnType<typeof createFakeOptiboot>) {
  const addresses: number[] = []
  let address = 0
  for (const { bytes } of board.stats.writes) {
    if (bytes[0] === 0x55) {
      address = ((bytes[1] ?? 0) | ((bytes[2] ?? 0) << 8)) * 2
    } else if (bytes[0] === 0x64) {
      addresses.push(address)
    }
  }
  return addresses
}

/** Laisse passer plus d'une seconde : Optiboot sort seul du chargeur et lance ce que la flash contient. */
const waitLoaderExit = (clock: ManualClock) =>
  runWithClock(clock, new Promise<void>((resolve) => clock.setTimeout(resolve, 1_500)))

/** Après l'erreur : la carte lance son programme, et la page 0 est la page inerte. */
async function expectBoardLoops(
  clock: ManualClock,
  board: ReturnType<typeof createFakeOptiboot>,
  { running }: { running: boolean } = { running: true }
) {
  await waitLoaderExit(clock)
  expect(board.flash.subarray(0, 128)).toEqual(INERT_PAGE)
  if (running) {
    expect(board.stats.programRunning).toBe(true)
  }
}

function setup(options: Partial<OptibootOptions> = {}) {
  const clock = createManualClock()
  const original = pattern(UNO_FLASH_SIZE, 7)
  const optiboot: OptibootOptions = { clock, flash: original, ...options }
  const board = createFakeOptiboot(optiboot)
  return { clock, board, optiboot, original: original.slice() }
}

describe('installFirmware', () => {
  it('sauvegarde la flash, écrit l’image, la relit, puis lance le programme', async () => {
    const { clock, board, original } = setup()
    const image = pattern(300, 99)
    const events: FirmwareProgress[] = []
    let backup: Uint8Array | null = null
    let writtenWhenBackedUp = -1

    await runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(image),
        onBackup: (saved) => {
          backup = saved
          writtenWhenBackedUp = board.stats.pagesWritten
        },
        onProgress: (progress) => events.push(progress),
      })
    )

    expect(board.flash.subarray(0, 300)).toEqual(image)
    // Au-delà de l'image, l'ancien contenu reste en place.
    expect(board.flash.subarray(384)).toEqual(original.subarray(384))
    expect(backup).toEqual(original)
    expect(writtenWhenBackedUp).toBe(0)
    expect(board.stats.opens).toEqual([115_200])
    expect(board.stats.programRunning).toBe(true)
    expect(board.stats.badFrames).toBe(0)
    expect(board.port.readable).toBeNull()

    const steps = events.map((event) => event.step)
    expect(steps.indexOf('backup')).toBeLessThan(steps.indexOf('write'))
    expect(steps.indexOf('write')).toBeLessThan(steps.indexOf('verify'))
    expect(events.at(-1)).toEqual({ step: 'exit', done: 1, total: 1 })
    expect(events.filter((event) => event.step === 'write').at(-1)).toEqual({
      step: 'write',
      done: 300,
      total: 300,
    })
    // Deux lectures de la flash : la progression va jusqu'au double de la taille.
    expect(events.filter((event) => event.step === 'backup').at(-1)).toEqual({
      step: 'backup',
      done: 2 * UNO_FLASH_SIZE,
      total: 2 * UNO_FLASH_SIZE,
    })
    expect(board.stats.pagesRead).toBeGreaterThanOrEqual(2 * (UNO_FLASH_SIZE / 128))
    // Page 0 inerte d'abord, pages 1 à n, la vraie page 0 en dernier.
    expect(programmedAddresses(board)).toEqual([0, 128, 256, 0])
  })

  it('accepte une image de 32 256 octets pile', async () => {
    const { clock, board } = setup()
    const image = pattern(UNO_FLASH_SIZE, 3)
    await runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(image),
        onBackup: () => undefined,
      })
    )
    expect(board.flash).toEqual(image)
  })

  it('retombe à 57600 bauds pour un ancien chargeur', async () => {
    const { clock, board, original } = setup({ baudRate: 57_600 })
    const image = pattern(200, 1)
    let backup: Uint8Array | null = null
    await runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(image),
        onBackup: (saved) => {
          backup = saved
        },
      })
    )
    expect(board.stats.opens).toEqual([115_200, 57_600])
    expect(board.stats.resets).toBe(2)
    expect(board.flash.subarray(0, 200)).toEqual(image)
    // Un ancien chargeur occupe 2 Kio : la sauvegarde s'arrête à 30 720 octets.
    expect(backup).toEqual(original.subarray(0, 30_720))
  })

  it('limite l’image à 30 720 octets quand le chargeur a répondu à 57600 bauds', async () => {
    const { clock, board } = setup({ baudRate: 57_600 })
    const onBackup = vi.fn()
    const tooBig = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(30_721, 1)),
        onBackup,
      })
    )
    await expect(tooBig).rejects.toMatchObject({ code: 'too_large' })
    // Refusé après la synchronisation, avant toute lecture ou écriture.
    expect(board.stats.opens).toEqual([115_200, 57_600])
    expect(board.stats.pageCommands).toBe(0)
    expect(onBackup).not.toHaveBeenCalled()
    expect(board.port.readable).toBeNull()

    const exact = setup({ baudRate: 57_600 })
    const image = pattern(30_720, 2)
    await runWithClock(
      exact.clock,
      installFirmware({
        port: exact.board.port,
        clock: exact.clock,
        hex: hexOfImage(image),
        onBackup: () => undefined,
      })
    )
    expect(exact.board.flash.subarray(0, 30_720)).toEqual(image)

    const restore = setup({ baudRate: 57_600 })
    await expect(
      runWithClock(
        restore.clock,
        restoreFirmware({
          port: restore.board.port,
          clock: restore.clock,
          hex: hexOfImage(pattern(30_721, 1)),
        })
      )
    ).rejects.toMatchObject({ code: 'too_large' })
    expect(restore.board.stats.pageCommands).toBe(0)
  })

  it('rend no_sync si le chargeur ne répond à aucun des deux débits, sans rien écrire', async () => {
    const { clock, board, original } = setup({ silent: true })
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(200, 1)),
        onBackup: () => undefined,
      })
    )
    await expect(result).rejects.toBeInstanceOf(FirmwareError)
    await expect(result).rejects.toMatchObject({ code: 'no_sync' })
    expect(board.stats.opens).toEqual([115_200, 57_600])
    expect(board.stats.pageCommands).toBe(0)
    expect(board.flash).toEqual(original)
    expect(board.port.readable).toBeNull()
  })

  it('rend no_sync si la carte n’est pas remise à zéro (pas de signaux DTR, pas de RESET)', async () => {
    const { clock, board } = setup()
    board.port.setSignals = undefined
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(200, 1)),
        onBackup: () => undefined,
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'no_sync' })
    expect(board.stats.resets).toBe(0)
  })

  it('rend port_lost si les signaux du port échouent', async () => {
    const { clock, board } = setup()
    board.port.setSignals = async () => {
      throw domError('NetworkError')
    }
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(200, 1)),
        onBackup: () => undefined,
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'port_lost' })
  })

  it('refuse une autre signature que 1E 95 0F : aucune lecture de page, aucune écriture', async () => {
    const { clock, board, original } = setup({ signature: [0x1e, 0x95, 0x14] })
    const onBackup = vi.fn()
    const result = runWithClock(
      clock,
      installFirmware({ port: board.port, clock, hex: hexOfImage(pattern(200, 1)), onBackup })
    )
    await expect(result).rejects.toMatchObject({ code: 'wrong_signature' })
    expect(board.stats.pageCommands).toBe(0)
    expect(onBackup).not.toHaveBeenCalled()
    expect(board.flash).toEqual(original)
    expect(board.port.readable).toBeNull()
  })

  it('refuse une image de plus de 32 256 octets avant d’ouvrir le port', async () => {
    const { clock, board } = setup()
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(UNO_FLASH_SIZE + 1, 1)),
        onBackup: () => undefined,
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'too_large' })
    expect(board.stats.opens).toEqual([])
    expect(board.stats.bytesReceived).toBe(0)
  })

  it.each([
    ['somme de contrôle fausse', ':03000000010203F8\n:00000001FF\n', 'bad_checksum'],
    ['fichier sans donnée', ':00000001FF\n', 'no_data'],
  ])('refuse un .hex invalide (%s) sans toucher au port', async (_name, hex, reason) => {
    const { clock, board } = setup()
    const result = runWithClock(
      clock,
      installFirmware({ port: board.port, clock, hex, onBackup: () => undefined })
    )
    await expect(result).rejects.toBeInstanceOf(IntelHexError)
    await expect(result).rejects.toMatchObject({ reason })
    expect(board.stats.opens).toEqual([])
  })

  // Écritures interrompues au milieu : image de 600 octets (pages 0 à 4), pages 1 et 2 écrites.
  // Dans tous les cas la page 0 est la page inerte, jamais le début du nouveau programme avec la
  // suite de l'ancien : Optiboot lance ce que la flash contient après 1 s de silence.
  const BACKUP_COMMANDS = 2 * (UNO_FLASH_SIZE / 128)

  it('rend verify_failed avec l’adresse de l’octet faux : la page 0 reste inerte', async () => {
    const { clock, board } = setup({ corruptPage: 2 })
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(600, 5)),
        onBackup: () => undefined,
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'verify_failed', address: 256 })
    // Les pages 1 à 4 sont déjà écrites et relues, pas la vraie page 0.
    expect(board.flash.subarray(128, 256)).toEqual(pattern(600, 5).subarray(128, 256))
    await expectBoardLoops(clock, board)
  })

  it('rend port_lost si la carte est débranchée pendant l’écriture : la page 0 reste inerte', async () => {
    // Sauvegarde, page 0 inerte écrite puis relue, page 1, puis la page 2 est perdue.
    const { clock, board } = setup({ disconnectAtPage: BACKUP_COMMANDS + 3 })
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(600, 5)),
        onBackup: () => undefined,
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'port_lost' })
    expect(board.stats.pagesWritten).toBe(2)
    await expectBoardLoops(clock, board, { running: false })
  })

  it('rend timeout si la carte se tait pendant l’écriture : la page 0 reste inerte', async () => {
    const { clock, board, optiboot } = setup()
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(600, 5)),
        onBackup: () => undefined,
        onProgress: ({ step, done }) => {
          if (step === 'write' && done === 256) {
            optiboot.silent = true
          }
        },
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'timeout' })
    expect(board.stats.pagesWritten).toBe(3)
    await expectBoardLoops(clock, board)
  })

  it('rend port_lost si la carte est débranchée pendant la sauvegarde : rien n’est écrit', async () => {
    const { clock, board, original } = setup({ disconnectAtPage: 3 })
    const onBackup = vi.fn()
    const result = runWithClock(
      clock,
      installFirmware({ port: board.port, clock, hex: hexOfImage(pattern(300, 5)), onBackup })
    )
    await expect(result).rejects.toMatchObject({ code: 'port_lost' })
    expect(onBackup).not.toHaveBeenCalled()
    expect(board.stats.pagesWritten).toBe(0)
    expect(board.flash).toEqual(original)
  })

  it.each([
    ['échoue', () => Promise.reject(new Error('disque plein'))],
    [
      'lève',
      () => {
        throw new Error('disque plein')
      },
    ],
  ])('s’arrête sans rien écrire quand la sauvegarde %s', async (_name, onBackup) => {
    const { clock, board, original } = setup()
    const result = runWithClock(
      clock,
      installFirmware({ port: board.port, clock, hex: hexOfImage(pattern(300, 5)), onBackup })
    )
    await expect(result).rejects.toMatchObject({ code: 'backup_failed' })
    await expect(result).rejects.toHaveProperty('cause.message', 'disque plein')
    expect(board.stats.pagesWritten).toBe(0)
    expect(board.flash).toEqual(original)
    expect(board.port.readable).toBeNull()
  })

  it.each([
    ['l’écriture', 'write', 256, 3],
    ['la relecture', 'verify', 128, 5],
  ] as const)(
    'annulé pendant %s : s’arrête entre deux pages, la page 0 reste inerte',
    async (_name, cancelStep, cancelAt, pagesWritten) => {
      const { clock, board } = setup()
      const controller = new AbortController()
      const result = runWithClock(
        clock,
        installFirmware({
          port: board.port,
          clock,
          hex: hexOfImage(pattern(600, 5)),
          onBackup: () => undefined,
          signal: controller.signal,
          onProgress: ({ step, done }) => {
            if (step === cancelStep && done === cancelAt) {
              controller.abort()
            }
          },
        })
      )
      await expect(result).rejects.toMatchObject({ code: 'cancelled' })
      // Jamais une page à moitié : page 0 inerte et pages 1 et 2 (écriture), ou 1 à 4 (relecture).
      expect(board.stats.pagesWritten).toBe(pagesWritten)
      expect(board.port.readable).toBeNull()
      await expectBoardLoops(clock, board)
    }
  )

  it('annulé avant de commencer : rien n’est écrit', async () => {
    const { clock, board } = setup()
    const controller = new AbortController()
    controller.abort()
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(300, 5)),
        onBackup: () => undefined,
        signal: controller.signal,
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'cancelled' })
    expect(board.stats.pageCommands).toBe(0)
  })

  it('rend port_busy quand le port est pris ailleurs ou déjà ouvert', async () => {
    for (const name of ['NetworkError', 'InvalidStateError']) {
      const { clock, board } = setup()
      board.port.open = async () => {
        throw domError(name)
      }
      const result = runWithClock(
        clock,
        installFirmware({
          port: board.port,
          clock,
          hex: hexOfImage(pattern(200, 1)),
          onBackup: () => undefined,
        })
      )
      await expect(result).rejects.toMatchObject({ code: 'port_busy' })
    }
  })

  it('rend port_lost quand l’ouverture échoue autrement ou donne un port sans flux', async () => {
    const failing = setup()
    failing.board.port.open = async () => {
      throw domError('SecurityError')
    }
    await expect(
      runWithClock(
        failing.clock,
        installFirmware({
          port: failing.board.port,
          clock: failing.clock,
          hex: hexOfImage(pattern(200, 1)),
          onBackup: () => undefined,
        })
      )
    ).rejects.toMatchObject({ code: 'port_lost' })

    const mute = setup()
    mute.board.port.open = async () => undefined
    mute.board.port.close = async () => undefined
    Object.defineProperty(mute.board.port, 'readable', { value: null })
    await expect(
      runWithClock(
        mute.clock,
        installFirmware({
          port: mute.board.port,
          clock: mute.clock,
          hex: hexOfImage(pattern(200, 1)),
          onBackup: () => undefined,
        })
      )
    ).rejects.toMatchObject({ code: 'port_lost' })
  })
})

describe('restoreFirmware', () => {
  it('réécrit la sauvegarde téléchargée : la flash retrouve l’ancien contenu', async () => {
    const { clock, board, original } = setup()
    let backup: Uint8Array = new Uint8Array(0)
    await runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(2000, 77)),
        onBackup: (saved) => {
          backup = saved
        },
      })
    )
    expect(board.flash).not.toEqual(original)

    const events: FirmwareProgress[] = []
    await runWithClock(
      clock,
      restoreFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(backup),
        onProgress: (progress) => events.push(progress),
      })
    )
    expect(board.flash).toEqual(original)
    expect(board.stats.programRunning).toBe(true)
    expect(events.some((event) => event.step === 'verify')).toBe(true)
  })

  it('refuse un .hex trop grand ou vide sans toucher au port', async () => {
    const { clock, board } = setup()
    await expect(
      runWithClock(
        clock,
        restoreFirmware({
          port: board.port,
          clock,
          hex: hexOfImage(pattern(UNO_FLASH_SIZE + 1, 1)),
        })
      )
    ).rejects.toMatchObject({ code: 'too_large' })
    await expect(
      runWithClock(clock, restoreFirmware({ port: board.port, clock, hex: ':00000001FF\n' }))
    ).rejects.toMatchObject({ reason: 'no_data' })
    expect(board.stats.opens).toEqual([])
  })
})

describe('connectBootloader', () => {
  it('relit la flash par pages et renvoie exactement la taille demandée', async () => {
    const { clock, board, original } = setup()
    const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
    expect(client.baudRate).toBe(115_200)
    const read = await runWithClock(clock, client.readFlash(300))
    expect(read).toEqual(original.subarray(0, 300))
    expect(board.stats.pagesRead).toBe(3)
    await runWithClock(clock, client.close())
  })

  it('refuse d’écrire ou de lire plus de 32 256 octets, sans envoyer de page', async () => {
    const { clock, board } = setup()
    const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
    await expect(
      runWithClock(clock, client.writeFlash(new Uint8Array(UNO_FLASH_SIZE + 1)))
    ).rejects.toMatchObject({ code: 'too_large' })
    await expect(runWithClock(clock, client.readFlash(UNO_FLASH_SIZE + 1))).rejects.toMatchObject({
      code: 'too_large',
    })
    expect(board.stats.pageCommands).toBe(0)
    await runWithClock(clock, client.close())
  })

  it('n’écrit rien pour une image vide (pas même la page 0)', async () => {
    const { clock, board, original } = setup()
    const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
    await runWithClock(clock, client.writeFlash(new Uint8Array(0)))
    expect(board.stats.pageCommands).toBe(0)
    expect(board.flash).toEqual(original)
    await runWithClock(clock, client.close())
  })

  it('rend timeout quand la carte se tait en pleine session', async () => {
    const { clock, board, optiboot } = setup()
    const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
    optiboot.silent = true
    await expect(runWithClock(clock, client.readFlash(128))).rejects.toMatchObject({
      code: 'timeout',
    })
    await runWithClock(clock, client.close())
  })
})

describe('installFirmware : sauvegarde', () => {
  it('lit la flash deux fois : une lecture qui diffère donne backup_failed, rien n’est écrit', async () => {
    const { clock, board, original } = setup({ flakyReadPage: 5 })
    const onBackup = vi.fn()
    const result = runWithClock(
      clock,
      installFirmware({ port: board.port, clock, hex: hexOfImage(pattern(300, 5)), onBackup })
    )
    await expect(result).rejects.toMatchObject({ code: 'backup_failed' })
    expect(onBackup).not.toHaveBeenCalled()
    expect(board.stats.pagesWritten).toBe(0)
    expect(board.flash).toEqual(original)
    expect(board.port.readable).toBeNull()
  })

  it.each([2_000, 30_000])(
    'garde le chargeur actif pendant un onBackup de %d ms, puis écrit sans mélanger les envois',
    async (waitMs) => {
      const { clock, board, original } = setup()
      const image = pattern(300, 5)
      let backup: Uint8Array | null = null
      await runWithClock(
        clock,
        installFirmware({
          port: board.port,
          clock,
          hex: hexOfImage(image),
          onBackup: (saved) => {
            backup = saved
            return new Promise<void>((resolve) => clock.setTimeout(resolve, waitMs))
          },
        }),
        // Pas de 250 ms : l'attente de 30 s serait sinon trop longue en temps réel.
        250
      )
      expect(backup).toEqual(original)
      expect(board.flash.subarray(0, 300)).toEqual(image)
      expect(board.stats.badFrames).toBe(0)
      expect(board.stats.resets).toBe(1)
      // Un GET_SYNC environ toutes les 250 ms pendant l'attente, aucun pendant l'écriture.
      const writes = board.stats.writes
      const firstPage = writes.findIndex(({ bytes }) => bytes[0] === 0x64)
      const syncsDuringWrite = writes
        .slice(firstPage)
        .filter(({ bytes }) => bytes.length === 2 && bytes[0] === 0x30)
      expect(syncsDuringWrite).toEqual([])
      const waitStart = writes.slice(0, firstPage).findLastIndex(({ bytes }) => bytes[0] === 0x74)
      const keepAlives = writes
        .slice(waitStart, firstPage)
        .filter(({ bytes }) => bytes.length === 2 && bytes[0] === 0x30)
      expect(keepAlives.length).toBeGreaterThanOrEqual(Math.floor(waitMs / 250) - 1)
      expect(keepAlives.length).toBeLessThanOrEqual(Math.ceil(waitMs / 250) + 1)
    }
  )

  it('rend port_lost, pas backup_failed, si la carte se perd pendant l’attente de onBackup', async () => {
    const { clock, board } = setup()
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(300, 5)),
        onBackup: () =>
          new Promise<void>((resolve) => {
            clock.setTimeout(() => board.disconnect(), 600)
            clock.setTimeout(resolve, 5_000)
          }),
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'port_lost' })
    expect(board.stats.pagesWritten).toBe(0)
  })

  it('annulé pendant l’attente de onBackup : rien n’est écrit', async () => {
    const { clock, board } = setup()
    const controller = new AbortController()
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(300, 5)),
        signal: controller.signal,
        onBackup: () =>
          new Promise<void>((resolve) => {
            clock.setTimeout(() => controller.abort(), 600)
            clock.setTimeout(resolve, 5_000)
          }),
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'cancelled' })
    expect(board.stats.pagesWritten).toBe(0)
  })
})

describe('synchronisation', () => {
  const syncWrites = (board: ReturnType<typeof createFakeOptiboot>) =>
    board.stats.writes.filter(({ bytes }) => bytes.length === 2 && bytes[0] === 0x30)

  it('espace les GET_SYNC d’au moins 250 ms', async () => {
    const { clock, board } = setup({ silent: true })
    await expect(
      runWithClock(clock, connectBootloader({ port: board.port, clock }))
    ).rejects.toMatchObject({ code: 'no_sync' })
    const times = syncWrites(board).map(({ at }) => at)
    expect(times.length).toBeGreaterThanOrEqual(3)
    times.slice(1).forEach((at, index) => {
      expect(at - times[index]!).toBeGreaterThanOrEqual(250)
    })
  })

  it('confirme par un second GET_SYNC, 50 ms après la première réponse, avant la signature', async () => {
    const { clock, board } = setup()
    const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
    const writes = board.stats.writes
    const signRequest = writes.findIndex(({ bytes }) => bytes[0] === 0x75)
    const confirm = writes[signRequest - 1]!
    expect(confirm.bytes).toEqual([0x30, 0x20])
    expect(confirm.at - board.stats.repliesAt[0]!).toBeGreaterThanOrEqual(50)
    // Pendant le démarrage, la mémoire de réception de 2 octets a débordé.
    expect(board.stats.overflowedBytes).toBeGreaterThan(0)
    await runWithClock(clock, client.close())
  })

  it('jette les réponses en retard de plusieurs envois : la signature reste lue au bon endroit', async () => {
    // Mémoire de réception de 4 octets : deux GET_SYNC répondent d'un coup à la fin du démarrage.
    const { clock, board, original } = setup({ fifoBytes: 4 })
    const image = pattern(300, 5)
    await runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(image),
        onBackup: () => undefined,
      })
    )
    const first = board.stats.repliesAt[0]
    expect(board.stats.repliesAt.filter((at) => at === first).length).toBeGreaterThanOrEqual(2)
    expect(board.flash.subarray(0, 300)).toEqual(image)
    expect(board.flash.subarray(384)).toEqual(original.subarray(384))
  })

  it.each([0, 1])(
    'ne compte pas la réponse n° %d si elle est fausse (STK_NOSYNC) : il réessaie',
    async (wrongIndex) => {
      let count = 0
      const { clock, board } = setup({
        mangleReply: (command, bytes) => {
          if (command !== 0x30) {
            return undefined
          }
          count += 1
          return count - 1 === wrongIndex ? [0x15, 0x10] : bytes
        },
      })
      const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
      expect(count).toBeGreaterThan(wrongIndex + 1)
      expect(board.stats.opens).toEqual([115_200])
      await runWithClock(clock, client.close())
    }
  )

  it('rend port_lost si le port se perd pendant la synchronisation', async () => {
    const { clock, board } = setup({ bootMs: 5_000 })
    clock.setTimeout(() => board.disconnect(), 300)
    await expect(
      runWithClock(clock, connectBootloader({ port: board.port, clock }))
    ).rejects.toMatchObject({ code: 'port_lost' })
  })

  it('rend port_lost si l’écriture sur le port échoue', async () => {
    const { clock, board } = setup()
    Object.defineProperty(board.port, 'writable', {
      value: new WritableStream<Uint8Array>({
        write: () => Promise.reject(domError('NetworkError')),
      }),
    })
    await expect(
      runWithClock(clock, connectBootloader({ port: board.port, clock }))
    ).rejects.toMatchObject({ code: 'port_lost' })
  })

  it('rend timeout si l’écriture sur le port reste bloquée', async () => {
    const { clock, board } = setup()
    Object.defineProperty(board.port, 'writable', {
      value: new WritableStream<Uint8Array>({ write: () => new Promise(() => undefined) }),
    })
    await expect(
      runWithClock(clock, connectBootloader({ port: board.port, clock }))
    ).rejects.toMatchObject({ code: 'timeout' })
  })
})

describe('réponses du chargeur', () => {
  it.each([
    ['sans STK_INSYNC (STK_NOSYNC)', [0x15, 0x1e, 0x95, 0x0f, 0x10]],
    ['sans STK_OK à la fin', [0x14, 0x1e, 0x95, 0x0f, 0x11]],
  ])('rend no_sync pour une réponse %s : rien n’est lu ni écrit', async (_name, wrong) => {
    const { clock, board, original } = setup({
      mangleReply: (command) => (command === 0x75 ? wrong : undefined),
    })
    const onBackup = vi.fn()
    const result = runWithClock(
      clock,
      installFirmware({ port: board.port, clock, hex: hexOfImage(pattern(300, 5)), onBackup })
    )
    await expect(result).rejects.toMatchObject({ code: 'no_sync' })
    expect(board.stats.pageCommands).toBe(0)
    expect(onBackup).not.toHaveBeenCalled()
    expect(board.flash).toEqual(original)
    expect(board.port.readable).toBeNull()
  })
})

describe('erreurs de lecture du port', () => {
  it.each(['FramingError', 'BreakError', 'BufferOverrunError', 'ParityError'])(
    'reprend la lecture après une %s : le port n’est pas perdu',
    async (name) => {
      const { clock, board, original } = setup()
      const image = pattern(300, 5)
      let injected = false
      let backup: Uint8Array | null = null
      await runWithClock(
        clock,
        installFirmware({
          port: board.port,
          clock,
          hex: hexOfImage(image),
          onBackup: (saved) => {
            backup = saved
          },
          onProgress: ({ step, done }) => {
            if (step === 'backup' && done === 256 && !injected) {
              injected = true
              board.injectReadError(name)
            }
          },
        })
      )
      expect(injected).toBe(true)
      expect(backup).toEqual(original)
      expect(board.flash.subarray(0, 300)).toEqual(image)
    }
  )

  it('rend port_lost pour une erreur passagère si le port n’a plus de flux de lecture', async () => {
    const { clock, board } = setup()
    const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
    board.injectReadError('FramingError', false)
    await flushPromises()
    await expect(runWithClock(clock, client.readFlash(128))).rejects.toMatchObject({
      code: 'port_lost',
    })
    await runWithClock(clock, client.close())
  })

  it('rend port_lost sur NetworkError, même si le port a encore un flux', async () => {
    const { clock, board } = setup()
    const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
    board.injectReadError('NetworkError')
    await flushPromises()
    await expect(runWithClock(clock, client.readFlash(128))).rejects.toMatchObject({
      code: 'port_lost',
    })
    await runWithClock(clock, client.close())
  })

  it('renonce après des erreurs passagères répétées sans un octet reçu', async () => {
    const { clock, board } = setup()
    const client = await runWithClock(clock, connectBootloader({ port: board.port, clock }))
    for (let count = 0; count < 6; count += 1) {
      board.injectReadError('FramingError')
      await flushPromises()
    }
    await expect(runWithClock(clock, client.readFlash(128))).rejects.toMatchObject({
      code: 'port_lost',
    })
    await runWithClock(clock, client.close())
  })
})
