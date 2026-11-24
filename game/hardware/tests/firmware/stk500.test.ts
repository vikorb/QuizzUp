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
import { createManualClock } from '../_helpers/manualClock'

const domError = (name: string) => Object.assign(new Error(name), { name })

/** Octets reconnaissables, jamais 0xFF : une page mal copiée ne passe pas inaperçue. */
const pattern = (length: number, seed: number) =>
  Uint8Array.from({ length }, (_value, index) => ((index * 31 + seed) % 250) + 1)

const hexOfImage = (image: Uint8Array) => writeIntelHex(image)

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
    expect(events.filter((event) => event.step === 'backup').at(-1)).toEqual({
      step: 'backup',
      done: UNO_FLASH_SIZE,
      total: UNO_FLASH_SIZE,
    })
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
    expect(backup).toEqual(original)
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

  it('rend verify_failed avec l’adresse de l’octet faux quand la relecture diffère', async () => {
    const { clock, board } = setup({ corruptPage: 1 })
    const result = runWithClock(
      clock,
      installFirmware({
        port: board.port,
        clock,
        hex: hexOfImage(pattern(300, 5)),
        onBackup: () => undefined,
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'verify_failed', address: 128 })
    // Le chargeur n'a pas été quitté : l'installation peut être refaite.
    expect(board.stats.programRunning).toBe(false)
  })

  it('rend port_lost si la carte est débranchée pendant l’écriture', async () => {
    // 252 pages de sauvegarde, puis la troisième page écrite.
    const { clock, board } = setup({ disconnectAtPage: UNO_FLASH_SIZE / 128 + 2 })
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

  it('s’arrête proprement entre deux pages quand on annule', async () => {
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
          if (step === 'write' && done === 256) {
            controller.abort()
          }
        },
      })
    )
    await expect(result).rejects.toMatchObject({ code: 'cancelled' })
    // Deux pages écrites, jamais une page à moitié ; le port est fermé.
    expect(board.stats.pagesWritten).toBe(2)
    expect(board.port.readable).toBeNull()
  })

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
