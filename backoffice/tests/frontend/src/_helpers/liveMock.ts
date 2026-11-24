import { LIVE_EVENT, ROOM_PRESENCE, type RoomLive } from '@quizzup/shared'

export function createRoomLive(overrides: Partial<RoomLive> = {}): RoomLive {
  return {
    roomId: 10,
    presence: ROOM_PRESENCE.ONLINE,
    controllable: true,
    lastSeenAt: '2026-11-23T10:00:00.000Z',
    status: null,
    ...overrides,
  }
}

/** Texte d'un événement `text/event-stream`. */
export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function snapshotEvent(rooms: RoomLive[]): string {
  return sseEvent(LIVE_EVENT.SNAPSHOT, { rooms })
}

export function roomStatusEvent(room: RoomLive): string {
  return sseEvent(LIVE_EVENT.ROOM_STATUS, room)
}

/** Réponse `text/event-stream` pilotée par le test : `push` envoie du texte, `end` ferme le flux. */
export function createLiveStream() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const state = { cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
    },
    cancel() {
      state.cancelled = true
    },
  })

  return {
    response: new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
    /** Envoie du texte, ou des octets bruts (pour couper un caractère multi-octets). */
    push(chunk: string | Uint8Array): void {
      // Une connexion abandonnée par le lecteur n'écoute plus rien.
      if (!state.cancelled) {
        controller?.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      }
    },
    end(): void {
      if (!state.cancelled) {
        controller?.close()
      }
    },
    /** Vrai quand le lecteur a abandonné le flux (arrêt, coupure détectée). */
    get cancelled(): boolean {
      return state.cancelled
    },
  }
}

export function jsonErrorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Promesse que le test résout lui-même, pour garder une réponse en attente. */
export function createDeferred<T>() {
  const deferred = { resolve: (_value: T) => undefined } as {
    promise: Promise<T>
    resolve: (value: T) => void
  }

  deferred.promise = new Promise<T>((resolve) => {
    deferred.resolve = resolve
  })

  return deferred
}
