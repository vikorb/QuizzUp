import { createSocket } from 'node:dgram'
import { Socket } from 'node:net'

import { encodeArtPoll } from '@bridge/artnet'
import { buildOutputPlan, defaultMappings } from '@bridge/mapping'
import {
  isAllowedArtnetTarget,
  POLL_MAX_NODES,
  POLL_MAX_PACKETS,
  POLL_MAX_UNIVERSES,
  POLL_MIN_INTERVAL_MS,
  POLL_WINDOW_MS,
} from '@bridge/protocol'
import type { BridgeServer } from '@bridge/server'
import { createBridgeServer } from '@bridge/server'

import { buildPollReply, type PollReplyFields } from './_helpers/artPollReply'
import { createManualClock, type ManualClock } from './_helpers/manualClock'
import type { RawClient, UdpReceiver, UdpReceiverOptions } from './_helpers/rawClient'
import { OPCODE, openRawClient, openUdpReceiver } from './_helpers/rawClient'

const ORIGIN = 'https://salle.quizzup.fr'
const HELLO = JSON.stringify({ type: 'hello', protocol: 1, version: 2, universe: 0 })
const POLL = JSON.stringify({ type: 'poll' })
/** Seconde adresse de la boucle locale : le faux nœud y écoute pour que le pont puisse écouter 0.0.0.0. */
const NODE_ADDRESS = '127.0.0.2'
const isLinux = process.platform === 'linux'

let receiver: UdpReceiver
let bridge: BridgeServer
let port: number
let clock: ManualClock
let clients: RawClient[] = []
let logs: string[]
let extraSockets: ReturnType<typeof createSocket>[] = []

type StartOptions = {
  node?: UdpReceiverOptions
  pollBroadcast?: string
  artnetPort?: number
  target?: string
  /** `false` : filtre par défaut du pont (aucun nœud en boucle locale ne passe). */
  defaultFilter?: boolean
}

/**
 * Le faux nœud écoute sur 127.0.0.1 : c'est à la fois la cible du poll (`pollBroadcast` +
 * `artnetPort`) et l'expéditeur des ArtPollReply qu'on lui fait renvoyer à chaque ArtPoll reçu.
 * Tout est en boucle locale : le filtre `acceptNode` est assoupli (sauf `defaultFilter`).
 */
async function startBridge(replies: (PollReplyFields | Buffer)[], start: StartOptions = {}) {
  const packets = replies.map((entry) => (Buffer.isBuffer(entry) ? entry : buildPollReply(entry)))
  receiver = await openUdpReceiver(
    (message) => (message.equals(encodeArtPoll()) ? packets : []),
    start.node
  )
  clock = createManualClock()
  logs = []
  bridge = createBridgeServer({
    port: 0,
    origins: [ORIGIN],
    plan: buildOutputPlan(defaultMappings()),
    artnetPort: start.artnetPort ?? receiver.port,
    bind: '127.0.0.1',
    pollBroadcast: start.pollBroadcast ?? '127.0.0.1',
    ...(start.target ? { target: start.target } : {}),
    ...(start.defaultFilter ? {} : { acceptNode: (ip: string) => isAllowedArtnetTarget(ip) }),
    clock,
    version: '9.9.9',
    log: (line) => logs.push(line),
  })
  port = await bridge.listen()
}

/**
 * Faux nœud conforme : écoute sur 127.0.0.2 (port partageable) et répond à l'ArtPoll sur le port
 * Art-Net du contrôleur (`artnetPort`), jamais sur le port source éphémère.
 */
const startArtnetPortNode = (replies: (PollReplyFields | Buffer)[]) =>
  startBridge(replies, {
    node: {
      address: NODE_ADDRESS,
      reuseAddr: true,
      replyTo: (remote) => ({ address: remote.address, port: receiver.port }),
    },
    pollBroadcast: NODE_ADDRESS,
  })

async function connect(hello: string | null = HELLO): Promise<RawClient> {
  const client = await openRawClient(port)
  clients.push(client)
  if (hello !== null) {
    client.send(OPCODE.text, hello)
    await client.next() // ack
  }
  return client
}

const read = async (client: RawClient) =>
  JSON.parse((await client.next()).payload.toString('utf8')) as Record<string, unknown>

const pollsReceived = () => receiver.packets.filter((packet) => packet.equals(encodeArtPoll()))

const pause = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))

/** Laisse les réponses UDP arriver puis écoule la fenêtre de collecte. */
async function endWindow() {
  await vi.waitFor(() => expect(receiver.packets.length).toBeGreaterThan(0))
  await pause()
  clock.advance(POLL_WINDOW_MS)
}

afterEach(async () => {
  for (const client of clients) {
    client.socket.destroy()
  }
  clients = []
  for (const socket of extraSockets) {
    socket.close()
  }
  extraSockets = []
  await bridge.close()
  await receiver.close()
})

describe('pont : découverte des nœuds (poll)', () => {
  it('diffuse un ArtPoll puis renvoie les nœuds trouvés après la fenêtre de collecte', async () => {
    await startBridge([
      {
        ip: '192.168.1.50',
        shortName: 'NET-3',
        longName: 'Showtec NET-3',
        ports: [{ type: 0x80, swOut: 1 }],
      },
      { ip: '10.0.0.4', shortName: 'Autre', longName: 'Autre noeud' },
    ])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    expect(receiver.packets[0]).toEqual(encodeArtPoll())
    expect(await read(client)).toEqual({
      type: 'nodes',
      nodes: [
        { ip: '192.168.1.50', shortName: 'NET-3', longName: 'Showtec NET-3', universes: ['0.0.1'] },
        { ip: '10.0.0.4', shortName: 'Autre', longName: 'Autre noeud' },
      ],
    })
  })

  it('lit la réponse envoyée au port source quand le port Art-Net n’est pas écoutable', async () => {
    // Le faux nœud occupe `artnetPort` sans `reuseAddr` : l'écoute du pont échoue, repli sur le
    // socket d'envoi (le nœud répond à l'adresse et au port de l'ArtPoll reçu).
    await startBridge([{ ip: '192.168.1.50', shortName: 'Source' }])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    const reply = (await read(client)) as { nodes: { shortName: string }[] }
    expect(reply.nodes.map((node) => node.shortName)).toEqual(['Source'])
    if (isLinux) {
      expect(logs.some((line) => line.includes('Écoute des réponses Art-Net'))).toBe(true)
    }
  })

  it.skipIf(!isLinux)(
    'écoute le port Art-Net : un nœud qui répond là, et pas au port source, est trouvé',
    async () => {
      await startArtnetPortNode([
        { ip: '192.168.1.50', shortName: 'Conforme', ports: [{ type: 0x80, swOut: 2 }] },
      ])
      const client = await connect()
      client.send(OPCODE.text, POLL)
      await endWindow()
      expect(await read(client)).toEqual({
        type: 'nodes',
        nodes: [
          {
            ip: '192.168.1.50',
            shortName: 'Conforme',
            longName: 'Node long name',
            universes: ['0.0.2'],
          },
        ],
      })
      expect(logs.some((line) => line.includes('Écoute des réponses Art-Net'))).toBe(false)
    }
  )

  it.skipIf(!isLinux)('libère le port Art-Net à la fin de la collecte', async () => {
    await startArtnetPortNode([{ ip: '192.168.1.50' }])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    await read(client)
    const artnetPort = receiver.port
    await receiver.close()
    await pause(50)
    // Sans le faux nœud, seule une écoute restée ouverte (reuseAddr) empêcherait ce bind exclusif.
    const probe = createSocket({ type: 'udp4', reuseAddr: false })
    extraSockets.push(probe)
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject)
      probe.bind({ address: '0.0.0.0', port: artnetPort }, resolve)
    })
  })

  it('filtre les nœuds dont l’IP n’est pas locale et les paquets malformés', async () => {
    await startBridge([
      { ip: '8.8.8.8', shortName: 'Dehors' },
      { ip: '172.32.0.1', shortName: 'Hors plage' },
      Buffer.from('Art-Net\0 pas un reply'),
      Buffer.alloc(5),
      { ip: '192.168.1.60', shortName: 'Local' },
    ])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    const reply = (await read(client)) as { nodes: { ip: string }[] }
    expect(reply.nodes.map((node) => node.ip)).toEqual(['192.168.1.60'])
  })

  it('par défaut, écarte un nœud en boucle locale (127.x) même s’il annonce sa propre IP', async () => {
    await startBridge([{ ip: '127.0.0.1', shortName: 'Boucle' }], { defaultFilter: true })
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    expect(await read(client)).toEqual({ type: 'nodes', nodes: [] })
  })

  it('fusionne les réponses d’une même IP (nœud à plusieurs ports)', async () => {
    await startBridge([
      { ip: '192.168.1.70', ports: [{ type: 0x80, swOut: 0 }] },
      { ip: '192.168.1.70', ports: [{ type: 0x80, swOut: 1 }] },
      { ip: '192.168.1.70', ports: [{ type: 0x80, swOut: 1 }] },
    ])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    const reply = (await read(client)) as { nodes: { universes: string[] }[] }
    expect(reply.nodes).toHaveLength(1)
    expect(reply.nodes[0]!.universes).toEqual(['0.0.0', '0.0.1'])
  })

  it(`plafonne à ${POLL_MAX_NODES} nœuds`, async () => {
    const many = Array.from({ length: POLL_MAX_NODES + 10 }, (unused, index) => ({
      ip: `10.1.${Math.floor(index / 200)}.${index % 200}`,
    }))
    await startBridge(many)
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    const reply = (await read(client)) as { nodes: unknown[] }
    expect(reply.nodes).toHaveLength(POLL_MAX_NODES)
  })

  it(`plafonne à ${POLL_MAX_UNIVERSES} univers par nœud`, async () => {
    // 8 réponses de 4 sorties chacune, sur 8 sous-réseaux : 32 univers distincts annoncés.
    const replies = Array.from({ length: 8 }, (unused, subnet) => ({
      ip: '192.168.1.80',
      subnet,
      ports: [0, 1, 2, 3].map((swOut) => ({ type: 0x80, swOut })),
    }))
    await startBridge(replies)
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    const reply = (await read(client)) as { nodes: { universes: string[] }[] }
    expect(reply.nodes).toHaveLength(1)
    expect(reply.nodes[0]!.universes).toHaveLength(POLL_MAX_UNIVERSES)
    expect(reply.nodes[0]!.universes[0]).toBe('0.0.0')
  })

  it.skipIf(!isLinux)(
    `ne traite que ${POLL_MAX_PACKETS} paquets par poll : le reste est ignoré`,
    async () => {
      await startArtnetPortNode([])
      const client = await connect()
      client.send(OPCODE.text, POLL)
      await vi.waitFor(() => expect(pollsReceived()).toHaveLength(1))
      // Envoi par lots depuis un socket du test vers le port Art-Net (écouté par le pont).
      const sender = createSocket('udp4')
      extraSockets.push(sender)
      const send = (packet: Buffer) =>
        new Promise<void>((resolve) =>
          sender.send(packet, receiver.port, '127.0.0.1', () => resolve())
        )
      await send(buildPollReply({ ip: '192.168.1.1', shortName: 'Avant' }))
      const junk = Buffer.from('Art-Net\0 du bruit')
      for (let batch = 0; batch < 12; batch += 1) {
        await Promise.all(Array.from({ length: 100 }, () => send(junk)))
        await pause(10)
      }
      await send(buildPollReply({ ip: '192.168.1.2', shortName: 'Après' }))
      await pause(200)
      clock.advance(POLL_WINDOW_MS)
      const reply = (await read(client)) as { nodes: { shortName: string }[] }
      expect(reply.nodes.map((node) => node.shortName)).toEqual(['Avant'])
    }
  )

  it('un second poll pendant le premier est ignoré : une seule réponse, un seul ArtPoll', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    client.send(OPCODE.text, POLL)
    await endWindow()
    expect(((await read(client)) as { type: string }).type).toBe('nodes')
    expect(pollsReceived()).toHaveLength(1)
    // Aucune seconde réponse n'est en route.
    await expect(client.next(300)).rejects.toThrow()
  })

  it('limite le débit : un poll moins d’1 s après la fin du précédent reçoit le même résultat', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await endWindow()
    const first = await read(client)

    clock.advance(POLL_MIN_INTERVAL_MS - 1)
    client.send(OPCODE.text, POLL)
    expect(await read(client)).toEqual(first)
    expect(pollsReceived()).toHaveLength(1)

    clock.advance(1)
    client.send(OPCODE.text, POLL)
    await vi.waitFor(() => expect(pollsReceived()).toHaveLength(2))
    clock.advance(POLL_WINDOW_MS)
    expect(((await read(client)) as { type: string }).type).toBe('nodes')
  })

  it('refuse un poll avant le hello : rien n’est envoyé sur le réseau', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect(null)
    client.send(OPCODE.text, POLL)
    const reply = await read(client)
    expect(reply).toMatchObject({ type: 'error', code: 'hello' })
    await pause()
    expect(receiver.packets).toHaveLength(0)
  })

  it('ne répond pas à un client parti avant la fin de la collecte : aucun envoi', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await vi.waitFor(() => expect(receiver.packets.length).toBeGreaterThan(0))
    await pause()
    client.socket.destroy()
    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    const write = vi.spyOn(Socket.prototype, 'write')
    try {
      expect(() => clock.advance(POLL_WINDOW_MS)).not.toThrow()
      await pause()
      expect(write).not.toHaveBeenCalled()
    } finally {
      write.mockRestore()
    }
  })

  it('transmet une trame ArtDmx pendant la collecte', async () => {
    await startBridge([{ ip: '192.168.1.50' }], { target: '127.0.0.1' })
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await vi.waitFor(() => expect(pollsReceived()).toHaveLength(1))
    const frame = new Uint8Array(515)
    frame[0] = 1
    frame.fill(77, 3)
    client.send(OPCODE.binary, frame)
    await vi.waitFor(() =>
      expect(receiver.packets.some((packet) => packet.length === 530 && packet[18] === 77)).toBe(
        true
      )
    )
    clock.advance(POLL_WINDOW_MS)
    expect(((await read(client)) as { type: string }).type).toBe('nodes')
  })

  it('répond {"type":"error","code":"poll"} sans fermer si l’ArtPoll ne part pas', async () => {
    // Le port 0 fait lever l'envoi UDP (ERR_SOCKET_BAD_PORT) : l'ArtPoll ne peut pas partir.
    await startBridge([], { artnetPort: 0 })
    const client = await connect()
    client.send(OPCODE.text, POLL)
    expect(await read(client)).toMatchObject({ type: 'error', code: 'poll' })
    expect(bridge.hasClient()).toBe(true)
    expect(logs.some((line) => line.includes('ArtPoll impossible'))).toBe(true)
    // Le pont reste utilisable : un nouveau poll n'est pas bloqué par l'échec.
    client.send(OPCODE.text, POLL)
    expect(await read(client)).toMatchObject({ type: 'error', code: 'poll' })
  })

  it('ignore les messages texte inconnus ou illisibles après le hello', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect()
    for (const text of ['pas du json', '{"type":"autre"}', 'null', '3']) {
      client.send(OPCODE.text, text)
    }
    await pause()
    expect(bridge.hasClient()).toBe(true)
    expect(receiver.packets).toHaveLength(0)
  })
})
