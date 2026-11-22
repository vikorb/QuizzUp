import { createSseParser, type SseMessage } from '@quizzup/shared'

export type SseClient = {
  status: number
  headers: Headers
  /** Tout le texte reçu, commentaires (`: ping`) compris. */
  raw: () => string
  /** Prochain événement complet ; rejette si le flux s'est fermé sans en avoir d'autre. */
  next: () => Promise<SseMessage>
  /** Résolu quand le serveur (ou `abort`) a fermé le flux. */
  closed: Promise<void>
  abort: () => void
}

/** Ouvre un flux SSE avec `fetch` et le lit avec `createSseParser`, comme le feront les clients. */
export async function openSse(url: string, headers: Record<string, string>): Promise<SseClient> {
  const controller = new AbortController()
  const response = await fetch(url, { headers, signal: controller.signal })
  const queue: SseMessage[] = []
  const waiting: Array<() => void> = []
  let text = ''
  let ended = false

  const wake = () => waiting.splice(0).forEach((resolve) => resolve())
  const parse = createSseParser((message) => {
    queue.push(message)
    wake()
  })

  const closed = (async () => {
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    try {
      while (reader) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        const chunk = decoder.decode(value, { stream: true })

        text += chunk
        parse(chunk)
      }
    } catch {
      // Flux coupé par `abort()` ou par le serveur.
    } finally {
      ended = true
      wake()
    }
  })()

  return {
    status: response.status,
    headers: response.headers,
    raw: () => text,
    next: async () => {
      while (queue.length === 0) {
        if (ended) {
          throw new Error('stream closed before the next event')
        }

        await new Promise<void>((resolve) => waiting.push(resolve))
      }

      return queue.shift() as SseMessage
    },
    closed,
    abort: () => controller.abort(),
  }
}
