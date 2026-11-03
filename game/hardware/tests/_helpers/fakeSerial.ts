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
  const listeners = new Set<(event: Event) => void>()
  const serial: SerialLike & { disconnect: (port: SerialPortLike) => void; requested: unknown[] } =
    {
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
      addEventListener: (_type, listener) => {
        listeners.add(listener)
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener)
      },
      disconnect(port) {
        for (const listener of listeners) {
          listener({ target: port } as unknown as Event)
        }
      },
    }
  return serial
}
