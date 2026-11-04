import type { SerialPortLike } from '@quizzup/hardware'

type Listener = (event: Event) => void

export type FakeUsbPort = SerialPortLike & { frames: Uint8Array[] }

/** Interface USB DMX factice : accepte toutes les trames et les garde. */
export function createFakeUsbPort(info = { usbVendorId: 0x04_03, usbProductId: 0x60_01 }) {
  const port: FakeUsbPort = {
    frames: [],
    open: async () => undefined,
    close: async () => undefined,
    getInfo: () => info,
    writable: {
      getWriter: () => ({
        write: async (chunk: Uint8Array) => {
          port.frames.push(chunk.slice())
        },
        releaseLock: () => undefined,
        abort: async () => undefined,
      }),
    } as unknown as WritableStream<Uint8Array>,
  }
  return port
}

/** Installe un faux `navigator.serial` (Web Serial) qui propose `port`. */
export function installFakeSerial(port: SerialPortLike) {
  const listeners = new Map<string, Set<Listener>>()
  const serial = {
    requestPort: async () => port,
    getPorts: async () => [port],
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

export function uninstallFakeSerial(): void {
  Reflect.deleteProperty(navigator, 'serial')
}
