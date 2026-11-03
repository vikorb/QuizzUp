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
  addEventListener?: (type: 'disconnect', listener: (event: Event) => void) => void
  removeEventListener?: (type: 'disconnect', listener: (event: Event) => void) => void
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
  /** Attente pendant le break Open DMX (le standard exige au moins 88 µs). */
  breakDelay?: () => Promise<void>
}

const defaultBreakDelay = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

/** Sortie DMX sur port série Web Serial (« DMX USB Pro » ou « Open DMX »). */
export function createSerialOutput(options: SerialOutputOptions): DmxOutput {
  const { port, driver } = options
  const serial = options.serial === undefined ? getWebSerial() : options.serial
  const breakDelay = options.breakDelay ?? defaultBreakDelay
  const disconnectEmitter = createEmitter<unknown>()
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null

  const onSerialDisconnect = (event: Event) => {
    if ((event.target as unknown) === port) {
      writer = null
      disconnectEmitter.emit(new Error('Interface DMX débranchée'))
    }
  }

  return {
    driver,
    async open() {
      if (driver === 'usbpro') {
        // Le débit est ignoré par l'interface (USB natif), mais Web Serial en exige un.
        await port.open({ baudRate: 57_600 })
      } else {
        await port.open({ baudRate: 250_000, dataBits: 8, stopBits: 2, parity: 'none' })
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
      try {
        if (driver === 'usbpro') {
          await writer.write(encodeUsbProFrame(universe))
          return
        }
        if (!port.setSignals) {
          throw new Error('Ce navigateur ne permet pas le break DMX (Open DMX)')
        }
        await port.setSignals({ break: true })
        await breakDelay()
        await port.setSignals({ break: false })
        await writer.write(encodeRawDmxFrame(universe))
      } catch (error) {
        writer = null
        disconnectEmitter.emit(error)
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
