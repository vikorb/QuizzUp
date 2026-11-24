import { browserClock, type Clock } from '../clock'
import { describeSerialError, discardWriter, type SerialPortLike } from '../dmx/serialOutput'
import { IntelHexError, parseIntelHex } from './intelHex'

/**
 * Client du chargeur Optiboot d'une carte Arduino Uno (ATmega328P) par Web Serial. Protocole
 * STK500v1, sous-ensemble utilisé par Optiboot. Aucune bibliothèque de téléversement.
 *
 * Sources, relues le 24 novembre 2026 :
 * - `optiboot.c` et `stk500.h` : https://github.com/Optiboot/optiboot (dossier
 *   `optiboot/bootloaders/optiboot`). Boucle de commandes autour des lignes 927 à 1178, réponse
 *   « STK_INSYNC, données, STK_OK » ; `verifySpace()` (ligne 1373) exige `CRC_EOP` après chaque
 *   commande, sinon le chargeur se remet à zéro par le chien de garde et lance le programme ;
 *   `getch()` relance le chien de garde à chaque octet reçu (fenêtre d'une seconde de silence).
 * - `boards.txt` du cœur https://github.com/arduino/ArduinoCore-avr, entrée `uno` :
 *   `upload.protocol=arduino` (STK500v1), `upload.speed=115200`, `upload.maximum_size=32256`,
 *   `build.mcu=atmega328p`. Le chargeur occupe les 512 derniers octets des 32 Kio de flash.
 *
 * Limite : seuls les Uno et clones avec Optiboot sont visés. Rien n'est prouvé sur une vraie carte.
 */

// `stk500.h`
const STK_OK = 0x10
const STK_INSYNC = 0x14
const CRC_EOP = 0x20
const STK_GET_SYNC = 0x30
const STK_LEAVE_PROGMODE = 0x51
const STK_LOAD_ADDRESS = 0x55
const STK_PROG_PAGE = 0x64
const STK_READ_PAGE = 0x74
const STK_READ_SIGN = 0x75
/** Type de mémoire « flash » dans `STK_PROG_PAGE` / `STK_READ_PAGE` (`'F'`, `optiboot.c`). */
const MEMTYPE_FLASH = 0x46

/** Signature de l'ATmega328P (`SIGNATURE_0..2` d'avr-libc, renvoyée par `STK_READ_SIGN`). */
const UNO_SIGNATURE = [0x1e, 0x95, 0x0f] as const
/** `boards.txt`, `uno.upload.maximum_size` : flash moins la zone du chargeur. */
export const UNO_FLASH_SIZE = 32_256
/** Page de flash de l'ATmega328P (`SPM_PAGESIZE` = 128 octets). */
export const FLASH_PAGE_SIZE = 128
/** 115200 : `boards.txt`, `uno.upload.speed` ; 57600 : anciens Optiboot / cartes de la même famille. */
const BAUD_RATES = [115_200, 57_600] as const

/** Impulsion de remise à zéro par DTR, comme avrdude (50 ms bas, 50 ms haut). */
const RESET_PULSE_MS = 50
/** Le chargeur n'écoute qu'une seconde après la remise à zéro (`WDTPERIOD`, `optiboot.c`). */
const SYNC_WINDOW_MS = 1000
const SYNC_ATTEMPT_MS = 100
/** Délai de chaque échange commande / réponse (une page de 128 octets dure environ 30 ms). */
const EXCHANGE_TIMEOUT_MS = 500
const CLOSE_TIMEOUT_MS = 1000

export type FirmwareErrorCode =
  /** Le chargeur ne répond pas, à aucun des deux débits. */
  | 'no_sync'
  | 'wrong_signature'
  | 'too_large'
  /** Relecture différente de l'image écrite ; `address` donne le premier octet faux. */
  | 'verify_failed'
  | 'port_lost'
  /** Port ouvert ailleurs ou déjà ouvert : à fermer avant de recommencer. */
  | 'port_busy'
  | 'timeout'
  | 'cancelled'
  /** `onBackup` a échoué : rien n'a été écrit. */
  | 'backup_failed'

export class FirmwareError extends Error {
  readonly code: FirmwareErrorCode
  readonly address?: number

  constructor(
    code: FirmwareErrorCode,
    message: string,
    options: { address?: number; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'FirmwareError'
    this.code = code
    this.address = options.address
  }
}

export type FirmwareStep = 'sync' | 'backup' | 'write' | 'verify' | 'exit'
export type FirmwareProgress = { step: FirmwareStep; done: number; total: number }

type LinkOptions = {
  port: SerialPortLike
  clock?: Clock
  /** Annulation : prise en compte entre deux pages. */
  signal?: AbortSignal
  onProgress?: (progress: FirmwareProgress) => void
}

export type BootloaderClient = {
  /** Débit auquel le chargeur a répondu. */
  baudRate: number
  /** Relit les `size` premiers octets de la flash, par pages de 128 octets. */
  readFlash: (size: number) => Promise<Uint8Array>
  /** Écrit l'image par pages, la relit en entier et la compare. */
  writeFlash: (image: Uint8Array) => Promise<void>
  /** Sort du mode de programmation : la carte lance le programme. */
  leave: () => Promise<void>
  /** Libère les flux et ferme le port. Ne lève jamais. */
  close: () => Promise<void>
}

const toHex = (bytes: ArrayLike<number>) =>
  [...Array.from(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')

const asFirmwareError = (error: unknown) =>
  error instanceof FirmwareError
    ? error
    : new FirmwareError('port_lost', 'Carte débranchée ou port série perdu', { cause: error })

function assertFits(size: number) {
  if (size > UNO_FLASH_SIZE) {
    throw new FirmwareError(
      'too_large',
      `Programme de ${size} octets : la carte n'en accepte que ${UNO_FLASH_SIZE}`
    )
  }
}

const sleep = (clock: Clock, ms: number) =>
  new Promise<void>((resolve) => clock.setTimeout(resolve, ms))

function withTimeout<T>(clock: Clock, promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = clock.setTimeout(
      () => reject(new FirmwareError('timeout', 'La carte ne répond plus')),
      ms
    )
    promise.then(
      (value) => {
        clock.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clock.clearTimeout(timer)
        reject(asFirmwareError(error))
      }
    )
  })
}

/** Attend qu'une promesse se termine, sans jamais rejeter et sans dépasser `ms`. */
function settleWithin(clock: Clock, promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = clock.setTimeout(resolve, ms)
    const done = () => {
      clock.clearTimeout(timer)
      resolve()
    }
    promise.then(done, done)
  })
}

type Link = {
  send: (bytes: Uint8Array) => Promise<void>
  /** Attend `count` octets, au plus `ms` millisecondes. */
  take: (count: number, ms: number) => Promise<Uint8Array>
  /** Jette les octets déjà reçus. */
  flush: () => void
  close: () => Promise<void>
}

/** Ouvre le port au débit demandé et prend les deux flux. */
async function openLink(port: SerialPortLike, baudRate: number, clock: Clock): Promise<Link> {
  const closePort = () => settleWithin(clock, port.close(), CLOSE_TIMEOUT_MS)
  try {
    await port.open({ baudRate })
  } catch (error) {
    const { code } = describeSerialError(error)
    throw new FirmwareError(
      code === 'busy' || code === 'already_open' ? 'port_busy' : 'port_lost',
      'Port série occupé ou inaccessible : fermez les autres onglets et programmes qui l’utilisent',
      { cause: error }
    )
  }
  const { readable, writable } = port
  if (!readable || !writable) {
    await closePort()
    throw new FirmwareError('port_lost', 'Port série ouvert sans flux de lecture ou d’écriture')
  }
  const reader = readable.getReader()
  const writer = writable.getWriter()

  let buffer: number[] = []
  let ended = false
  let wake = null as (() => void) | null
  // Une seule lecture en cours, tout au long de la session : le délai d'une attente ne la perd pas.
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        buffer.push(...value)
        wake?.()
      }
    } catch {
      // Flux en erreur (carte débranchée) : traité comme une fin.
    }
    ended = true
    wake?.()
  })()

  return {
    async send(bytes) {
      await withTimeout(clock, writer.write(bytes), EXCHANGE_TIMEOUT_MS)
    },
    take(count, ms) {
      return new Promise<Uint8Array>((resolve, reject) => {
        const timer = clock.setTimeout(() => {
          wake = null
          reject(new FirmwareError('timeout', 'La carte ne répond plus'))
        }, ms)
        const check = () => {
          if (buffer.length >= count) {
            clock.clearTimeout(timer)
            wake = null
            resolve(Uint8Array.from(buffer.splice(0, count)))
          } else if (ended) {
            clock.clearTimeout(timer)
            wake = null
            reject(asFirmwareError(undefined))
          }
        }
        wake = check
        check()
      })
    },
    flush() {
      buffer = []
    },
    async close() {
      await settleWithin(clock, reader.cancel(), CLOSE_TIMEOUT_MS)
      try {
        reader.releaseLock()
      } catch {
        // Lecture encore en attente sur un flux figé : le port sera fermé quand même.
      }
      discardWriter(writer)
      await closePort()
    },
  }
}

function throwIfCancelled(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new FirmwareError('cancelled', 'Opération annulée')
  }
}

/** Impulsion DTR : sur un Uno, elle remet la carte à zéro, donc dans le chargeur. */
async function pulseReset(port: SerialPortLike, clock: Clock) {
  if (!port.setSignals) {
    // Navigateur sans signaux : l'opérateur doit appuyer sur RESET.
    return
  }
  try {
    await port.setSignals({ dataTerminalReady: false })
    await sleep(clock, RESET_PULSE_MS)
    await port.setSignals({ dataTerminalReady: true })
    await sleep(clock, RESET_PULSE_MS)
  } catch (error) {
    throw asFirmwareError(error)
  }
}

/** Envoie `STK_GET_SYNC` jusqu'à la réponse, pendant la fenêtre d'écoute du chargeur. */
async function synchronise(link: Link, clock: Clock, signal: AbortSignal | undefined) {
  const deadline = clock.now() + SYNC_WINDOW_MS
  while (clock.now() < deadline) {
    throwIfCancelled(signal)
    link.flush()
    await link.send(Uint8Array.of(STK_GET_SYNC, CRC_EOP))
    try {
      const reply = await link.take(2, SYNC_ATTEMPT_MS)
      if (reply[0] === STK_INSYNC && reply[1] === STK_OK) {
        return true
      }
      await sleep(clock, SYNC_ATTEMPT_MS)
    } catch (error) {
      if (!(error instanceof FirmwareError && error.code === 'timeout')) {
        throw error
      }
    }
  }
  return false
}

/** Une commande, sa réponse `STK_INSYNC`, `dataLength` octets, `STK_OK` ; renvoie les données. */
async function exchange(link: Link, request: number[], dataLength: number) {
  await link.send(Uint8Array.from(request))
  const reply = await link.take(dataLength + 2, EXCHANGE_TIMEOUT_MS)
  if (reply[0] !== STK_INSYNC || reply[reply.length - 1] !== STK_OK) {
    throw new FirmwareError('no_sync', `Réponse inattendue du chargeur (${toHex(reply)})`)
  }
  return reply.subarray(1, -1)
}

/**
 * Entre dans le chargeur (impulsion DTR, synchronisation à 115200 puis, une fois, à 57600) et lit
 * la signature. Une signature autre que celle de l'ATmega328P ferme le port et lève
 * `wrong_signature` : aucun client n'est rendu, donc aucune écriture n'est possible.
 */
export async function connectBootloader(options: LinkOptions): Promise<BootloaderClient> {
  const { port, signal, onProgress } = options
  const clock = options.clock ?? browserClock
  const report = (step: FirmwareStep, done: number, total: number) =>
    onProgress?.({ step, done, total })

  report('sync', 0, 1)
  let link: Link | null = null
  let baudRate: number = BAUD_RATES[0]
  for (const baud of BAUD_RATES) {
    const candidate = await openLink(port, baud, clock)
    try {
      await pulseReset(port, clock)
      if (await synchronise(candidate, clock, signal)) {
        link = candidate
        baudRate = baud
        break
      }
    } catch (error) {
      await candidate.close()
      throw error
    }
    await candidate.close()
  }
  if (!link) {
    throw new FirmwareError(
      'no_sync',
      'Le chargeur de la carte ne répond pas : branchez la carte, ou appuyez sur RESET au départ'
    )
  }
  const open = link

  try {
    const signature = await exchange(open, [STK_READ_SIGN, CRC_EOP], UNO_SIGNATURE.length)
    if (UNO_SIGNATURE.some((byte, index) => signature[index] !== byte)) {
      throw new FirmwareError(
        'wrong_signature',
        `Signature ${toHex(signature)} : ce n'est pas un Uno (ATmega328P, ${toHex(UNO_SIGNATURE)})`
      )
    }
  } catch (error) {
    await open.close()
    throw error
  }
  report('sync', 1, 1)

  const loadAddress = async (byteAddress: number) => {
    const word = byteAddress / 2
    await exchange(open, [STK_LOAD_ADDRESS, word & 0xff, word >> 8, CRC_EOP], 0)
  }

  const readPages = async (size: number, step: 'backup' | 'verify') => {
    const out = new Uint8Array(size)
    for (let offset = 0; offset < size; offset += FLASH_PAGE_SIZE) {
      throwIfCancelled(signal)
      await loadAddress(offset)
      const page = await exchange(
        open,
        [STK_READ_PAGE, FLASH_PAGE_SIZE >> 8, FLASH_PAGE_SIZE & 0xff, MEMTYPE_FLASH, CRC_EOP],
        FLASH_PAGE_SIZE
      )
      out.set(page.subarray(0, Math.min(FLASH_PAGE_SIZE, size - offset)), offset)
      report(step, Math.min(offset + FLASH_PAGE_SIZE, size), size)
    }
    return out
  }

  return {
    baudRate,
    async readFlash(size) {
      assertFits(size)
      return readPages(size, 'backup')
    },
    async writeFlash(image) {
      assertFits(image.length)
      for (let offset = 0; offset < image.length; offset += FLASH_PAGE_SIZE) {
        throwIfCancelled(signal)
        const page = new Uint8Array(FLASH_PAGE_SIZE).fill(0xff)
        page.set(image.subarray(offset, offset + FLASH_PAGE_SIZE))
        await loadAddress(offset)
        await exchange(
          open,
          [
            STK_PROG_PAGE,
            FLASH_PAGE_SIZE >> 8,
            FLASH_PAGE_SIZE & 0xff,
            MEMTYPE_FLASH,
            ...page,
            CRC_EOP,
          ],
          0
        )
        report('write', Math.min(offset + FLASH_PAGE_SIZE, image.length), image.length)
      }
      const written = await readPages(image.length, 'verify')
      const wrong = written.findIndex((byte, index) => byte !== image[index])
      if (wrong !== -1) {
        throw new FirmwareError(
          'verify_failed',
          `Relecture différente de l'image à l'adresse 0x${wrong.toString(16).padStart(4, '0')}`,
          { address: wrong }
        )
      }
    },
    async leave() {
      report('exit', 0, 1)
      await exchange(open, [STK_LEAVE_PROGMODE, CRC_EOP], 0)
      report('exit', 1, 1)
    },
    close: () => open.close(),
  }
}

/** Lit un `.hex` et refuse tout de suite une image vide ou trop grande, avant de toucher au port. */
function loadImage(hexText: string) {
  const image = parseIntelHex(hexText)
  if (image.length === 0) {
    throw new IntelHexError('no_data', 1, 'aucune donnée à écrire')
  }
  assertFits(image.length)
  return image
}

export type InstallFirmwareOptions = LinkOptions & {
  /** Contenu du fichier `.hex` à installer. */
  hex: string
  /**
   * Reçoit la flash entière de la carte, relue avant toute écriture. Rien n'est écrit tant que
   * cette fonction n'a pas abouti : si elle lève, l'installation s'arrête (`backup_failed`).
   */
  onBackup: (backup: Uint8Array) => void | Promise<void>
}

/**
 * Installe un programme : synchronisation, signature, sauvegarde relue et remise à `onBackup`,
 * écriture, relecture, sortie du mode de programmation. En cas d'erreur le port est fermé sans
 * quitter le chargeur : l'installation se recommence (le chargeur n'est jamais écrasé).
 */
export async function installFirmware(options: InstallFirmwareOptions): Promise<void> {
  const image = loadImage(options.hex)
  const client = await connectBootloader(options)
  try {
    const backup = await client.readFlash(UNO_FLASH_SIZE)
    try {
      await options.onBackup(backup)
    } catch (error) {
      throw new FirmwareError('backup_failed', 'Sauvegarde du programme en place refusée', {
        cause: error,
      })
    }
    await client.writeFlash(image)
    await client.leave()
  } finally {
    await client.close()
  }
}

/** Réécrit un `.hex` fourni (en pratique la sauvegarde téléchargée), le relit, puis lance la carte. */
export async function restoreFirmware(options: LinkOptions & { hex: string }): Promise<void> {
  const image = loadImage(options.hex)
  const client = await connectBootloader(options)
  try {
    await client.writeFlash(image)
    await client.leave()
  } finally {
    await client.close()
  }
}
