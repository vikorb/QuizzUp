/**
 * Faux serveur de présence en direct : remplace `fetch` pour `GET /room/stream` (flux SSE piloté
 * à la main) et `POST /room/status` (corps relevés, réponse programmable).
 */
export type FakeStream = {
  url: string
  headers: Headers
  signal: AbortSignal
  /** Envoie un morceau de texte tel quel (il peut couper un événement n'importe où). */
  push: (text: string) => void
  /** Fin normale du flux côté serveur. */
  end: () => void
  /** Le client a abandonné la requête. */
  readonly aborted: boolean
}

export type FakeStatusCall = {
  headers: Headers
  signal: AbortSignal
  body: Record<string, unknown>
  /** Le client a abandonné la requête. */
  readonly aborted: boolean
  /** Répond à une requête laissée en attente (réponse `hang`). */
  respond: (status: number, body?: unknown) => void
}

type StreamReply = { status: number } | 'network-error'
/** `hang` : aucune réponse, la requête reste ouverte jusqu'à son abandon. */
type StatusReply = { status: number; body?: unknown } | 'network-error' | 'hang'

const networkError = () => Promise.reject(new TypeError('Failed to fetch'))

export function helloMessage(streamId = 'stream-1', heartbeatMs = 15_000, statusEveryMs = 15_000) {
  return `event: hello\ndata: ${JSON.stringify({ streamId, heartbeatMs, statusEveryMs })}\n\n`
}

export function createFakeLiveServer() {
  const encoder = new TextEncoder()
  const streams: FakeStream[] = []
  const statuses: FakeStatusCall[] = []
  /** Accusés de commande reçus (`POST /room/commands/:id/result`). */
  const acks: { commandId: string; body: Record<string, unknown> }[] = []
  const state: { streamReply: StreamReply; statusReply: StatusReply; ackReply: StreamReply } = {
    streamReply: { status: 200 },
    statusReply: { status: 204 },
    ackReply: { status: 204 },
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    const signal = init.signal as AbortSignal
    const headers = new Headers(init.headers)

    if (url.endsWith('/room/stream')) {
      if (state.streamReply === 'network-error') {
        return networkError()
      }
      if (state.streamReply.status !== 200) {
        return new Response(null, { status: state.streamReply.status })
      }

      let controller!: ReadableStreamDefaultController<Uint8Array>
      const body = new ReadableStream<Uint8Array>({
        start: (started) => {
          controller = started
        },
      })
      const stream: FakeStream = {
        url,
        headers,
        signal,
        push: (text) => controller.enqueue(encoder.encode(text)),
        end: () => controller.close(),
        get aborted() {
          return signal.aborted
        },
      }

      signal.addEventListener('abort', () =>
        controller.error(new DOMException('Aborted', 'AbortError'))
      )
      streams.push(stream)
      return new Response(body, { status: 200 })
    }

    if (url.endsWith('/room/status')) {
      const reply = state.statusReply

      let respond: FakeStatusCall['respond'] = () => {
        throw new Error('Cette requête n’est pas en attente (réponse `hang` attendue).')
      }

      statuses.push({
        headers,
        signal,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        get aborted() {
          return signal.aborted
        },
        respond: (status, body) => respond(status, body),
      })

      if (reply === 'network-error') {
        return networkError()
      }

      if (reply === 'hang') {
        return new Promise<Response>((resolve, reject) => {
          respond = (status, body) => resolve(new Response(JSON.stringify(body ?? {}), { status }))
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      }

      return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
        status: reply.status,
      })
    }

    const ack = /\/room\/commands\/([^/]+)\/result$/.exec(url)

    if (ack) {
      acks.push({ commandId: ack[1] ?? '', body: JSON.parse(String(init.body)) })
      return state.ackReply === 'network-error'
        ? networkError()
        : new Response(null, { status: state.ackReply.status })
    }

    throw new Error(`Appel réseau inattendu : ${url}`)
  })

  return {
    fetchMock,
    streams,
    statuses,
    acks,
    setAckReply: (reply: StreamReply) => (state.ackReply = reply),
    setStreamReply: (reply: StreamReply) => (state.streamReply = reply),
    setStatusReply: (reply: StatusReply) => (state.statusReply = reply),
  }
}
