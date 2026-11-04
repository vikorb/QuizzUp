import type { WebSocketConstructorLike, WebSocketLike } from '@hardware/dmx/bridgeOutput'

export type FakeWebSocket = WebSocketLike & {
  url: string
  sent: (string | Uint8Array)[]
  closedWith: { code?: number; reason?: string } | null
  /** Le serveur accepte la connexion (déclenche `onopen`). */
  serverOpen: () => void
  /** Le serveur envoie un message (objet → JSON). */
  serverSend: (data: unknown) => void
  /** La connexion tombe (déclenche `onclose`). */
  serverClose: (code?: number, reason?: string) => void
  serverError: () => void
  setBufferedAmount: (bytes: number) => void
}

/** Faux `WebSocket` piloté par le test ; `sockets` garde chaque instance créée. */
export function createFakeWebSocketClass(options: { throwOnCreate?: unknown } = {}) {
  const sockets: FakeWebSocket[] = []

  class Fake implements WebSocketLike {
    readyState = 0
    bufferedAmount = 0
    binaryType = 'blob'
    onopen: WebSocketLike['onopen'] = null
    onmessage: WebSocketLike['onmessage'] = null
    onclose: WebSocketLike['onclose'] = null
    onerror: WebSocketLike['onerror'] = null
    sent: (string | Uint8Array)[] = []
    closedWith: { code?: number; reason?: string } | null = null
    url: string

    constructor(url: string) {
      if (options.throwOnCreate !== undefined) {
        throw options.throwOnCreate
      }
      this.url = url
      sockets.push(this as unknown as FakeWebSocket)
    }

    send(data: string | ArrayBufferView | ArrayBuffer) {
      if (typeof data === 'string') {
        this.sent.push(data)
      } else if (data instanceof ArrayBuffer) {
        this.sent.push(new Uint8Array(data).slice())
      } else {
        this.sent.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice())
      }
    }

    close(code?: number, reason?: string) {
      this.closedWith = { code, reason }
      this.readyState = 3
    }

    serverOpen() {
      this.readyState = 1
      this.onopen?.({})
    }

    serverSend(data: unknown) {
      this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) })
    }

    serverClose(code = 1006, reason = '') {
      this.readyState = 3
      this.onclose?.({ code, reason })
    }

    serverError() {
      this.onerror?.({})
    }

    setBufferedAmount(bytes: number) {
      this.bufferedAmount = bytes
    }
  }

  return { WebSocketImpl: Fake as unknown as WebSocketConstructorLike, sockets }
}
