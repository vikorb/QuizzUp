import type { Clock, TimerHandle } from '../clock'
import { browserClock } from '../clock'
import { createEmitter } from '../emitter'
import type { DmxOutput } from './output'
import { DMX_CHANNELS, MAX_UNIVERSES } from './universe'

/**
 * Protocole navigateur → pont Art-Net local (`game/artnet-bridge`), version 1.
 *
 * 1. Le navigateur ouvre `ws://127.0.0.1:<port>` et envoie un message **texte** JSON
 *    `{"type":"hello","protocol":1,"universe":0}` (le champ `universe` est historique : toujours 0).
 * 2. Le pont répond `{"type":"ack","protocol":1,"bridge":"quizzup-artnet-bridge","version":"…",
 *    "universes":16}`, ou `{"type":"error","code":"…","message":"…"}` puis ferme la connexion.
 *    `universes` (nombre d'univers acceptés) est absent d'un ancien pont : seul l'univers 0 lui
 *    est alors envoyé, les autres sont ignorés et signalés comme problème (`universeCount`).
 * 3. Chaque trame DMX est ensuite un message **binaire** de 515 octets :
 *
 *    | Octet  | Contenu                                         |
 *    | ------ | ----------------------------------------------- |
 *    | 0      | version du protocole (1)                        |
 *    | 1-2    | numéro d'univers interne 0-15, gros-boutiste    |
 *    | 3-514  | canaux 1 à 512 (valeurs 0-255)                  |
 *
 * Un tour de boucle envoie une trame par univers utilisé, l'univers 0 d'abord.
 *
 * Le même format est décodé (et testé octet par octet) dans `game/artnet-bridge/src/protocol.ts`.
 *
 * Version 2 du `hello` : il porte `"version":2` (le format des trames ne change pas) et, si la config
 * de la salle règle une cible, `"artnet":{"target":"192.168.1.50"}` (jamais de port : il reste celui de
 * `--artnet-port` du pont). Le pont applique cette cible (sauf `--target` en ligne de commande,
 * prioritaire) et la renvoie dans l'ack :
 * `"artnet":{"target":"192.168.1.50","port":6454,"source":"room"}` (`source` : `cli`, `room` ou
 * `none`). Un ancien pont ignore ces champs : l'ack n'a pas d'`artnet`, `artnetStatus()` vaut `null`.
 *
 * Découverte des nœuds : l'ack d'un pont qui la gère porte `"features":["poll"]` (absent d'un ancien
 * pont : `features()` vaut `[]`). `poll()` envoie `{"type":"poll"}` ; le pont diffuse un ArtPoll, collecte
 * les réponses ~3 s puis répond `{"type":"nodes","nodes":[{"ip":"192.168.1.50","shortName":"…",
 * "longName":"…","universes":["0.0.1"]}]}` (`universes` facultatif). Une erreur `code:"poll"` (ArtPoll
 * non parti) fait échouer `poll()` (`poll_failed`) sans fermer la connexion.
 *
 * Gel pour le test de perte de signal : l'ack d'un pont qui le gère porte aussi `"hold"` dans
 * `features`. `hold(ms)` envoie `{"type":"hold","ms":15000}` (entier de 1 000 à 15 000 ms, borné aussi
 * ici) ; le pont garde la dernière trame (sans passer au noir), ignore les trames reçues pendant `ms`,
 * puis passe au noir (fin du gel ou déconnexion), et répond `{"type":"held","ms":15000}`. Un refus
 * est une erreur `code:"hold"`, sans fermer la connexion. `release()` envoie `{"type":"release"}` :
 * le gel s'arrête tout de suite (noir). Un ancien pont (sans `hold` dans `features()`) est refusé
 * proprement (`BridgeHoldError` `unsupported`).
 */
export const BRIDGE_PROTOCOL_VERSION = 1
/** Version du `hello` qui porte la cible Art-Net. */
export const BRIDGE_HELLO_VERSION = 2
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

/**
 * Attente maximale de la fin de fermeture (`onclose`). Le pont n'accepte qu'un écran à la fois :
 * se reconnecter avant que l'ancienne socket soit fermée serait refusé (« un autre onglet… »).
 */
export const BRIDGE_CLOSE_TIMEOUT_MS = 1000

/** Capacité annoncée dans l'ack par un pont qui sait chercher les nœuds Art-Net. */
export const BRIDGE_FEATURE_POLL = 'poll'

/** Capacité annoncée dans l'ack par un pont qui sait geler sa sortie (test de perte de signal). */
export const BRIDGE_FEATURE_HOLD = 'hold'

/** Durée d'un gel acceptée par le pont (ms, entier). */
export const BRIDGE_HOLD_LIMITS = { min: 1000, max: 15_000 } as const

/** Attente maximale de la confirmation `held` du pont. */
export const BRIDGE_HOLD_TIMEOUT_MS = 2000

/** Attente maximale de la réponse `nodes` (le pont collecte pendant ~3 s). */
export const BRIDGE_POLL_TIMEOUT_MS = 6000

const WS_OPEN = 1
const WS_CLOSED = 3

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
  /** Cible Art-Net de la salle, envoyée au pont dans le `hello` (absente : le pont garde la sienne). */
  artnet?: ArtnetTargetConfig
  /** Constructeur WebSocket (faux en test) ; `globalThis.WebSocket` par défaut. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- constructeur : PascalCase
  WebSocketImpl?: WebSocketConstructorLike
  clock?: Clock
  openTimeoutMs?: number
  maxBufferedBytes?: number
  maxSkippedFrames?: number
  closeTimeoutMs?: number
  pollTimeoutMs?: number
  holdTimeoutMs?: number
}

export type BridgeOutput = DmxOutput & {
  /**
   * Trames sautées depuis l'ouverture parce que la socket était encore pleine. Un saut isolé
   * n'est pas une erreur (`write` se résout, la trame suivante, plus récente, partira) : une
   * sortie mesurée (`createMeteredOutput`) les compte donc comme envoyées. Trames réellement
   * parties = trames écrites − `skippedFrames()`.
   */
  skippedFrames: () => number
  /** Version annoncée par le pont lors de l'accusé de réception (`null` avant). */
  bridgeVersion: () => string | null
  /** Cible effective annoncée par le pont (`null` avant l'ack, ou pont ancien qui ne l'annonce pas). */
  artnetStatus: () => BridgeArtnetStatus | null
  /** Capacités annoncées par le pont (`poll`…) ; vide avant l'ack ou pour un ancien pont. */
  features: () => string[]
  /**
   * Cherche les nœuds Art-Net du réseau local (~3 s). Un appel pendant une recherche en cours en
   * attend le résultat. Rejette avec une `BridgePollError` : `not_connected` (pont absent ou
   * connexion tombée), `unsupported` (pont sans `poll` dans `features()`), `timeout` (pas de
   * réponse à temps) ou `poll_failed` (le pont n'a pas pu envoyer l'ArtPoll ; la connexion reste
   * ouverte).
   */
  poll: () => Promise<ArtnetNode[]>
  /**
   * Gèle la sortie du pont `ms` ms (1 000 à 15 000) sur la dernière trame, sans noir, puis noir.
   * Rejette avec une `BridgeHoldError` : `invalid_duration`, `not_connected`, `unsupported` (pont
   * sans `hold` dans `features()`), `refused` (le pont refuse : rien à geler, gel déjà actif),
   * `timeout` (pas de confirmation à temps).
   */
  hold: (ms: number) => Promise<void>
  /** Interrompt le gel en cours : le pont passe au noir tout de suite. Sans effet sans gel. */
  release: () => void
}

/** Raison d'un échec de `poll()` (traduite par l'écran de salle, pas de texte français à afficher). */
export type BridgePollErrorCode = 'not_connected' | 'unsupported' | 'timeout' | 'poll_failed'

/**
 * Échec de `poll()` : `code` est stable (traduction côté interface), `message` n'est qu'un détail
 * technique pour les journaux.
 */
export class BridgePollError extends Error {
  readonly code: BridgePollErrorCode

  constructor(code: BridgePollErrorCode, message: string) {
    super(message)
    this.name = 'BridgePollError'
    this.code = code
  }
}

/** Raison d'un échec de `hold()` (traduite par l'écran de salle). */
export type BridgeHoldErrorCode =
  'invalid_duration' | 'not_connected' | 'unsupported' | 'refused' | 'timeout'

export class BridgeHoldError extends Error {
  readonly code: BridgeHoldErrorCode

  constructor(code: BridgeHoldErrorCode, message: string) {
    super(message)
    this.name = 'BridgeHoldError'
    this.code = code
  }
}

/** Nœud Art-Net trouvé par le pont (IP d'un réseau local uniquement). */
export type ArtnetNode = {
  ip: string
  shortName: string
  longName: string
  /** Univers de sortie (`net.sub.uni`) ; absent si le nœud n'en annonce aucun. */
  universes?: string[]
}

/** Cible Art-Net réglée dans la salle (`lighting.artnet` de `rooms.config`). */
export type ArtnetTargetConfig = { target: string }

/** Cible effective annoncée par le pont dans l'ack, et d'où elle vient. */
export type BridgeArtnetStatus = {
  target: string | null
  port: number
  source: 'cli' | 'room' | 'none'
}

const IPV4 = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/

/**
 * Cible acceptée par le pont : IPv4 d'un réseau privé RFC 1918 (10/8, 172.16/12, 192.168/16),
 * link-local (169.254/16) ou boucle locale (127/8). Miroir de `isAllowedArtnetTarget` du pont, qui
 * refuse le reste : une config ne doit pas viser Internet.
 */
export function isLocalArtnetTarget(ip: unknown): ip is string {
  const match = typeof ip === 'string' ? IPV4.exec(ip) : null
  if (!match) {
    return false
  }
  const octets = match.slice(1).map(Number) as [number, number, number, number]
  if (octets.some((octet) => octet > 255)) {
    return false
  }
  const [first, second] = octets
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  )
}

/** Message `hello` (version 2) envoyé au pont à chaque (re)connexion. */
export function buildBridgeHello(artnet?: ArtnetTargetConfig) {
  return {
    type: 'hello',
    protocol: BRIDGE_PROTOCOL_VERSION,
    version: BRIDGE_HELLO_VERSION,
    universe: 0,
    ...(artnet ? { artnet: { target: artnet.target } } : {}),
  }
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
export function encodeBridgeFrame(data: Uint8Array, universeNumber = 0): Uint8Array {
  const frame = new Uint8Array(BRIDGE_FRAME_BYTES)
  frame[0] = BRIDGE_PROTOCOL_VERSION
  frame[1] = (universeNumber >> 8) & 0xff
  frame[2] = universeNumber & 0xff
  frame.set(data.subarray(0, DMX_CHANNELS), BRIDGE_FRAME_HEADER_BYTES)
  return frame
}

type BridgeMessage = {
  type?: unknown
  protocol?: unknown
  version?: unknown
  universes?: unknown
  artnet?: unknown
  features?: unknown
  nodes?: unknown
  ms?: unknown
  code?: unknown
  message?: unknown
}

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

function parseArtnetStatus(input: unknown): BridgeArtnetStatus | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const raw = input as Record<string, unknown>
  const { source } = raw
  if (
    (source !== 'cli' && source !== 'room' && source !== 'none') ||
    typeof raw.port !== 'number'
  ) {
    return null
  }
  return {
    target: typeof raw.target === 'string' ? raw.target : null,
    port: raw.port,
    source,
  }
}

/** Nœuds bien formés d'une réponse `nodes` ; une IP hors réseau local est écartée (jamais proposée). */
function parseNodes(input: unknown): ArtnetNode[] {
  if (!Array.isArray(input)) {
    return []
  }
  const nodes: ArtnetNode[] = []
  for (const raw of input as unknown[]) {
    const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    if (!entry || !isLocalArtnetTarget(entry.ip)) {
      continue
    }
    const universes = Array.isArray(entry.universes)
      ? (entry.universes as unknown[]).filter((value): value is string => typeof value === 'string')
      : []
    nodes.push({
      ip: entry.ip,
      shortName: typeof entry.shortName === 'string' ? entry.shortName : '',
      longName: typeof entry.longName === 'string' ? entry.longName : '',
      ...(universes.length > 0 ? { universes } : {}),
    })
  }
  return nodes
}

const describeClose = (event: { code: number; reason: string }) =>
  event.reason ? `${event.reason} (code ${event.code})` : `code ${event.code}`

/** Code de fermeture du pont quand un autre écran de salle est déjà connecté. */
const BUSY_CLOSE_CODE = 4004
const BUSY_MESSAGE = 'un autre onglet est déjà connecté au pont'

const describeBridgeError = (message: BridgeMessage) =>
  message.code === 'busy'
    ? `Pont Art-Net : ${BUSY_MESSAGE}`
    : `Pont Art-Net : ${String(message.message ?? 'erreur')}`

/**
 * Sortie DMX vers le pont Art-Net local, par WebSocket. Le pont convertit chaque trame en
 * paquets ArtDMX (UDP) : c'est le seul moyen d'atteindre un nœud Art-Net depuis un navigateur.
 */
export function createBridgeOutput(options: BridgeOutputOptions): BridgeOutput {
  const clock = options.clock ?? browserClock
  const openTimeoutMs = options.openTimeoutMs ?? BRIDGE_OPEN_TIMEOUT_MS
  const maxBufferedBytes = options.maxBufferedBytes ?? BRIDGE_MAX_BUFFERED_BYTES
  const maxSkippedFrames = options.maxSkippedFrames ?? BRIDGE_MAX_SKIPPED_FRAMES
  const closeTimeoutMs = options.closeTimeoutMs ?? BRIDGE_CLOSE_TIMEOUT_MS
  const pollTimeoutMs = options.pollTimeoutMs ?? BRIDGE_POLL_TIMEOUT_MS
  const holdTimeoutMs = options.holdTimeoutMs ?? BRIDGE_HOLD_TIMEOUT_MS
  const disconnectEmitter = createEmitter<unknown>()

  let socket: WebSocketLike | null = null
  let ready = false
  let skipped = 0
  let skippedInARow = 0
  /** Le tour courant est sauté : ses univers suivants le sont aussi (cohérence d'un même tour). */
  let skippingRound = false
  let version: string | null = null
  /** Univers que le pont dit gérer (`ack`) ; un ancien pont n'en dit rien : 1 seul (l'univers 0). */
  let capacity: number | null = null
  let artnet: BridgeArtnetStatus | null = null
  let features: string[] = []
  /** Recherche de nœuds en cours : les appels concurrents à `poll()` en partagent le résultat. */
  let pendingPoll: {
    promise: Promise<ArtnetNode[]>
    resolve: (nodes: ArtnetNode[]) => void
    reject: (error: Error) => void
  } | null = null

  const failPoll = (error: Error) => {
    pendingPoll?.reject(
      error instanceof BridgePollError ? error : new BridgePollError('not_connected', error.message)
    )
  }

  /** Gel demandé, en attente de la confirmation `held` du pont. */
  let pendingHold: {
    resolve: () => void
    reject: (error: Error) => void
  } | null = null

  const failHold = (error: Error) => {
    pendingHold?.reject(
      error instanceof BridgeHoldError ? error : new BridgeHoldError('not_connected', error.message)
    )
  }

  /** Fermeture en cours (volontaire ou après une coupure) : une réouverture l'attend. */
  let closing: Promise<void> | null = null

  const detach = (target: WebSocketLike) => {
    Object.assign(target, { onopen: null, onmessage: null, onclose: null, onerror: null })
  }

  /**
   * Ferme la socket et attend `onclose`, au plus `closeTimeoutMs` : tant que le pont n'a pas vu
   * la fermeture, il refuserait une nouvelle connexion. Ne rejette jamais.
   */
  const shutdown = (target: WebSocketLike, code?: number, reason?: string) => {
    detach(target)
    const done = new Promise<void>((resolve) => {
      let timer: TimerHandle | null = null
      const finish = () => {
        if (timer !== null) {
          clock.clearTimeout(timer)
          timer = null
        }
        Object.assign(target, { onclose: null })
        resolve()
      }
      Object.assign(target, { onclose: finish })
      try {
        target.close(code, reason)
      } catch {
        // Socket déjà fermée.
        finish()
        return
      }
      if (target.readyState === WS_CLOSED) {
        finish()
        return
      }
      timer = clock.setTimeout(finish, closeTimeoutMs)
    })
    const tracked = done.then(() => {
      if (closing === tracked) {
        closing = null
      }
    })
    closing = tracked
    return tracked
  }

  const drop = (error: Error) => {
    const current = socket
    socket = null
    ready = false
    failPoll(error)
    failHold(error)
    if (current) {
      void shutdown(current)
    }
    disconnectEmitter.emit(error)
  }

  const connect = (url: string, webSocketImpl: WebSocketConstructorLike) =>
    new Promise<void>((resolve, reject) => {
      let settled = false
      let target: WebSocketLike
      try {
        target = new webSocketImpl(url)
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      socket = target
      ready = false
      skipped = 0
      skippedInARow = 0
      skippingRound = false
      version = null
      artnet = null
      features = []
      target.binaryType = 'arraybuffer'

      const fail = (message: string) => {
        if (settled) {
          return
        }
        settled = true
        clock.clearTimeout(timeout)
        if (socket === target) {
          socket = null
        }
        // Fermeture suivie : une nouvelle tentative attendra que le pont l'ait vue.
        void shutdown(target)
        reject(new Error(message))
      }

      const timeout = clock.setTimeout(
        () => fail(`Pont Art-Net injoignable sur ${url} (aucune réponse en ${openTimeoutMs} ms)`),
        openTimeoutMs
      )

      target.onopen = () => {
        target.send(JSON.stringify(buildBridgeHello(options.artnet)))
      }
      target.onerror = () => {
        // Le détail arrive avec `onclose` ; avant l'accusé de réception, c'est un échec d'ouverture.
        if (!settled) {
          fail(`Pont Art-Net injoignable sur ${url} : est-il lancé sur ce PC ?`)
        }
      }
      target.onclose = (event) => {
        if (!settled) {
          fail(
            event.code === BUSY_CLOSE_CODE
              ? `Pont Art-Net : ${BUSY_MESSAGE}`
              : `Pont Art-Net : connexion refusée (${describeClose(event)})`
          )
          return
        }
        if (socket === target) {
          drop(new Error(`Pont Art-Net déconnecté (${describeClose(event)})`))
        }
      }
      target.onmessage = (event) => {
        const message = parseMessage(event.data)
        if (settled) {
          if (message?.type === 'error' && message.code === 'hold' && socket === target) {
            // Gel refusé : la connexion reste valable (les trames DMX continuent).
            failHold(new BridgeHoldError('refused', describeBridgeError(message)))
          } else if (message?.type === 'held' && socket === target) {
            pendingHold?.resolve()
          } else if (message?.type === 'error' && message.code === 'poll' && socket === target) {
            // ArtPoll non parti : la connexion reste valable (les trames DMX continuent).
            failPoll(new BridgePollError('poll_failed', describeBridgeError(message)))
          } else if (message?.type === 'error' && socket === target) {
            drop(new Error(describeBridgeError(message)))
          } else if (message?.type === 'nodes' && socket === target) {
            pendingPoll?.resolve(parseNodes(message.nodes))
          }
          return
        }
        if (message?.type === 'error') {
          fail(describeBridgeError(message))
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
        artnet = parseArtnetStatus(message.artnet)
        features = Array.isArray(message.features)
          ? (message.features as unknown[]).filter(
              (name): name is string => typeof name === 'string'
            )
          : []
        capacity =
          typeof message.universes === 'number' && Number.isInteger(message.universes)
            ? Math.min(MAX_UNIVERSES, Math.max(1, message.universes))
            : 1
        ready = true
        resolve()
      }
    })

  return {
    driver: 'artnet-bridge',
    universeCount: () => capacity ?? MAX_UNIVERSES,
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

      // Ancienne socket pas encore fermée : le pont refuserait la connexion, on attend d'abord.
      const pending = closing
      return pending ? pending.then(() => connect(url, WebSocketImpl)) : connect(url, WebSocketImpl)
    },
    async write(data, universe = 0) {
      const current = socket
      if (!ready || !current || current.readyState !== WS_OPEN) {
        throw new Error('Pont Art-Net non connecté')
      }
      if (!Number.isInteger(universe) || universe < 0 || universe >= MAX_UNIVERSES) {
        throw new Error(`Univers invalide pour le pont Art-Net : ${String(universe)}`)
      }
      // Ancien pont (univers 0 seulement) : les autres univers ne partent pas, sinon il fermerait
      // la connexion ; ils sont signalés dans les problèmes du contrôleur.
      if (universe >= (capacity ?? MAX_UNIVERSES)) {
        return
      }
      // La saturation se juge sur l'univers 0, écrit en premier à chaque tour.
      if (universe === 0) {
        skippingRound = current.bufferedAmount > maxBufferedBytes
        if (skippingRound) {
          skipped += 1
          skippedInARow += 1
        } else {
          skippedInARow = 0
        }
      }
      if (skippingRound) {
        // Socket encore pleine : on saute ce tour, le suivant (plus récent) le remplacera.
        if (skippedInARow >= maxSkippedFrames) {
          const error = new Error('Pont Art-Net saturé : les trames ne partent plus')
          drop(error)
          throw error
        }
        return
      }
      current.send(encodeBridgeFrame(data, universe))
    },
    async close() {
      const current = socket
      socket = null
      ready = false
      failPoll(new Error('Pont Art-Net fermé'))
      failHold(new Error('Pont Art-Net fermé'))
      if (current) {
        await shutdown(current, 1000, 'Fermeture par l’écran de salle')
      } else if (closing) {
        await closing
      }
    },
    onDisconnect: disconnectEmitter.on,
    skippedFrames: () => skipped,
    bridgeVersion: () => version,
    artnetStatus: () => artnet,
    features: () => [...features],
    hold(ms) {
      if (!Number.isInteger(ms) || ms < BRIDGE_HOLD_LIMITS.min || ms > BRIDGE_HOLD_LIMITS.max) {
        return Promise.reject(
          new BridgeHoldError(
            'invalid_duration',
            `Durée de gel refusée : ${ms} ms (entier de ${BRIDGE_HOLD_LIMITS.min} à ${BRIDGE_HOLD_LIMITS.max})`
          )
        )
      }
      const current = socket
      if (!ready || !current || current.readyState !== WS_OPEN) {
        return Promise.reject(new BridgeHoldError('not_connected', 'Pont Art-Net non connecté'))
      }
      if (!features.includes(BRIDGE_FEATURE_HOLD)) {
        return Promise.reject(
          new BridgeHoldError('unsupported', 'Ce pont est trop ancien pour geler la sortie')
        )
      }
      if (pendingHold) {
        return Promise.reject(new BridgeHoldError('refused', 'Un gel est déjà en attente'))
      }
      return new Promise<void>((resolve, reject) => {
        const timer = clock.setTimeout(
          () =>
            entry.reject(
              new BridgeHoldError(
                'timeout',
                `Le pont n'a pas confirmé le gel en ${holdTimeoutMs} ms`
              )
            ),
          holdTimeoutMs
        )
        const settle = () => {
          clock.clearTimeout(timer)
          pendingHold = null
        }
        const entry = {
          resolve: () => {
            settle()
            resolve()
          },
          reject: (error: Error) => {
            settle()
            reject(error)
          },
        }
        pendingHold = entry
        try {
          current.send(JSON.stringify({ type: 'hold', ms }))
        } catch (error) {
          entry.reject(
            new BridgeHoldError(
              'not_connected',
              error instanceof Error ? error.message : String(error)
            )
          )
        }
      })
    },
    release() {
      const current = socket
      if (
        ready &&
        current &&
        current.readyState === WS_OPEN &&
        features.includes(BRIDGE_FEATURE_HOLD)
      ) {
        try {
          current.send(JSON.stringify({ type: 'release' }))
        } catch {
          // Connexion tombée : le pont passe de toute façon au noir à la déconnexion.
        }
      }
    },
    poll() {
      if (pendingPoll) {
        return pendingPoll.promise
      }
      const current = socket
      if (!ready || !current || current.readyState !== WS_OPEN) {
        return Promise.reject(new BridgePollError('not_connected', 'Pont Art-Net non connecté'))
      }
      if (!features.includes(BRIDGE_FEATURE_POLL)) {
        return Promise.reject(
          new BridgePollError('unsupported', 'Ce pont est trop ancien pour chercher les nœuds')
        )
      }
      let resolve!: (nodes: ArtnetNode[]) => void
      let reject!: (error: Error) => void
      const promise = new Promise<ArtnetNode[]>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
      })
      const timer = clock.setTimeout(
        () =>
          entry.reject(
            new BridgePollError(
              'timeout',
              `Le pont n'a pas répondu à la recherche en ${pollTimeoutMs} ms`
            )
          ),
        pollTimeoutMs
      )
      const settle = () => {
        clock.clearTimeout(timer)
        pendingPoll = null
      }
      const entry = {
        promise,
        resolve: (nodes: ArtnetNode[]) => {
          settle()
          resolve(nodes)
        },
        reject: (error: Error) => {
          settle()
          reject(error)
        },
      }
      pendingPoll = entry
      try {
        current.send(JSON.stringify({ type: 'poll' }))
      } catch (error) {
        entry.reject(
          new BridgePollError('poll_failed', error instanceof Error ? error.message : String(error))
        )
      }
      return promise
    },
  }
}
