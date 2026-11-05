import { createSocket } from 'node:dgram'
import type { IncomingMessage, Server } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'

import type { ArtNode, PortAddress } from './artnet.js'
import { ARTNET_PORT, decodeArtPollReply, encodeArtPoll, formatPortAddress } from './artnet.js'
import type { BridgeCore } from './bridge.js'
import { createBridgeCore } from './bridge.js'
import type { Clock, TimerHandle } from './clock.js'
import { systemClock } from './clock.js'
import type { OutputPlan } from './mapping.js'
import { describePlan } from './mapping.js'
import {
  ackMessage,
  type ArtnetAck,
  BRIDGE_FRAME_BYTES,
  BRIDGE_PROTOCOL_VERSION,
  BUSY_MESSAGE,
  checkArtnetRequest,
  CLOSE_CODES,
  decodeFrame,
  errorMessage,
  isAllowedArtnetTarget,
  isInternalUniverse,
  isPollMessage,
  MAX_INTERNAL_UNIVERSES,
  nodesMessage,
  parseHello,
  POLL_MAX_NODES,
  POLL_MIN_INTERVAL_MS,
  POLL_WINDOW_MS,
} from './protocol.js'
import type { WsConnection } from './websocket.js'
import { acceptUpgrade, rejectUpgrade } from './websocket.js'

/** Le pont n'écoute **que** sur la boucle locale : rien n'est joignable depuis le réseau. */
export const LISTEN_HOST = '127.0.0.1'

/** Délai laissé au navigateur pour se présenter (`hello`) après la connexion. */
export const HELLO_TIMEOUT_MS = 2000

/** Attente maximale des derniers envois UDP (trames à zéro) à l'arrêt. */
const SHUTDOWN_FLUSH_MS = 200

/** Trames à zéro envoyées à l'ancienne cible quand la cible change (l'UDP n'est pas garanti). */
const BLACKOUT_FRAMES_ON_SWITCH = 3

export type BridgeServerOptions = {
  /** Port d'écoute WebSocket sur 127.0.0.1 (0 = choisi par le système, pour les tests). */
  port: number
  /** Origines autorisées, normalisées (`https://salle.quizzup.fr`). */
  origins: readonly string[]
  plan: OutputPlan
  /**
   * IP du nœud Art-Net (unicast) ou de diffusion (ex. 192.168.1.255), donnée en ligne de commande :
   * elle est alors prioritaire. Absente, la cible vient de l'écran de salle (`hello` v2).
   */
  target?: string
  artnetPort?: number
  /** IP locale d'où partent les paquets (PC à plusieurs cartes réseau). */
  bind?: string
  silenceTimeoutMs?: number
  blackoutMs?: number
  /**
   * Adresse où est envoyé l'ArtPoll de la découverte (255.255.255.255 par défaut, ou une adresse de
   * diffusion locale comme 192.168.1.255). Le port est celui de `artnetPort`.
   */
  pollBroadcast?: string
  clock?: Clock
  log?: (message: string) => void
  version: string
}

/** Diffusion générale : seule adresse hors des plages locales acceptée pour `pollBroadcast`. */
export const LIMITED_BROADCAST = '255.255.255.255'

export type BridgeServer = {
  listen: () => Promise<number>
  close: () => Promise<void>
  core: BridgeCore
  hasClient: () => boolean
}

/** Origine normalisée (`URL.origin`), ou `null` si ce n'est pas une origine http(s) valide. */
export function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

/**
 * Valeurs acceptées pour l'en-tête `Host` (protection contre le « DNS rebinding »). Le navigateur
 * omet le port quand c'est celui par défaut de `ws://` (80) : on accepte alors l'hôte seul.
 */
export function allowedHostHeaders(port: number): Set<string> {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  if (port === 80) {
    hosts.add('127.0.0.1')
    hosts.add('localhost')
  }
  return hosts
}

export function createBridgeServer(options: BridgeServerOptions): BridgeServer {
  const clock = options.clock ?? systemClock
  const log = options.log ?? (() => undefined)
  // Le port est toujours celui de `--artnet-port` : l'écran de salle ne le choisit jamais.
  const artnetPort = options.artnetPort ?? ARTNET_PORT
  const targetFromCli = options.target !== undefined
  let target: string | null = options.target ?? null
  let warnedNoTarget = false
  const origins = new Set(options.origins)
  const udp = createSocket({ type: 'udp4', reuseAddr: false })
  let pendingSends = 0
  let lastUdpError: string | null = null

  let closed = false

  const transmit = (packet: Buffer, address: PortAddress) => {
    if (closed) {
      return
    }
    if (target === null) {
      if (!warnedNoTarget) {
        warnedNoTarget = true
        log('Aucune cible Art-Net : rien n’est envoyé (IP du nœud à régler dans l’écran Matériel)')
      }
      return
    }
    pendingSends += 1
    const destination = target
    udp.send(packet, artnetPort, destination, (error) => {
      pendingSends -= 1
      if (error) {
        const code = (error as NodeJS.ErrnoException).code ?? error.message
        if (code !== lastUdpError) {
          lastUdpError = code
          log(
            `Envoi Art-Net impossible vers ${destination} (univers ${formatPortAddress(address)}) : ${code}. ` +
              'Câble réseau, IP du PC ou IP du nœud ?'
          )
        }
      } else if (lastUdpError !== null) {
        lastUdpError = null
        log('Envoi Art-Net rétabli')
      }
    })
  }

  const core = createBridgeCore({
    plan: options.plan,
    transmit,
    clock,
    silenceTimeoutMs: options.silenceTimeoutMs,
    blackoutMs: options.blackoutMs,
    log,
  })

  const describeTarget = () =>
    target === null
      ? 'aucune'
      : `${target}:${artnetPort} (${targetFromCli ? 'ligne de commande' : 'écran de salle'})`
  /**
   * Change la cible reçue de l'écran de salle. L'UDP n'est pas garanti et un nœud garde sa dernière
   * valeur (fumée comprise) : avant de quitter l'ancienne cible, on lui envoie 3 trames à zéro.
   */
  const switchTarget = (next: string | null) => {
    if (next === target) {
      return
    }
    if (target !== null) {
      for (let count = 0; count < BLACKOUT_FRAMES_ON_SWITCH; count += 1) {
        core.sendBlackout()
      }
    }
    target = next
    warnedNoTarget = false
    log(`Cible Art-Net reçue de l’écran de salle : ${describeTarget()}`)
  }
  const artnetAck = (): ArtnetAck => ({
    target,
    port: artnetPort,
    source: target === null ? 'none' : targetFromCli ? 'cli' : 'room',
  })

  // Découverte : un seul poll à la fois (un second poll pendant le premier attend la même réponse) ;
  // moins d'1 s après la fin du précédent, on renvoie son résultat sans nouvel ArtPoll.
  const pollBroadcast = options.pollBroadcast ?? LIMITED_BROADCAST
  let poll: {
    nodes: Map<string, ArtNode>
    replies: ((nodes: ArtNode[]) => void)[]
    timer: TimerHandle
  } | null = null
  let lastPoll: { endedAt: number; nodes: ArtNode[] } | null = null

  const finishPoll = () => {
    const current = poll
    poll = null
    if (!current) {
      return
    }
    const nodes = [...current.nodes.values()]
    lastPoll = { endedAt: clock.now(), nodes }
    for (const reply of current.replies) {
      reply(nodes)
    }
  }

  const requestPoll = (reply: (nodes: ArtNode[]) => void) => {
    if (poll) {
      poll.replies.push(reply)
      return
    }
    if (lastPoll && clock.now() - lastPoll.endedAt < POLL_MIN_INTERVAL_MS) {
      reply(lastPoll.nodes)
      return
    }
    poll = {
      nodes: new Map(),
      replies: [reply],
      timer: clock.setTimeout(finishPoll, POLL_WINDOW_MS),
    }
    udp.send(encodeArtPoll(), artnetPort, pollBroadcast, (error) => {
      if (error) {
        log(`ArtPoll impossible vers ${pollBroadcast} : ${error.message}`)
      }
    })
  }

  // Réponses d'un ArtPollReply : seuls les nœuds d'une IP locale sont gardés, au plus POLL_MAX_NODES.
  // Les nœuds à plusieurs ports répondent plusieurs fois : une entrée par IP, univers fusionnés.
  udp.on('message', (message) => {
    const node = poll ? decodeArtPollReply(message) : null
    if (!poll || !node || !isAllowedArtnetTarget(node.ip)) {
      return
    }
    const known = poll.nodes.get(node.ip)
    if (known) {
      const universes = [...new Set([...(known.universes ?? []), ...(node.universes ?? [])])]
      poll.nodes.set(node.ip, { ...known, ...(universes.length > 0 ? { universes } : {}) })
    } else if (poll.nodes.size < POLL_MAX_NODES) {
      poll.nodes.set(node.ip, node)
    }
  })

  let server: Server | null = null
  let listeningPort = options.port
  let client: { connection: WsConnection; socket: Duplex } | null = null

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const host = request.headers.host?.toLowerCase()
    if (!host || !allowedHostHeaders(listeningPort).has(host)) {
      // Protection contre le « DNS rebinding » : seul 127.0.0.1 / localhost est accepté.
      log(`Connexion refusée : hôte inattendu « ${host ?? '(absent)'} »`)
      rejectUpgrade(socket, 403, 'Hôte refusé')
      return
    }
    const rawOrigin = request.headers.origin
    const origin = rawOrigin ? normalizeOrigin(rawOrigin) : null
    if (!origin || !origins.has(origin)) {
      log(
        `Connexion refusée : origine « ${rawOrigin ?? '(absente)'} » non autorisée ` +
          `(autorisées : ${[...origins].join(', ')})`
      )
      rejectUpgrade(socket, 403, 'Origine non autorisée')
      return
    }
    const connection = acceptUpgrade(request, socket, head, {
      maxPayload: BRIDGE_FRAME_BYTES,
      setTimeout: clock.setTimeout,
    })
    if (!connection) {
      return
    }
    if (client) {
      // Connexion acceptée puis refusée par message : le navigateur affiche la raison (cf. BUSY_MESSAGE).
      log(`Connexion refusée depuis ${origin} : un écran de salle est déjà connecté`)
      connection.sendText(errorMessage('busy', BUSY_MESSAGE))
      connection.close(CLOSE_CODES.busy, BUSY_MESSAGE)
      return
    }
    const current = { connection, socket }
    client = current
    let ready = false

    const refuse = (code: number, kind: string, message: string) => {
      log(`Écran de salle refusé : ${message}`)
      connection.sendText(errorMessage(kind, message))
      connection.close(code, message)
    }

    let helloTimer: TimerHandle | null = clock.setTimeout(() => {
      helloTimer = null
      refuse(CLOSE_CODES.helloExpected, 'hello', 'aucune présentation reçue')
    }, HELLO_TIMEOUT_MS)

    connection.onMessage((message) => {
      if (!connection.isOpen()) {
        return
      }
      if (!ready) {
        const hello = message.kind === 'text' ? parseHello(message.data) : null
        if (!hello) {
          refuse(CLOSE_CODES.helloExpected, 'hello', 'présentation (hello) attendue en premier')
          return
        }
        if (helloTimer !== null) {
          clock.clearTimeout(helloTimer)
          helloTimer = null
        }
        if (hello.protocol !== BRIDGE_PROTOCOL_VERSION) {
          refuse(
            CLOSE_CODES.protocol,
            'protocol',
            `protocole ${hello.protocol} non géré (pont en protocole ${BRIDGE_PROTOCOL_VERSION})`
          )
          return
        }
        if (!isInternalUniverse(hello.universe)) {
          refuse(
            CLOSE_CODES.universe,
            'universe',
            `univers interne ${hello.universe} non géré (univers 0 à ${MAX_INTERNAL_UNIVERSES - 1})`
          )
          return
        }
        if (!targetFromCli) {
          // La ligne de commande reste prioritaire. Sans elle, la cible est celle de ce hello : un
          // hello v1 ou sans `artnet` l'efface, pour ne jamais émettre vers l'IP d'une salle précédente.
          const requested =
            hello.artnet?.target === undefined ? null : checkArtnetRequest(hello.artnet)
          if (requested && !requested.ok) {
            refuse(CLOSE_CODES.target, 'target', requested.message)
            return
          }
          switchTarget(requested?.target ?? null)
        }
        ready = true
        connection.sendText(ackMessage(options.version, artnetAck()))
        log(`Écran de salle connecté (${origin})`)
        return
      }
      if (message.kind === 'text') {
        if (isPollMessage(message.data)) {
          requestPoll((nodes) => {
            if (connection.isOpen()) {
              connection.sendText(nodesMessage(nodes))
            }
          })
        }
        return
      }
      const frame = decodeFrame(message.data)
      if (!frame.ok) {
        refuse(CLOSE_CODES.badFrame, 'frame', frame.reason)
        return
      }
      if (!isInternalUniverse(frame.universe)) {
        refuse(
          CLOSE_CODES.universe,
          'universe',
          `trame pour l'univers ${frame.universe} (univers 0 à ${MAX_INTERNAL_UNIVERSES - 1})`
        )
        return
      }
      core.frame(frame.data, frame.universe)
    })

    connection.onClose((code) => {
      if (helloTimer !== null) {
        clock.clearTimeout(helloTimer)
        helloTimer = null
      }
      if (client === current) {
        client = null
      }
      if (ready) {
        log(`Écran de salle déconnecté (code ${code})`)
        core.clientDisconnected()
      }
    })
  }

  const waitForSends = () =>
    new Promise<void>((resolve) => {
      const started = Date.now()
      const check = () => {
        if (pendingSends === 0 || Date.now() - started >= SHUTDOWN_FLUSH_MS) {
          resolve()
          return
        }
        setTimeout(check, 5)
      }
      check()
    })

  return {
    core,
    hasClient: () => client !== null,
    async listen() {
      await new Promise<void>((resolve, reject) => {
        udp.once('error', reject)
        udp.bind({ address: options.bind, port: 0 }, () => {
          udp.off('error', reject)
          udp.setBroadcast(true)
          udp.on('error', (error) => log(`Erreur UDP : ${error.message}`))
          resolve()
        })
      })
      const http = createServer((_request, response) => {
        response.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Pont QuizzUp Art-Net actif : connexion WebSocket attendue.\n')
      })
      http.on('upgrade', handleUpgrade)
      http.on('clientError', (_error, socket) => socket.destroy())
      server = http
      await new Promise<void>((resolve, reject) => {
        http.once('error', reject)
        http.listen(options.port, LISTEN_HOST, () => {
          http.off('error', reject)
          resolve()
        })
      })
      listeningPort = (http.address() as AddressInfo).port
      core.start()
      log(`Pont QuizzUp Art-Net ${options.version} : ws://${LISTEN_HOST}:${listeningPort}`)
      log(`Origines autorisées : ${[...origins].join(', ')}`)
      log(
        `Cible Art-Net : ${target === null ? 'à régler dans l’écran de salle' : describeTarget()}`
      )
      for (const line of describePlan(options.plan)) {
        log(`  ${line}`)
      }
      return listeningPort
    },
    async close() {
      if (closed) {
        return
      }
      core.stop()
      if (poll) {
        clock.clearTimeout(poll.timer)
        poll = null
      }
      const current = client
      client = null
      if (current) {
        current.connection.close(1001, 'Arrêt du pont')
        current.socket.destroy()
      }
      await waitForSends()
      closed = true
      await new Promise<void>((resolve) => {
        if (!server) {
          resolve()
          return
        }
        server.close(() => resolve())
        server.closeAllConnections()
      })
      server = null
      await new Promise<void>((resolve) => {
        try {
          udp.close(() => resolve())
        } catch {
          resolve()
        }
      })
    },
  }
}
