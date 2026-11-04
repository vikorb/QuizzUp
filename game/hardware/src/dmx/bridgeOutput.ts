import type { Clock } from '../clock'
import { browserClock } from '../clock'
import { createEmitter } from '../emitter'
import type { DmxOutput } from './output'
import { DMX_CHANNELS } from './universe'

/**
 * Protocole navigateur → pont Art-Net local (`game/artnet-bridge`), version 1.
 *
 * 1. Le navigateur ouvre `ws://127.0.0.1:<port>` et envoie un message **texte** JSON
 *    `{"type":"hello","protocol":1,"universe":0}`.
 * 2. Le pont répond `{"type":"ack","protocol":1,"bridge":"quizzup-artnet-bridge","version":"…"}`,
 *    ou `{"type":"error","code":"…","message":"…"}` puis ferme la connexion.
 * 3. Chaque trame DMX est ensuite un message **binaire** de 515 octets :
 *
 *    | Octet  | Contenu                                         |
 *    | ------ | ----------------------------------------------- |
 *    | 0      | version du protocole (1)                        |
 *    | 1-2    | numéro d'univers interne, gros-boutiste (0)     |
 *    | 3-514  | canaux 1 à 512 (valeurs 0-255)                  |
 *
 * Le même format est décodé (et testé octet par octet) dans `game/artnet-bridge/src/protocol.ts`.
 */
export const BRIDGE_PROTOCOL_VERSION = 1
export const BRIDGE_FRAME_HEADER_BYTES = 3
export const BRIDGE_FRAME_BYTES = BRIDGE_FRAME_HEADER_BYTES + DMX_CHANNELS

/** Port par défaut du pont (`quizzup-artnet-bridge --port`). */
export const DEFAULT_BRIDGE_PORT = 7654
export const DEFAULT_BRIDGE_URL = `ws://127.0.0.1:${DEFAULT_BRIDGE_PORT}`

/** Délai maximal pour joindre le pont et recevoir son accusé de réception. */
export const BRIDGE_OPEN_TIMEOUT_MS = 2000

/**
 * Au-delà de ce volume en attente dans la socket, la trame est sautée : on n'empile jamais de
 * retard (la trame suivante, plus récente, partira à la place). Quatre trames suffisent.
 */
export const BRIDGE_MAX_BUFFERED_BYTES = BRIDGE_FRAME_BYTES * 4

/** Trames sautées d'affilée avant de déclarer le pont saturé (~0,5 s à 30 Hz). */
export const BRIDGE_MAX_SKIPPED_FRAMES = 15

const WS_OPEN = 1

/** Sous-ensemble de l'API `WebSocket` du navigateur utilisé ici (remplacé par un faux en test). */
export type WebSocketLike = {
  readonly readyState: number
  readonly bufferedAmount: number
  binaryType: string
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  send: (data: string | ArrayBufferView | ArrayBuffer) => void
  close: (code?: number, reason?: string) => void
}

export type WebSocketConstructorLike = new (url: string) => WebSocketLike

export type BridgeOutputOptions = {
  /** `ws://127.0.0.1:<port>` ou `ws://localhost:<port>` (cf. `parseBridgeUrl`). */
  url: string
  /** Univers interne annoncé au pont (0 par défaut ; le pont v1 ne traite que celui-ci). */
  universe?: number
  /** Constructeur WebSocket (faux en test) ; `globalThis.WebSocket` par défaut. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- constructeur : PascalCase
  WebSocketImpl?: WebSocketConstructorLike
  clock?: Clock
  openTimeoutMs?: number
  maxBufferedBytes?: number
  maxSkippedFrames?: number
}

export type BridgeOutput = DmxOutput & {
  /** Trames sautées depuis l'ouverture parce que la socket était encore pleine. */
  skippedFrames: () => number
  /** Version annoncée par le pont lors de l'accusé de réception (`null` avant). */
  bridgeVersion: () => string | null
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])

/**
 * Valide l'adresse du pont : `ws://` uniquement, vers la machine elle-même (127.0.0.1 ou
 * localhost), port 1-65535, sans identifiants. Renvoie l'URL normalisée ou `null`.
 */
export function parseBridgeUrl(input: unknown): string | null {
  if (typeof input !== 'string' || !input.startsWith('ws://')) {
    return null
  }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (!LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password) {
    return null
  }
  const port = url.port === '' ? 80 : Number(url.port)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return null
  }
  return `ws://${url.hostname}:${port}${url.pathname === '/' ? '' : url.pathname}`
}

/** Encode une trame binaire du protocole (cf. tableau ci-dessus). */
export function encodeBridgeFrame(universe: Uint8Array, universeNumber = 0): Uint8Array {
  const frame = new Uint8Array(BRIDGE_FRAME_BYTES)
  frame[0] = BRIDGE_PROTOCOL_VERSION
  frame[1] = (universeNumber >> 8) & 0xff
  frame[2] = universeNumber & 0xff
  frame.set(universe.subarray(0, DMX_CHANNELS), BRIDGE_FRAME_HEADER_BYTES)
  return frame
}

type BridgeMessage = { type?: unknown; protocol?: unknown; version?: unknown; message?: unknown }

function parseMessage(data: unknown): BridgeMessage | null {
  if (typeof data !== 'string') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(data)
    return parsed && typeof parsed === 'object' ? (parsed as BridgeMessage) : null
  } catch {
    return null
  }
}

const describeClose = (event: { code: number; reason: string }) =>
  event.reason ? `${event.reason} (code ${event.code})` : `code ${event.code}`

/**
 * Sortie DMX vers le pont Art-Net local, par WebSocket. Le pont convertit chaque trame en
 * paquets ArtDMX (UDP) : c'est le seul moyen d'atteindre un nœud Art-Net depuis un navigateur.
 */
export function createBridgeOutput(options: BridgeOutputOptions): BridgeOutput {
  const universeNumber = options.universe ?? 0
  if (!Number.isInteger(universeNumber) || universeNumber < 0 || universeNumber > 0xff_ff) {
    throw new Error(`Univers invalide pour le pont Art-Net : ${String(options.universe)}`)
  }
  const clock = options.clock ?? browserClock
  const openTimeoutMs = options.openTimeoutMs ?? BRIDGE_OPEN_TIMEOUT_MS
  const maxBufferedBytes = options.maxBufferedBytes ?? BRIDGE_MAX_BUFFERED_BYTES
  const maxSkippedFrames = options.maxSkippedFrames ?? BRIDGE_MAX_SKIPPED_FRAMES
  const disconnectEmitter = createEmitter<unknown>()

  let socket: WebSocketLike | null = null
  let ready = false
  let skipped = 0
  let skippedInARow = 0
  let version: string | null = null

  const detach = (target: WebSocketLike) => {
    Object.assign(target, { onopen: null, onmessage: null, onclose: null, onerror: null })
  }

  const drop = (error: Error) => {
    const current = socket
    socket = null
    ready = false
    if (current) {
      detach(current)
      try {
        current.close()
      } catch {
        // Socket déjà fermée.
      }
    }
    disconnectEmitter.emit(error)
  }

  return {
    driver: 'artnet-bridge',
    open() {
      const url = parseBridgeUrl(options.url)
      if (!url) {
        return Promise.reject(
          new Error(`Adresse du pont Art-Net refusée : ${options.url} (ws://127.0.0.1:<port>)`)
        )
      }
      const WebSocketImpl =
        options.WebSocketImpl ??
        (Reflect.get(globalThis, 'WebSocket') as WebSocketConstructorLike | undefined) ??
        null
      if (!WebSocketImpl) {
        return Promise.reject(new Error('WebSocket indisponible dans ce navigateur'))
      }

      return new Promise<void>((resolve, reject) => {
        let settled = false
        let target: WebSocketLike
        try {
          target = new WebSocketImpl(url)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
          return
        }
        socket = target
        ready = false
        skipped = 0
        skippedInARow = 0
        version = null
        target.binaryType = 'arraybuffer'

        const fail = (message: string) => {
          if (settled) {
            return
          }
          settled = true
          clock.clearTimeout(timeout)
          detach(target)
          if (socket === target) {
            socket = null
          }
          try {
            target.close()
          } catch {
            // Socket jamais ouverte.
          }
          reject(new Error(message))
        }

        const timeout = clock.setTimeout(
          () => fail(`Pont Art-Net injoignable sur ${url} (aucune réponse en ${openTimeoutMs} ms)`),
          openTimeoutMs
        )

        target.onopen = () => {
          target.send(
            JSON.stringify({
              type: 'hello',
              protocol: BRIDGE_PROTOCOL_VERSION,
              universe: universeNumber,
            })
          )
        }
        target.onerror = () => {
          // Le détail arrive avec `onclose` ; avant l'accusé de réception, c'est un échec d'ouverture.
          if (!settled) {
            fail(`Pont Art-Net injoignable sur ${url} : est-il lancé sur ce PC ?`)
          }
        }
        target.onclose = (event) => {
          if (!settled) {
            fail(`Pont Art-Net : connexion refusée (${describeClose(event)})`)
            return
          }
          if (socket === target) {
            drop(new Error(`Pont Art-Net déconnecté (${describeClose(event)})`))
          }
        }
        target.onmessage = (event) => {
          const message = parseMessage(event.data)
          if (settled) {
            if (message?.type === 'error' && socket === target) {
              drop(new Error(`Pont Art-Net : ${String(message.message ?? 'erreur')}`))
            }
            return
          }
          if (message?.type === 'error') {
            fail(`Pont Art-Net : ${String(message.message ?? 'erreur')}`)
            return
          }
          if (message?.type !== 'ack') {
            fail('Ce service ne parle pas le protocole du pont QuizzUp')
            return
          }
          if (message.protocol !== BRIDGE_PROTOCOL_VERSION) {
            fail(
              `Pont Art-Net incompatible : protocole ${String(message.protocol)}, ` +
                `attendu ${BRIDGE_PROTOCOL_VERSION} (mettez le pont à jour)`
            )
            return
          }
          settled = true
          clock.clearTimeout(timeout)
          version = typeof message.version === 'string' ? message.version : null
          ready = true
          resolve()
        }
      })
    },
    async write(universe) {
      const current = socket
      if (!ready || !current || current.readyState !== WS_OPEN) {
        throw new Error('Pont Art-Net non connecté')
      }
      if (current.bufferedAmount > maxBufferedBytes) {
        // Socket encore pleine : on saute cette trame, la suivante (plus récente) la remplacera.
        skipped += 1
        skippedInARow += 1
        if (skippedInARow >= maxSkippedFrames) {
          const error = new Error('Pont Art-Net saturé : les trames ne partent plus')
          drop(error)
          throw error
        }
        return
      }
      skippedInARow = 0
      current.send(encodeBridgeFrame(universe, universeNumber))
    },
    async close() {
      const current = socket
      socket = null
      ready = false
      if (current) {
        detach(current)
        try {
          current.close(1000, 'Fermeture par l’écran de salle')
        } catch {
          // Socket déjà fermée.
        }
      }
    },
    onDisconnect: disconnectEmitter.on,
    skippedFrames: () => skipped,
    bridgeVersion: () => version,
  }
}
