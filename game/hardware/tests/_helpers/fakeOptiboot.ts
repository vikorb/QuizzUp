import type { Clock, TimerHandle } from '@hardware/clock'
import type { SerialPortLike } from '@hardware/dmx/serialOutput'

import { flushPromises, type ManualClock } from './manualClock'

/**
 * Émulateur d'Optiboot (chargeur d'un Uno) derrière un faux port Web Serial.
 *
 * Les constantes sont écrites ici en dur, à partir d'`optiboot.c` / `stk500.h`, et non importées du
 * client : une constante fausse côté client fait échouer les tests au lieu de s'accorder avec elle.
 *
 * Fidèle au chargeur sur ce qui compte pour le client :
 * - après une remise à zéro (DTR qui repasse de bas à haut), il démarre pendant `bootMs` (la LED
 *   clignote) sans lire le port : les octets reçus alors tombent dans une mémoire de réception de
 *   `fifoBytes` octets (2 sur un ATmega328P), le reste est perdu ; ils sont traités à la fin du
 *   démarrage, d'où des réponses en retard ;
 * - il n'écoute ensuite qu'une seconde de silence (chaque octet reçu relance le chien de garde) ;
 *   puis « le programme » tourne et tout ce qu'on envoie est ignoré ;
 * - au mauvais débit, les octets sont des erreurs de trame : ignorés, sans relancer le délai ;
 * - chaque commande doit finir par `CRC_EOP`, sinon le chargeur se remet à zéro et lance le programme ;
 * - l'adresse ne bouge qu'avec `LOAD_ADDRESS` : ni `PROG_PAGE` ni `READ_PAGE` ne l'avancent ;
 * - une commande inconnue se contente de `STK_INSYNC` + `STK_OK`.
 */

const STK_OK = 0x10
const STK_INSYNC = 0x14
const CRC_EOP = 0x20
const CMD_LEAVE_PROGMODE = 0x51
const CMD_LOAD_ADDRESS = 0x55
const CMD_PROG_PAGE = 0x64
const CMD_READ_PAGE = 0x74
const CMD_READ_SIGN = 0x75
const MEMTYPE_FLASH = 0x46

export const FAKE_FLASH_SIZE = 32_256
const PAGE = 128

export type OptibootOptions = {
  clock: Clock
  /** Débit auquel le chargeur écoute (115200 pour un Uno récent, 57600 pour un ancien). */
  baudRate?: number
  signature?: readonly [number, number, number]
  /** Contenu initial de la flash (le reste vaut 0xFF). */
  flash?: Uint8Array
  /** Écoute mais ne répond jamais. */
  silent?: boolean
  /** Altère un octet de la page d'indice donné quand elle est écrite. */
  corruptPage?: number
  /** Limite `corruptPage` à ces écritures de la page (rangs depuis 0) ; toutes si absent. */
  corruptWrites?: number[]
  /** Altère le premier octet de la page d'indice donné à sa première lecture seulement. */
  flakyReadPage?: number
  /** Se débranche à la réception de la N-ième commande de page (lecture ou écriture, depuis 0). */
  disconnectAtPage?: number
  windowMs?: number
  /** Démarrage après une remise à zéro, sans écoute (clignotement de la LED d'Optiboot). */
  bootMs?: number
  /** Octets que la mémoire de réception retient pendant le démarrage. */
  fifoBytes?: number
  /**
   * Remplace les octets d'une réponse (`STK_INSYNC`, données, `STK_OK`) : renvoyer `undefined`
   * laisse la réponse normale, un tableau vide la supprime.
   */
  mangleReply?: (command: number, bytes: number[]) => number[] | undefined
}

const domError = (name: string, message: string) => Object.assign(new Error(message), { name })

export function createFakeOptiboot(options: OptibootOptions) {
  const { clock } = options
  const expectedBaud = options.baudRate ?? 115_200
  const signature = options.signature ?? [0x1e, 0x95, 0x0f]
  const windowMs = options.windowMs ?? 1000
  const bootMs = options.bootMs ?? 375
  const fifoBytes = options.fifoBytes ?? 2
  const flash = new Uint8Array(FAKE_FLASH_SIZE).fill(0xff)
  if (options.flash) {
    flash.set(options.flash)
  }
  const stats = {
    /** Débit de chaque ouverture du port. */
    opens: [] as number[],
    resets: 0,
    bytesReceived: 0,
    ignoredBytes: 0,
    badFrames: 0,
    pageCommands: 0,
    pagesWritten: 0,
    pagesRead: 0,
    /** Octets perdus par débordement de la mémoire de réception pendant le démarrage. */
    overflowedBytes: 0,
    /** Chaque écriture reçue au bon débit, avec l'heure de l'horloge simulée. */
    writes: [] as { at: number; bytes: number[] }[],
    /** Heure de chaque réponse envoyée. */
    repliesAt: [] as number[],
    /** Démarrage en cours après une remise à zéro : le port n'est pas lu. */
    booting: false,
    listening: false,
    /** Le programme de la carte tourne (sortie du chargeur, délai écoulé ou trame fausse). */
    programRunning: false,
  }

  let isOpen = false
  let lost = false
  let baud = 0
  let dtr = true
  let rx: number[] = []
  let bootFifo: number[] = []
  let address = 0
  let currentCommand = 0
  let flakyDone = false
  const pageWrites = new Map<number, number>()
  let timer: TimerHandle | undefined
  const clearTimer = () => {
    if (timer !== undefined) {
      clock.clearTimeout(timer)
    }
  }
  let readableStream: ReadableStream<Uint8Array> | null = null
  let writableStream: WritableStream<Uint8Array> | null = null
  let readController: ReadableStreamDefaultController<Uint8Array> | null = null
  let writeController: WritableStreamDefaultController | null = null

  const makeReadable = () => {
    readableStream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        readController = controller
      },
    })
  }
  const stopListening = () => {
    clearTimer()
    stats.booting = false
    stats.listening = false
    stats.programRunning = true
  }
  const armWindow = () => {
    clearTimer()
    timer = clock.setTimeout(stopListening, windowMs)
  }
  const disconnect = () => {
    lost = true
    clearTimer()
    readController?.error(domError('NetworkError', 'The device has been lost.'))
    writeController?.error(domError('NetworkError', 'The device has been lost.'))
  }
  const reply = (...data: number[]) => {
    if (!options.silent && isOpen && !lost) {
      const normal = [STK_INSYNC, ...data, STK_OK]
      const bytes = options.mangleReply?.(currentCommand, normal) ?? normal
      stats.repliesAt.push(clock.now())
      readController?.enqueue(Uint8Array.from(bytes))
    }
  }

  /** Longueur de la commande en tête de `rx`, ou `null` tant qu'on ne peut pas la connaître. */
  const commandLength = (): number | null => {
    switch (rx[0]) {
      case CMD_LOAD_ADDRESS:
        return 4
      case CMD_PROG_PAGE:
        return rx.length < 3 ? null : 4 + (((rx[1] ?? 0) << 8) | (rx[2] ?? 0)) + 1
      case CMD_READ_PAGE:
        return 5
      default:
        return 2
    }
  }

  const run = (command: number[]) => {
    const [cmd = 0] = command
    currentCommand = cmd
    if (cmd === CMD_PROG_PAGE || cmd === CMD_READ_PAGE) {
      stats.pageCommands += 1
      if (
        options.disconnectAtPage !== undefined &&
        stats.pageCommands - 1 === options.disconnectAtPage
      ) {
        disconnect()
        return
      }
    }
    switch (cmd) {
      case CMD_LOAD_ADDRESS:
        address = ((command[1] ?? 0) | ((command[2] ?? 0) << 8)) * 2
        reply()
        break
      case CMD_PROG_PAGE: {
        const length = ((command[1] ?? 0) << 8) | (command[2] ?? 0)
        if (command[3] === MEMTYPE_FLASH && address + length <= FAKE_FLASH_SIZE) {
          flash.set(command.slice(4, 4 + length), address)
          if (options.corruptPage === address / PAGE) {
            const rank = pageWrites.get(address) ?? 0
            pageWrites.set(address, rank + 1)
            if (options.corruptWrites === undefined || options.corruptWrites.includes(rank)) {
              flash[address] = (flash[address] ?? 0) ^ 0xff
            }
          }
          stats.pagesWritten += 1
        }
        reply()
        break
      }
      case CMD_READ_PAGE: {
        const length = ((command[1] ?? 0) << 8) | (command[2] ?? 0)
        // Autre mémoire que la flash (EEPROM) : le client n'en lit jamais, on rend de l'effacé.
        const page = Array.from({ length }, (_value, index) =>
          command[3] === MEMTYPE_FLASH ? (flash[address + index] ?? 0xff) : 0xff
        )
        if (options.flakyReadPage === address / PAGE && !flakyDone) {
          flakyDone = true
          page[0] = (page[0] ?? 0) ^ 0xff
        }
        stats.pagesRead += 1
        reply(...page)
        break
      }
      case CMD_READ_SIGN:
        reply(...signature)
        break
      case CMD_LEAVE_PROGMODE:
        reply()
        stopListening()
        break
      default:
        reply()
    }
  }

  const parse = () => {
    for (;;) {
      const length = commandLength()
      if (length === null || rx.length < length || !stats.listening || lost) {
        return
      }
      const command = rx.splice(0, length)
      if (command[length - 1] !== CRC_EOP) {
        // `verifySpace()` : chien de garde, remise à zéro, le programme démarre.
        stats.badFrames += 1
        rx = []
        stopListening()
        return
      }
      run(command)
    }
  }

  /** `replay` : octets de la mémoire de réception, déjà comptés à leur arrivée. */
  const receive = (chunk: Uint8Array, replay = false) => {
    if (!replay && baud === expectedBaud) {
      stats.writes.push({ at: clock.now(), bytes: Array.from(chunk) })
    }
    for (const byte of chunk) {
      if (!replay) {
        stats.bytesReceived += 1
      }
      if (stats.booting && baud === expectedBaud) {
        if (bootFifo.length < fifoBytes) {
          bootFifo.push(byte)
        } else {
          stats.overflowedBytes += 1
        }
        continue
      }
      if (!stats.listening || baud !== expectedBaud) {
        stats.ignoredBytes += 1
        continue
      }
      armWindow()
      rx.push(byte)
      parse()
    }
  }

  const endBoot = () => {
    stats.booting = false
    stats.listening = true
    armWindow()
    const buffered = bootFifo
    bootFifo = []
    receive(Uint8Array.from(buffered), true)
  }
  const reset = () => {
    rx = []
    bootFifo = []
    address = 0
    stats.resets += 1
    stats.booting = true
    stats.listening = false
    stats.programRunning = false
    clearTimer()
    timer = clock.setTimeout(endBoot, bootMs)
  }

  const port: SerialPortLike = {
    async open({ baudRate }) {
      if (isOpen) {
        throw domError('InvalidStateError', 'The port is already open.')
      }
      isOpen = true
      baud = baudRate
      dtr = true
      stats.opens.push(baudRate)
      makeReadable()
      writableStream = new WritableStream<Uint8Array>({
        start: (controller) => {
          writeController = controller
        },
        write: (chunk) => receive(chunk),
      })
    },
    async close() {
      if (!lost && (readableStream?.locked || writableStream?.locked)) {
        throw domError('InvalidStateError', 'Cannot close: streams are locked.')
      }
      isOpen = false
      readableStream = null
      writableStream = null
    },
    get readable() {
      return isOpen && !lost ? readableStream : null
    },
    get writable() {
      return isOpen && !lost ? writableStream : null
    },
    async setSignals(signals) {
      if (!isOpen || lost) {
        throw domError('InvalidStateError', 'The port is not open.')
      }
      if (signals.dataTerminalReady === undefined) {
        return
      }
      const wasHigh = dtr
      dtr = signals.dataTerminalReady
      if (!wasHigh && dtr) {
        reset()
      }
    },
  }

  /**
   * Erreur de lecture sur le port. Une erreur passagère (`FramingError`, `BreakError`…) ferme le
   * flux mais Web Serial le remplace dans `port.readable` (`recover`) ; `NetworkError` perd le port.
   */
  const injectReadError = (name: string, recover = true) => {
    readController?.error(domError(name, name))
    if (name === 'NetworkError') {
      lost = true
    } else if (recover) {
      makeReadable()
    } else {
      readableStream = null
    }
  }

  return { port, flash, stats, disconnect, injectReadError }
}

/**
 * Fait avancer l'horloge simulée, par pas de `stepMs` (50 ms) et en laissant les promesses se
 * résoudre entre deux, jusqu'à ce que `promise` soit réglée ; renvoie alors son résultat (ou
 * relève son erreur). Un pas plus grand accélère les attentes longues.
 */
export async function runWithClock<T>(
  clock: ManualClock,
  promise: Promise<T>,
  stepMs = 50
): Promise<T> {
  let done = false
  const finish = () => {
    done = true
  }
  promise.then(finish, finish)
  while (!done) {
    clock.advance(stepMs)
    await flushPromises()
  }
  return promise
}
