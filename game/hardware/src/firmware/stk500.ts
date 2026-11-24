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
/** Anciens chargeurs (57600 bauds) : 2 Kio de chargeur, donc 32 768 - 2 048 octets de programme. */
const OLD_LOADER_FLASH_SIZE = 30_720
/** Page de flash de l'ATmega328P (`SPM_PAGESIZE` = 128 octets). */
export const FLASH_PAGE_SIZE = 128
/** 115200 : `boards.txt`, `uno.upload.speed` ; 57600 : anciens Optiboot / cartes de la même famille. */
const BAUD_RATES = [115_200, 57_600] as const

/**
 * Impulsion de remise à zéro par DTR : 50 ms dans chaque état. avrdude garde le signal 250 ms puis
 * 50 ms : la valeur se règle sur le banc, selon la carte et son pilote USB.
 */
const RESET_PULSE_MS = 50
/** Le chargeur n'écoute qu'une seconde après la remise à zéro (`WDTPERIOD`, `optiboot.c`). */
const SYNC_WINDOW_MS = 1000
/**
 * Écart entre deux `GET_SYNC`, comme avrdude. Au démarrage, Optiboot clignote avec la LED (environ
 * 375 ms) sans lire le port, et son registre de réception ne garde que 2 octets : des envois plus
 * rapprochés ne reçoivent que des réponses en retard, qui décalent le dialogue.
 */
const SYNC_SPACING_MS = 250
/** Silence attendu après la première réponse, avant de vider l'entrée et de confirmer (avrdude). */
const SYNC_SETTLE_MS = 50
/** Pendant `onBackup`, un `GET_SYNC` à cet intervalle empêche le chargeur de sortir (1 s de silence). */
const KEEPALIVE_MS = 250
/** Erreurs de lecture passagères de Web Serial : le flux se ferme mais le port reste utilisable. */
const TRANSIENT_READ_ERRORS = ['FramingError', 'BreakError', 'BufferOverrunError', 'ParityError']
/** Reprises de lecture de suite sans un octet reçu, avant de renoncer. */
const MAX_READ_RESUMES = 5
/** Délai de chaque échange commande / réponse (une page de 128 octets dure environ 30 ms). */
const EXCHANGE_TIMEOUT_MS = 500
const CLOSE_TIMEOUT_MS = 1000

/**
 * Page 0 inerte : `rjmp .-2` (0xCFFF, soit `FF CF` en mémoire) puis de la flash effacée. Écrite en
 * premier, elle fait boucler la carte sur place, broches en entrée, tant que la vraie page 0 n'est
 * pas écrite : Optiboot lance le programme après 1 s de silence, quoi qu'il arrive à l'installation.
 */
const INERT_PAGE = new Uint8Array(FLASH_PAGE_SIZE).fill(0xff)
INERT_PAGE[1] = 0xcf

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
  /** `onBackup` a échoué ou les deux lectures de la flash diffèrent : rien n'a été écrit. */
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
  /** Taille de programme acceptée : 32 256 octets, 30 720 pour un ancien chargeur (57600 bauds). */
  flashSize: number
  /** Relit les `size` premiers octets de la flash, par pages de 128 octets. */
  readFlash: (size: number) => Promise<Uint8Array>
  /**
   * Lit deux fois toute la zone de programme et compare : `backup_failed` si les lectures
   * diffèrent (lecture douteuse, sauvegarde non fiable).
   */
  readBackup: () => Promise<Uint8Array>
  /**
   * Attend la fin de `task` en gardant le chargeur actif (un `GET_SYNC` toutes les 250 ms) : sans
   * cela Optiboot sort après 1 s de silence et lance l'ancien programme. Aucun envoi n'est fait
   * pendant l'écriture : la boucle s'arrête avant de rendre la main.
   */
  keepAlive: <T>(task: () => Promise<T>) => Promise<T>
  /**
   * Écrit l'image par pages, la relit et la compare. Ordre : page 0 inerte, pages 1 à n, vraie
   * page 0 en dernier ; une écriture interrompue laisse donc la carte en boucle sur place, jamais
   * un programme mélangé.
   */
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

function assertFits(size: number, limit = UNO_FLASH_SIZE) {
  if (size > limit) {
    throw new FirmwareError(
      'too_large',
      `Programme de ${size} octets : la carte n'en accepte que ${limit}`
    )
  }
}

const noop = (): void => undefined

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
  let reader = readable.getReader()
  const writer = writable.getWriter()

  let buffer: number[] = []
  let ended = false
  let wake = null as (() => void) | null
  // Une seule lecture en cours, tout au long de la session : le délai d'une attente ne la perd pas.
  void (async () => {
    let resumes = 0
    for (;;) {
      try {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        resumes = 0
        buffer.push(...value)
        wake?.()
      } catch (error) {
        // Erreur passagère (trame, rupture, débordement, parité) : Web Serial ferme ce flux mais
        // remplace `port.readable`, on reprend dessus. Toute autre erreur (`NetworkError`, carte
        // débranchée) ou un port sans flux : fin de session.
        const name = (error as { name?: unknown } | null)?.name
        const next = port.readable
        if (!TRANSIENT_READ_ERRORS.includes(String(name)) || !next || resumes >= MAX_READ_RESUMES) {
          break
        }
        resumes += 1
        reader.releaseLock()
        reader = next.getReader()
      }
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

/** Un `STK_GET_SYNC` et sa réponse : `false` sans réponse dans le délai ou si elle est fausse. */
async function trySync(link: Link) {
  await link.send(Uint8Array.of(STK_GET_SYNC, CRC_EOP))
  try {
    const reply = await link.take(2, SYNC_SPACING_MS)
    return reply[0] === STK_INSYNC && reply[1] === STK_OK
  } catch (error) {
    if (error instanceof FirmwareError && error.code === 'timeout') {
      return false
    }
    throw error
  }
}

/**
 * Envoie `STK_GET_SYNC` toutes les 250 ms au moins, pendant la fenêtre d'écoute du chargeur. À la
 * première réponse correcte (qui peut répondre à un envoi ancien), comme avrdude : 50 ms de
 * silence, entrée vidée, `GET_SYNC` de confirmation. Seule cette confirmation compte : les
 * réponses en retard sont jetées avec l'entrée et ne décalent pas la lecture de la signature.
 */
async function synchronise(link: Link, clock: Clock, signal: AbortSignal | undefined) {
  const deadline = clock.now() + SYNC_WINDOW_MS
  while (clock.now() < deadline) {
    throwIfCancelled(signal)
    link.flush()
    const sentAt = clock.now()
    if (await trySync(link)) {
      await sleep(clock, SYNC_SETTLE_MS)
      link.flush()
      if (await trySync(link)) {
        return true
      }
    }
    const rest = sentAt + SYNC_SPACING_MS - clock.now()
    if (rest > 0) {
      await sleep(clock, rest)
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

  const flashSize = baudRate === BAUD_RATES[0] ? UNO_FLASH_SIZE : OLD_LOADER_FLASH_SIZE

  // Optiboot n'avance pas l'adresse de lui-même : une adresse avant chaque page.
  const loadAddress = async (byteAddress: number) => {
    const word = byteAddress / 2
    await exchange(open, [STK_LOAD_ADDRESS, word & 0xff, word >> 8, CRC_EOP], 0)
  }

  const readPage = async (offset: number) => {
    await loadAddress(offset)
    return exchange(
      open,
      [STK_READ_PAGE, FLASH_PAGE_SIZE >> 8, FLASH_PAGE_SIZE & 0xff, MEMTYPE_FLASH, CRC_EOP],
      FLASH_PAGE_SIZE
    )
  }

  const programPage = async (offset: number, page: Uint8Array) => {
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
  }

  /** Relit une page et la compare à celle écrite : `verify_failed` à l'adresse du premier écart. */
  const verifyPage = async (offset: number, expected: Uint8Array) => {
    const page = await readPage(offset)
    const wrong = expected.findIndex((byte, index) => page[index] !== byte)
    if (wrong !== -1) {
      const address = offset + wrong
      throw new FirmwareError(
        'verify_failed',
        `Relecture différente de l'image à l'adresse 0x${address.toString(16).padStart(4, '0')}`,
        { address }
      )
    }
  }

  /** Lit `size` octets ; `base` et `total` placent la lecture dans une progression plus longue. */
  const readPages = async (size: number, base = 0, total = size) => {
    const out = new Uint8Array(size)
    for (let offset = 0; offset < size; offset += FLASH_PAGE_SIZE) {
      throwIfCancelled(signal)
      const page = await readPage(offset)
      out.set(page.subarray(0, Math.min(FLASH_PAGE_SIZE, size - offset)), offset)
      report('backup', base + Math.min(offset + FLASH_PAGE_SIZE, size), total)
    }
    return out
  }

  return {
    baudRate,
    flashSize,
    async readFlash(size) {
      assertFits(size, flashSize)
      return readPages(size)
    },
    async readBackup() {
      const first = await readPages(flashSize, 0, flashSize * 2)
      const second = await readPages(flashSize, flashSize, flashSize * 2)
      if (first.some((byte, index) => byte !== second[index])) {
        throw new FirmwareError(
          'backup_failed',
          'Deux lectures de la flash donnent des octets différents : sauvegarde non fiable'
        )
      }
      return first
    },
    async keepAlive(task) {
      const pending = Promise.resolve().then(task)
      let settled = false
      const done = () => {
        settled = true
      }
      pending.then(done, done)
      while (!settled) {
        let stopTick = noop
        const tick = new Promise<void>((resolve) => {
          const timer = clock.setTimeout(resolve, KEEPALIVE_MS)
          stopTick = () => clock.clearTimeout(timer)
        })
        await Promise.race([pending.then(noop, noop), tick])
        stopTick()
        if (!settled) {
          throwIfCancelled(signal)
          await exchange(open, [STK_GET_SYNC, CRC_EOP], 0)
        }
      }
      return pending
    },
    async writeFlash(image) {
      assertFits(image.length, flashSize)
      const pages = Math.ceil(image.length / FLASH_PAGE_SIZE)
      if (pages === 0) {
        return
      }
      const bytesOf = (index: number) =>
        Math.min(FLASH_PAGE_SIZE, image.length - index * FLASH_PAGE_SIZE)
      let written = 0
      let verified = 0
      const program = async (index: number) => {
        throwIfCancelled(signal)
        await programPage(index * FLASH_PAGE_SIZE, pageOf(image, index))
        written += bytesOf(index)
        report('write', written, image.length)
      }
      const verify = async (index: number) => {
        throwIfCancelled(signal)
        await verifyPage(index * FLASH_PAGE_SIZE, pageOf(image, index))
        verified += bytesOf(index)
        report('verify', verified, image.length)
      }

      // 1. Page 0 inerte, relue : à partir d'ici un arrêt laisse la carte en boucle sur place.
      throwIfCancelled(signal)
      await programPage(0, INERT_PAGE)
      await verifyPage(0, INERT_PAGE)
      // 2. Pages 1 à n, relues.
      for (let index = 1; index < pages; index += 1) {
        await program(index)
      }
      for (let index = 1; index < pages; index += 1) {
        await verify(index)
      }
      // 3. La vraie page 0 en dernier, relue : elle seule rend la carte exécutable.
      await program(0)
      await verify(0)
    },
    async leave() {
      report('exit', 0, 1)
      await exchange(open, [STK_LEAVE_PROGMODE, CRC_EOP], 0)
      report('exit', 1, 1)
    },
    close: () => open.close(),
  }
}

/** Page `index` de l'image, complétée par de la flash effacée. */
function pageOf(image: Uint8Array, index: number) {
  const page = new Uint8Array(FLASH_PAGE_SIZE).fill(0xff)
  page.set(image.subarray(index * FLASH_PAGE_SIZE, (index + 1) * FLASH_PAGE_SIZE))
  return page
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
   * Reçoit la flash de la carte (zone de programme), lue deux fois et comparée avant toute
   * écriture. Rien n'est écrit tant que cette fonction n'a pas abouti : si elle lève, l'installation
   * s'arrête (`backup_failed`). Elle peut durer (choix d'un fichier, téléchargement) : le chargeur
   * est maintenu actif pendant ce temps.
   */
  onBackup: (backup: Uint8Array) => void | Promise<void>
}

/**
 * Installe un programme : synchronisation, signature, sauvegarde lue deux fois et remise à
 * `onBackup`, écriture (page 0 inerte, pages 1 à n, vraie page 0), relecture, sortie du mode de
 * programmation. En cas d'erreur le port est fermé sans quitter le chargeur, mais Optiboot sort
 * seul après 1 s de silence : la carte lance alors ce que la flash contient. Tant que la vraie
 * page 0 n'est pas écrite, c'est la page inerte : la carte boucle sur place, broches en entrée
 * (relais retombé). Un RESET (ou un nouvel essai) permet de réinstaller.
 */
export async function installFirmware(options: InstallFirmwareOptions): Promise<void> {
  const image = loadImage(options.hex)
  const client = await connectBootloader(options)
  try {
    assertFits(image.length, client.flashSize)
    const backup = await client.readBackup()
    await client.keepAlive(async () => {
      try {
        await options.onBackup(backup)
      } catch (error) {
        throw new FirmwareError('backup_failed', 'Sauvegarde du programme en place refusée', {
          cause: error,
        })
      }
    })
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
    assertFits(image.length, client.flashSize)
    await client.writeFlash(image)
    await client.leave()
  } finally {
    await client.close()
  }
}
