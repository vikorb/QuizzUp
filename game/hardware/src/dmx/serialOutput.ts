import { createEmitter } from '../emitter'
import type { DmxOutput } from './output'
import { encodeRawDmxFrame, encodeUsbProFrame } from './universe'

/** Sous-ensemble de l'API Web Serial utilisé ici (Chrome/Edge, contexte sécurisé). */
export type SerialPortLike = {
  open: (options: {
    baudRate: number
    dataBits?: number
    stopBits?: number
    parity?: 'none' | 'even' | 'odd'
  }) => Promise<void>
  close: () => Promise<void>
  writable: WritableStream<Uint8Array> | null
  setSignals?: (signals: { break?: boolean }) => Promise<void>
  getInfo?: () => { usbVendorId?: number; usbProductId?: number }
}

export type SerialLike = {
  requestPort: (options?: {
    filters?: { usbVendorId?: number; usbProductId?: number }[]
  }) => Promise<SerialPortLike>
  getPorts: () => Promise<SerialPortLike[]>
  addEventListener?: (type: 'connect' | 'disconnect', listener: (event: Event) => void) => void
  removeEventListener?: (type: 'connect' | 'disconnect', listener: (event: Event) => void) => void
}

/** Puces USB-série les plus courantes sur les interfaces DMX (FTDI, CH340, CP210x, Arduino). */
export const DMX_USB_VENDOR_IDS = [0x0403, 0x1a86, 0x10c4, 0x2341] as const

export function getWebSerial(nav: Navigator | undefined = globalThis.navigator): SerialLike | null {
  return (nav as (Navigator & { serial?: SerialLike }) | undefined)?.serial ?? null
}

export function isWebSerialSupported(nav?: Navigator): boolean {
  return getWebSerial(nav) !== null
}

/**
 * Ouvre la fenêtre du navigateur pour choisir l'interface USB-DMX. Doit être appelé depuis un
 * clic (geste utilisateur). Le navigateur mémorise ensuite l'autorisation (`getGrantedDmxPort`).
 */
export async function requestDmxPort(
  serial: SerialLike | null = getWebSerial()
): Promise<SerialPortLike> {
  if (!serial) {
    throw new Error('Web Serial indisponible : utilisez Chrome ou Edge sur le PC de la salle')
  }
  return serial.requestPort({
    filters: DMX_USB_VENDOR_IDS.map((usbVendorId) => ({ usbVendorId })),
  })
}

/** Interface déjà autorisée lors d'une visite précédente : reconnexion sans clic après rechargement. */
export async function getGrantedDmxPort(
  serial: SerialLike | null = getWebSerial()
): Promise<SerialPortLike | null> {
  if (!serial) {
    return null
  }
  const ports = await serial.getPorts()
  return ports[0] ?? null
}

type SerialOutputOptions = {
  port: SerialPortLike
  driver: 'usbpro' | 'opendmx'
  serial?: SerialLike | null
  /** Attente en millisecondes (break Open DMX, fin d'émission d'une trame). Injectable en test. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Durée d'émission d'une trame Open DMX à 250 kbauds : 513 octets × 11 bits (start, 8 données,
 * 2 stop) = 22,6 ms. `write()` rend la main dès que l'octet est confié au système, pas quand il
 * est parti sur le câble : sans cette attente, le break suivant tronquerait la trame en cours.
 */
export const OPEN_DMX_FRAME_MS = Math.ceil((513 * 11) / 250)

/** Break DMX : le standard exige au moins 88 µs ; une milliseconde est la plus petite attente fiable. */
export const OPEN_DMX_BREAK_MS = 1

/** Sortie DMX sur port série Web Serial (« DMX USB Pro » ou « Open DMX »). */
export function createSerialOutput(options: SerialOutputOptions): DmxOutput {
  const { port, driver } = options
  const serial = options.serial === undefined ? getWebSerial() : options.serial
  const sleep = options.sleep ?? defaultSleep
  const disconnectEmitter = createEmitter<unknown>()
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null

  const onSerialDisconnect = (event: Event) => {
    if ((event.target as unknown) === port && writer) {
      writer = null
      disconnectEmitter.emit(new Error('Interface DMX débranchée'))
    }
  }

  const openPort = async () => {
    if (driver === 'usbpro') {
      // Le débit est ignoré par l'interface (USB natif), mais Web Serial en exige un.
      await port.open({ baudRate: 57_600 })
    } else {
      await port.open({ baudRate: 250_000, dataBits: 8, stopBits: 2, parity: 'none' })
    }
  }

  return {
    driver,
    async open() {
      try {
        await openPort()
      } catch (error) {
        // Port resté ouvert par cette page (rechargement à chaud, onglet précédent) : on le
        // referme et on réessaie une fois. Les autres erreurs sont traduites pour l'opérateur.
        if (describeSerialError(error).code !== 'already_open') {
          throw new Error(describeSerialError(error).message, { cause: error })
        }
        try {
          await port.close()
          await openPort()
        } catch (retryError) {
          throw new Error(describeSerialError(retryError).message, { cause: retryError })
        }
      }
      if (!port.writable) {
        throw new Error('Interface DMX ouverte sans flux d’écriture')
      }
      writer = port.writable.getWriter()
      serial?.addEventListener?.('disconnect', onSerialDisconnect)
    },
    async write(universe) {
      if (!writer) {
        throw new Error('Interface DMX non ouverte')
      }
      const current = writer
      try {
        if (driver === 'usbpro') {
          await current.write(encodeUsbProFrame(universe))
          return
        }
        if (!port.setSignals) {
          throw new Error('Ce navigateur ne permet pas le break DMX (Open DMX)')
        }
        await port.setSignals({ break: true })
        await sleep(OPEN_DMX_BREAK_MS)
        await port.setSignals({ break: false })
        await current.write(encodeRawDmxFrame(universe))
        await sleep(OPEN_DMX_FRAME_MS)
      } catch (error) {
        if (writer === current) {
          writer = null
          disconnectEmitter.emit(error)
        }
        throw error
      }
    },
    async close() {
      serial?.removeEventListener?.('disconnect', onSerialDisconnect)
      const current = writer
      writer = null
      try {
        current?.releaseLock()
        await port.close()
      } catch {
        // Port déjà fermé ou débranché : rien à faire.
      }
    },
    onDisconnect: disconnectEmitter.on,
  }
}

export type SerialErrorCode =
  'unsupported' | 'cancelled' | 'busy' | 'already_open' | 'forbidden' | 'disconnected' | 'unknown'

export type SerialErrorDescription = {
  code: SerialErrorCode
  /** Message pour l'opérateur, en français. */
  message: string
  /** Piste de résolution. */
  hint: string
}

/**
 * Traduit une erreur Web Serial en message compréhensible par un opérateur de salle. Les noms
 * viennent des `DOMException` levées par Chrome/Edge.
 */
export function describeSerialError(error: unknown): SerialErrorDescription {
  const name = (error as { name?: unknown } | null)?.name
  const text = String((error as { message?: unknown } | null)?.message ?? error ?? '')

  if (name === 'NotFoundError') {
    return {
      code: 'cancelled',
      message: 'Aucune interface choisie',
      hint: 'Rebranchez l’interface USB-DMX puis cliquez de nouveau sur « Connecter ».',
    }
  }
  if (name === 'InvalidStateError' || /already open/i.test(text)) {
    return {
      code: 'already_open',
      message: 'Interface déjà ouverte par cette page',
      hint: 'Rechargez la page si le problème persiste.',
    }
  }
  if (name === 'NetworkError' || /failed to open/i.test(text)) {
    return {
      code: 'busy',
      message: 'Interface occupée ou inaccessible',
      hint:
        'Fermez les autres logiciels lumière (QLC+, logiciel ENTTEC…) et les autres onglets QuizzUP, ' +
        'puis débranchez et rebranchez l’interface. Sous Windows, vérifiez le pilote FTDI (port COM).',
    }
  }
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return {
      code: 'forbidden',
      message: 'Le navigateur refuse l’accès au port série',
      hint: 'Ouvrez QuizzUP en HTTPS dans Chrome ou Edge, et vérifiez qu’aucune règle d’entreprise ne bloque Web Serial.',
    }
  }
  if (name === 'BreakError' || name === 'BufferOverrunError' || /lost|disconnect/i.test(text)) {
    return {
      code: 'disconnected',
      message: 'Interface DMX débranchée',
      hint: 'Rebranchez l’interface : elle sera reprise automatiquement.',
    }
  }
  if (/Web Serial indisponible/.test(text)) {
    return {
      code: 'unsupported',
      message: 'Web Serial indisponible',
      hint: 'Utilisez Chrome ou Edge sur ordinateur (pas Firefox ni Safari).',
    }
  }
  return {
    code: 'unknown',
    message: text || 'Erreur inconnue',
    hint: 'Débranchez et rebranchez l’interface.',
  }
}

const KNOWN_VENDORS: Record<number, string> = {
  0x0403: 'FTDI',
  0x1a86: 'CH340',
  0x10c4: 'Silicon Labs CP210x',
  0x2341: 'Arduino',
}

const hex = (value: number | undefined) => (value ?? 0).toString(16).padStart(4, '0')

/** Libellé lisible d'un port (« FTDI 0403:6001 ») pour l'écran de diagnostic. */
export function describePort(port: SerialPortLike): string {
  const info = port.getInfo?.() ?? {}
  if (info.usbVendorId === undefined) {
    return 'Port série'
  }
  const vendor = KNOWN_VENDORS[info.usbVendorId] ?? 'USB'
  return `${vendor} ${hex(info.usbVendorId)}:${hex(info.usbProductId)}`
}

const samePort = (left: SerialPortLike, right: SerialPortLike) => {
  const leftInfo = left.getInfo?.() ?? {}
  const rightInfo = right.getInfo?.() ?? {}
  return (
    left === right ||
    (leftInfo.usbVendorId !== undefined &&
      leftInfo.usbVendorId === rightInfo.usbVendorId &&
      leftInfo.usbProductId === rightInfo.usbProductId)
  )
}

/**
 * Reconnexion à chaud : prévient quand une interface déjà autorisée est rebranchée (événement
 * `connect` de Web Serial), pour la rouvrir sans clic. Avec `match`, seule une interface du
 * même modèle (fabricant + produit USB) est reprise.
 */
export function watchDmxPortReconnection(options: {
  serial?: SerialLike | null
  match?: SerialPortLike
  onReconnect: (port: SerialPortLike) => void
}): () => void {
  const serial = options.serial === undefined ? getWebSerial() : options.serial
  if (!serial?.addEventListener) {
    return () => undefined
  }
  const onConnect = (event: Event) => {
    const port = event.target as unknown as SerialPortLike | null
    if (port && (!options.match || samePort(port, options.match))) {
      options.onReconnect(port)
    }
  }
  serial.addEventListener('connect', onConnect)
  return () => serial.removeEventListener?.('connect', onConnect)
}
