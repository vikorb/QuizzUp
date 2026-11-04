import type { SerialLike, SerialPortLike } from '@hardware/dmx/serialOutput'

export type FakePort = SerialPortLike & {
  written: Uint8Array[]
  signals: { break?: boolean }[]
  openedWith: unknown
  /** `close()` a abouti au moins une fois. */
  closed: boolean
  /** Port ouvert (comme Web Serial : un second `open()` est refusé). */
  isOpen: boolean
  /** Un writer tient le verrou du flux d'écriture (`close()` est alors refusé). */
  locked: boolean
  failNextWrite: (error: Error) => void
}

const domError = (name: string, message: string) => Object.assign(new Error(message), { name })

/**
 * Faux port Web Serial, fidèle aux refus de Chrome : un second `open()` sur un port ouvert lève
 * `InvalidStateError`, `close()` est rejeté tant qu'un writer tient le verrou du flux, et
 * `getWriter()` lève si le flux est déjà verrouillé.
 */
export function createFakePort(options: { withSignals?: boolean; noWritable?: boolean } = {}) {
  const written: Uint8Array[] = []
  const signals: { break?: boolean }[] = []
  let failure: Error | null = null
  let released = 0
  let aborted = 0

  const writable = {
    getWriter: () => {
      if (port.locked) {
        throw new TypeError('WritableStream is locked')
      }
      port.locked = true
      let owns = true
      return {
        write: async (chunk: Uint8Array) => {
          if (failure) {
            const error = failure
            failure = null
            throw error
          }
          written.push(chunk.slice())
        },
        abort: async () => {
          aborted += 1
        },
        releaseLock: () => {
          released += 1
          if (owns) {
            owns = false
            port.locked = false
          }
        },
      }
    },
  } as unknown as WritableStream<Uint8Array>

  const port: FakePort = {
    written,
    signals,
    openedWith: null,
    closed: false,
    isOpen: false,
    locked: false,
    async open(openOptions) {
      if (port.isOpen) {
        throw domError('InvalidStateError', 'The port is already open.')
      }
      port.openedWith = openOptions
      port.isOpen = true
    },
    async close() {
      if (port.locked) {
        throw new TypeError('Cannot cancel a locked stream')
      }
      port.isOpen = false
      port.closed = true
    },
    writable: options.noWritable ? null : writable,
    ...(options.withSignals === false
      ? {}
      : {
          setSignals: async (value: { break?: boolean }) => {
            signals.push(value)
          },
        }),
    failNextWrite(error) {
      failure = error
    },
  }
  return { port, released: () => released, aborted: () => aborted }
}

export function createFakeSerial(ports: SerialPortLike[]) {
  const listeners = new Map<string, Set<(event: Event) => void>>()
  type FakeSerial = SerialLike & {
    disconnect: (port: SerialPortLike) => void
    emit: (type: string, port: unknown) => void
    requested: unknown[]
  }
  const serial: FakeSerial = {
    requested: [],
    async requestPort(options) {
      serial.requested.push(options)
      const port = ports[0]
      if (!port) {
        throw new Error('NotFoundError')
      }
      return port
    },
    async getPorts() {
      return ports
    },
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
    emit(type, port) {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener({ target: port } as unknown as Event)
      }
    },
    disconnect(port) {
      serial.emit('disconnect', port)
    },
  }
  return serial
}
