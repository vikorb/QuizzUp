import { encodeArtPoll } from '@bridge/artnet'
import { buildOutputPlan, defaultMappings } from '@bridge/mapping'
import { POLL_MAX_NODES, POLL_MIN_INTERVAL_MS, POLL_WINDOW_MS } from '@bridge/protocol'
import type { BridgeServer } from '@bridge/server'
import { createBridgeServer } from '@bridge/server'

import { buildPollReply, type PollReplyFields } from './_helpers/artPollReply'
import { createManualClock, type ManualClock } from './_helpers/manualClock'
import type { RawClient, UdpReceiver } from './_helpers/rawClient'
import { OPCODE, openRawClient, openUdpReceiver } from './_helpers/rawClient'

const ORIGIN = 'https://salle.quizzup.fr'
const HELLO = JSON.stringify({ type: 'hello', protocol: 1, version: 2, universe: 0 })
const POLL = JSON.stringify({ type: 'poll' })

let receiver: UdpReceiver
let bridge: BridgeServer
let port: number
let clock: ManualClock
let clients: RawClient[] = []
let logs: string[]

/**
 * Le faux nœud écoute sur 127.0.0.1 : c'est à la fois la cible du poll (`pollBroadcast` +
 * `artnetPort`) et l'expéditeur des ArtPollReply qu'on lui fait renvoyer à chaque ArtPoll reçu.
 */
async function startBridge(replies: (PollReplyFields | Buffer)[]) {
  const packets = replies.map((entry) => (Buffer.isBuffer(entry) ? entry : buildPollReply(entry)))
  receiver = await openUdpReceiver((message) => (message.equals(encodeArtPoll()) ? packets : []))
  clock = createManualClock()
  logs = []
  bridge = createBridgeServer({
    port: 0,
    origins: [ORIGIN],
    plan: buildOutputPlan(defaultMappings()),
    artnetPort: receiver.port,
    bind: '127.0.0.1',
    pollBroadcast: '127.0.0.1',
    clock,
    version: '9.9.9',
    log: (line) => logs.push(line),
  })
  port = await bridge.listen()
}

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

/** Laisse les réponses UDP arriver puis écoule la fenêtre de collecte. */
async function endWindow() {
  await vi.waitFor(() => expect(receiver.packets.length).toBeGreaterThan(0))
  await new Promise((resolve) => setTimeout(resolve, 100))
  clock.advance(POLL_WINDOW_MS)
}

afterEach(async () => {
  for (const client of clients) {
    client.socket.destroy()
  }
  clients = []
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

  it('fusionne les réponses d’une même IP (nœud à plusieurs ports)', async () => {
    await startBridge([
      { ip: '192.168.1.70', ports: [{ type: 0x80, swOut: 0 }] },
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

  it('un second poll pendant le premier attend la même réponse, sans second ArtPoll', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    client.send(OPCODE.text, POLL)
    await endWindow()
    const first = await read(client)
    const second = await read(client)
    expect(second).toEqual(first)
    expect(receiver.packets.filter((packet) => packet.equals(encodeArtPoll()))).toHaveLength(1)
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
    expect(receiver.packets.filter((packet) => packet.equals(encodeArtPoll()))).toHaveLength(1)

    clock.advance(1)
    client.send(OPCODE.text, POLL)
    await vi.waitFor(() =>
      expect(receiver.packets.filter((packet) => packet.equals(encodeArtPoll()))).toHaveLength(2)
    )
    clock.advance(POLL_WINDOW_MS)
    expect(((await read(client)) as { type: string }).type).toBe('nodes')
  })

  it('refuse un poll avant le hello : rien n’est envoyé sur le réseau', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect(null)
    client.send(OPCODE.text, POLL)
    const reply = await read(client)
    expect(reply).toMatchObject({ type: 'error', code: 'hello' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(receiver.packets).toHaveLength(0)
  })

  it('ne répond pas à un client parti avant la fin de la collecte', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect()
    client.send(OPCODE.text, POLL)
    await vi.waitFor(() => expect(receiver.packets.length).toBeGreaterThan(0))
    client.socket.destroy()
    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    expect(() => clock.advance(POLL_WINDOW_MS)).not.toThrow()
  })

  it('ignore les messages texte inconnus ou illisibles après le hello', async () => {
    await startBridge([{ ip: '192.168.1.50' }])
    const client = await connect()
    for (const text of ['pas du json', '{"type":"autre"}', 'null', '3']) {
      client.send(OPCODE.text, text)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(bridge.hasClient()).toBe(true)
    expect(receiver.packets).toHaveLength(0)
  })
})
