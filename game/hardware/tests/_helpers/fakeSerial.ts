import type { SerialLike, SerialPortLike } from '@hardware/dmx/serialOutput'

export type FakePort = SerialPortLike & {
  written: Uint8Array[]
  signals: { break?: boolean }[]
  openedWith: unknown
  closed: boolean
  failNextWrite: (error: Error) => void
}

export function createFakePort(options: { withSignals?: boolean; noWritable?: boolean } = {}) {
  const written: Uint8Array[] = []
  const signals: { break?: boolean }[] = []
  let failure: Error | null = null
  let released = 0

  const writable = {
    getWriter: () => ({
      write: async (chunk: Uint8Array) => {
        if (failure) {
          const error = failure
          failure = null
          throw error
        }
        written.push(chunk.slice())
      },
      releaseLock: () => {
        released += 1
      },
    }),
  } as unknown as WritableStream<Uint8Array>

  const port: FakePort = {
    written,
    signals,
    openedWith: null,
    closed: false,
    async open(openOptions) {
      port.openedWith = openOptions
    },
    async close() {
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
  return { port, released: () => released }
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
