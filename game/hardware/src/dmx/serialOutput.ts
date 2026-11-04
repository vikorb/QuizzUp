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

const isDmxVendor = (port: SerialPortLike) => {
  const vendorId = port.getInfo?.().usbVendorId
  return vendorId !== undefined && (DMX_USB_VENDOR_IDS as readonly number[]).includes(vendorId)
}

/**
 * Interface déjà autorisée lors d'une visite précédente : reconnexion sans clic après rechargement.
 * Le navigateur peut avoir autorisé plusieurs ports (adaptateur série, Arduino des buzzers…) :
 *
 * - avec `match` (l'interface utilisée jusqu'ici), on préfère le même objet port, puis une
 *   interface du même modèle (fabricant + produit USB), puis une puce USB-série DMX connue, sinon
 *   rien : on ne rouvre jamais un port quelconque à la place de l'interface DMX ;
 * - sans `match`, on préfère une puce USB-série DMX connue, sinon le premier port autorisé.
 */
export async function getGrantedDmxPort(
  serial: SerialLike | null = getWebSerial(),
  options: { match?: SerialPortLike } = {}
): Promise<SerialPortLike | null> {
  if (!serial) {
    return null
  }
  const ports = await serial.getPorts()
  const { match } = options
  if (!match) {
    return ports.find(isDmxVendor) ?? ports[0] ?? null
  }
  return (
    ports.find((port) => port === match) ??
    ports.find((port) => samePort(port, match)) ??
    ports.find(isDmxVendor) ??
    null
  )
}

type SerialOutputOptions = {
  port: SerialPortLike
  driver: 'usbpro' | 'opendmx'
  serial?: SerialLike | null
  /** Attente en millisecondes (fin d'émission d'une trame Open DMX). Injectable en test. */
  sleep?: (ms: number) => Promise<void>
  /** Horloge monotone en millisecondes (`performance.now` par défaut). Injectable en test. */
  now?: () => number
  /** Durée maximale laissée à `port.close()` (interface figée) avant d'abandonner. */
  closeTimeoutMs?: number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Durée d'émission d'une trame Open DMX à 250 kbauds : 513 octets × 11 bits (start, 8 données,
 * 2 stop) = 22,6 ms. `write()` rend la main dès que l'octet est confié au système, pas quand il
 * est parti sur le câble : le break suivant ne doit pas partir avant, sinon il tronquerait la
 * trame en cours.
 */
export const OPEN_DMX_FRAME_MS = Math.ceil((513 * 11) / 250)

/** Au-delà, `close()` abandonne la fermeture du port (interface USB figée) sans rejeter. */
export const SERIAL_CLOSE_TIMEOUT_MS = 1000

/**
 * Libère le flux d'écriture : `abort()` jette les octets encore en file (une interface figée ne
 * les enverra jamais), puis `releaseLock()` déverrouille le flux. Sans cela, `port.close()` est
 * rejeté (« flux verrouillé ») et le même port ne peut plus être rouvert. On n'attend pas
 * `abort()` : il peut ne jamais aboutir sur une interface figée.
 */
function discardWriter(writer: WritableStreamDefaultWriter<Uint8Array>) {
  writer.abort().catch(() => undefined)
  try {
    writer.releaseLock()
  } catch {
    // Verrou déjà rendu.
  }
}

/**
 * Sortie DMX sur port série Web Serial (« DMX USB Pro » ou « Open DMX »).
 *
 * Open DMX : le navigateur doit fabriquer lui-même le break DMX et le rythme des trames. Chrome
 * bride les minuteurs d'un onglet masqué à environ 1 s : une attente par `setTimeout` dans
 * chaque trame (break, fin d'émission) la ferait durer plus de 2 s et le contrôleur lumières
 * déclarerait la sortie en erreur (délai d'écriture dépassé). Donc :
 *
 * - le break n'utilise aucun minuteur : l'aller-retour USB de `await setSignals()` (break posé,
 *   puis relâché) dure bien plus que les 88 µs exigées par le standard ;
 * - on ne dort plus après la trame : avant la trame suivante, on n'attend que le reste de
 *   `OPEN_DMX_FRAME_MS` depuis la fin de l'écriture précédente, et rien s'il est déjà écoulé
 *   (cas normal à 30 Hz, et toujours le cas quand l'onglet masqué espace les trames).
 */
export function createSerialOutput(options: SerialOutputOptions): DmxOutput {
  const { port, driver } = options
  const serial = options.serial === undefined ? getWebSerial() : options.serial
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? (() => performance.now())
  const closeTimeoutMs = options.closeTimeoutMs ?? SERIAL_CLOSE_TIMEOUT_MS
  const disconnectEmitter = createEmitter<unknown>()
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  /** Instant où la dernière trame Open DMX aura fini de partir sur le câble. */
  let frameEndsAt = Number.NEGATIVE_INFINITY

  /** Abandonne le writer courant (erreur, débranchement, fermeture) ; renvoie s'il y en avait un. */
  const dropWriter = () => {
    const current = writer
    writer = null
    if (current) {
      discardWriter(current)
    }
    return current !== null
  }

  /**
   * `port.close()` borné : une interface figée peut ne jamais rendre la main. Ne rejette pas.
   * Renvoie `false` si le délai a expiré.
   */
  const closePort = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const closed = await Promise.race([
      port.close().then(
        () => true,
        // Port déjà fermé ou débranché : rien à faire.
        () => true
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), closeTimeoutMs)
      }),
    ])
    clearTimeout(timer)
    return closed
  }

  const onSerialDisconnect = (event: Event) => {
    if ((event.target as unknown) === port && dropWriter()) {
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
          await closePort()
          await openPort()
        } catch (retryError) {
          throw new Error(describeSerialError(retryError).message, { cause: retryError })
        }
      }
      if (!port.writable) {
        // On ne laisse pas le port ouvert : la prochaine tentative échouerait (« déjà ouvert »).
        await closePort()
        throw new Error('Interface DMX ouverte sans flux d’écriture')
      }
      writer = port.writable.getWriter()
      frameEndsAt = Number.NEGATIVE_INFINITY
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
        const remaining = frameEndsAt - now()
        if (remaining > 0) {
          await sleep(remaining)
        }
        // Break sans minuteur : l'aller-retour USB de chaque `setSignals` dépasse les 88 µs.
        await port.setSignals({ break: true })
        await port.setSignals({ break: false })
        await current.write(encodeRawDmxFrame(universe))
        frameEndsAt = now() + OPEN_DMX_FRAME_MS
      } catch (error) {
        if (writer === current) {
          dropWriter()
          disconnectEmitter.emit(error)
        }
        throw error
      }
    },
    async close() {
      serial?.removeEventListener?.('disconnect', onSerialDisconnect)
      // Fermeture normale : on rend le verrou sans abandonner le flux, pour que `port.close()`
      // vide le tampon d'émission. La dernière trame (noire) part donc vraiment sur le câble ;
      // `abort()` la purgerait. On n'abandonne qu'en secours, si l'interface ne répond plus.
      const current = writer
      writer = null
      try {
        current?.releaseLock()
      } catch {
        // Verrou déjà rendu.
      }
      if (!(await closePort())) {
        // Le verrou est rendu : on abandonne le flux lui-même pour débloquer la fermeture.
        port.writable?.abort?.().catch(() => undefined)
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
