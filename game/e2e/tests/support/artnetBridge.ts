import { createSocket } from 'node:dgram'
import { createServer } from 'node:net'

import { ARTDMX_HEADER_BYTES } from '../../../artnet-bridge/src/artnet.js'
import { buildOutputPlan, defaultMappings } from '../../../artnet-bridge/src/mapping.js'
import { type BridgeServer, createBridgeServer } from '../../../artnet-bridge/src/server.js'
import { ROOM_APP_URL } from './urls'

/**
 * Le **vrai** pont Art-Net (`game/artnet-bridge/src/server.ts`) lancé dans le processus de test,
 * avec un faux nœud Art-Net (socket UDP sur la boucle locale) pour lire ce qui sort sur le réseau.
 * Le pont n'a aucune dépendance : ses sources sont importées telles quelles, sans installation.
 */
export type FakeNode = {
  port: number
  /** Paquets ArtDMX reçus, dans l'ordre. */
  packets: Buffer[]
  close: () => Promise<void>
}

export type RunningBridge = {
  /** Port WebSocket du pont (`ws://127.0.0.1:<port>`). */
  port: number
  url: string
  /** Vrai tant qu'un écran de salle est connecté (le pont n'en accepte qu'un). */
  hasClient: () => boolean
  stop: () => Promise<void>
}

/** Canaux DMX d'un paquet ArtDMX (sans l'en-tête de 18 octets). */
export const dmxData = (packet: Buffer) => packet.subarray(ARTDMX_HEADER_BYTES)
export const isBlackPacket = (packet: Buffer) => dmxData(packet).every((value) => value === 0)

export function startFakeNode(): Promise<FakeNode> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4')
    const packets: Buffer[] = []
    socket.on('message', (message) => packets.push(message))
    socket.bind(0, '127.0.0.1', () => {
      resolve({
        port: socket.address().port,
        packets,
        close: () => new Promise<void>((done) => socket.close(() => done())),
      })
    })
  })
}

/** Port libre sur la boucle locale (pour lancer le pont plus tard, à une adresse connue). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

/** Lance le pont, qui n'accepte que l'origine de l'écran de salle ; `port` 0 = port libre. */
export async function startBridge(node: FakeNode, port = 0): Promise<RunningBridge> {
  const bridge: BridgeServer = createBridgeServer({
    port,
    origins: [ROOM_APP_URL],
    plan: buildOutputPlan(defaultMappings()),
    target: '127.0.0.1',
    artnetPort: node.port,
    bind: '127.0.0.1',
    version: 'e2e',
    log: () => undefined,
  })
  const listening = await bridge.listen()
  return {
    port: listening,
    url: `ws://127.0.0.1:${listening}`,
    hasClient: () => bridge.hasClient(),
    stop: () => bridge.close(),
  }
}
