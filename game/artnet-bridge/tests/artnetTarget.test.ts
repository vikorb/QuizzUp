import { buildOutputPlan, defaultMappings } from '@bridge/mapping'
import type { BridgeServer } from '@bridge/server'
import { createBridgeServer } from '@bridge/server'

import type { RawClient, UdpReceiver } from './_helpers/rawClient'
import { OPCODE, openRawClient, openUdpReceiver } from './_helpers/rawClient'

const ORIGIN = 'https://salle.quizzup.fr'
/** Autre adresse de la boucle locale : personne n'y écoute, elle sert de « deuxième nœud ». */
const OTHER_NODE = '127.0.0.2'

let receiver: UdpReceiver
let bridge: BridgeServer
let port: number
let logs: string[]
let started = false

/**
 * Le port Art-Net est toujours celui de `--artnet-port` (ici le faux nœud). `cliTarget` : cible donnée
 * en ligne de commande (prioritaire) ; sinon elle vient du hello v2.
 */
async function startBridge(cliTarget?: string) {
  receiver = await openUdpReceiver()
  logs = []
  bridge = createBridgeServer({
    port: 0,
    origins: [ORIGIN],
    plan: buildOutputPlan(defaultMappings()),
    ...(cliTarget ? { target: cliTarget } : {}),
    artnetPort: receiver.port,
    bind: '127.0.0.1',
    blackoutMs: 300,
    version: '9.9.9',
    log: (line) => logs.push(line),
  })
  port = await bridge.listen()
  started = true
}

afterEach(async () => {
  if (started) {
    started = false
    await bridge.close()
    await receiver.close()
  }
})

const frame = (first: number) => {
  const bytes = new Uint8Array(515)
  bytes[0] = 1
  bytes.fill(first, 3)
  return bytes
}

const hello = (artnet?: Record<string, unknown>) =>
  JSON.stringify({
    type: 'hello',
    protocol: 1,
    version: 2,
    universe: 0,
    ...(artnet ? { artnet } : {}),
  })

const helloV1 = JSON.stringify({ type: 'hello', protocol: 1, universe: 0 })

const read = async (client: RawClient) =>
  JSON.parse((await client.next()).payload.toString('utf8')) as Record<string, unknown>

async function connect(
  text: string
): Promise<{ client: RawClient; reply: Record<string, unknown> }> {
  const client = await openRawClient(port)
  expect(client.status).toBe(101)
  client.send(OPCODE.text, text)
  return { client, reply: await read(client) }
}

async function disconnect(client: RawClient): Promise<void> {
  client.send(OPCODE.close, Buffer.from([0x03, 0xe8]))
  await client.closed()
  await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
}

const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))

describe('pont : cible Art-Net de l’écran de salle (protocole v2)', () => {
  it('v1 sans cible : l’ack dit « none » et rien n’est envoyé', async () => {
    await startBridge()
    const { client, reply } = await connect(helloV1)
    expect(reply).toEqual({
      type: 'ack',
      protocol: 1,
      bridge: 'quizzup-artnet-bridge',
      version: '9.9.9',
      universes: 16,
      artnet: { target: null, port: receiver.port, source: 'none' },
    })
    client.send(OPCODE.binary, frame(7))
    await settle()
    expect(receiver.packets).toHaveLength(0)
    expect(logs.some((line) => line.includes('Aucune cible Art-Net'))).toBe(true)
  })

  it('v1 avec --target : comme avant, trames envoyées à la cible (source cli)', async () => {
    await startBridge('127.0.0.1')
    const { client, reply } = await connect(helloV1)
    expect(reply.artnet).toEqual({ target: '127.0.0.1', port: receiver.port, source: 'cli' })
    client.send(OPCODE.binary, frame(9))
    const [packet] = await receiver.waitFor(1)
    expect(packet![18]).toBe(9)
  })

  it('v2 : applique la cible reçue, l’annonce (source room) et lui envoie les trames', async () => {
    await startBridge()
    const { client, reply } = await connect(hello({ target: '127.0.0.1' }))
    expect(reply).toEqual({
      type: 'ack',
      protocol: 1,
      bridge: 'quizzup-artnet-bridge',
      version: '9.9.9',
      universes: 16,
      artnet: { target: '127.0.0.1', port: receiver.port, source: 'room' },
    })
    client.send(OPCODE.binary, frame(42))
    const [packet] = await receiver.waitFor(1)
    expect(packet!.subarray(0, 8).toString('latin1')).toBe('Art-Net\0')
    expect(packet![18]).toBe(42)
  })

  it('v2 : un port envoyé par l’écran de salle est ignoré, seul --artnet-port compte', async () => {
    await startBridge()
    for (const sent of [53, 161, 6454, 'x']) {
      const { client, reply } = await connect(hello({ target: '127.0.0.1', port: sent }))
      expect(reply.artnet).toEqual({ target: '127.0.0.1', port: receiver.port, source: 'room' })
      client.send(OPCODE.binary, frame(11))
      await receiver.waitFor(1)
      await disconnect(client)
    }
    expect(receiver.packets.some((packet) => packet[18] === 11)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '255.255.255.255'])(
    'v2 : refuse la cible publique %s, avec une erreur claire, sans rien envoyer',
    async (target) => {
      await startBridge()
      const client = await openRawClient(port)
      client.send(OPCODE.text, hello({ target }))
      const error = await read(client)
      expect(error).toMatchObject({ type: 'error', code: 'target' })
      expect(error.message).toContain(`${target} refusée`)
      expect((await client.next()).payload.readUInt16BE(0)).toBe(4005)
      await client.closed()
      await settle()
      expect(bridge.hasClient()).toBe(false)
      expect(receiver.packets).toHaveLength(0)
    }
  )

  it('v2 : refuse une cible illisible', async () => {
    await startBridge()
    for (const artnet of [{ target: 'salle.local' }, { target: 5 }, { target: '127.1' }]) {
      const client = await openRawClient(port)
      client.send(OPCODE.text, hello(artnet))
      expect(await read(client)).toMatchObject({ type: 'error', code: 'target' })
      await client.closed()
    }
  })

  it('v2 sans artnet ni --target : source none, rien n’est envoyé', async () => {
    await startBridge()
    const { client, reply } = await connect(hello())
    expect(reply.artnet).toEqual({ target: null, port: receiver.port, source: 'none' })
    client.send(OPCODE.binary, frame(3))
    await settle()
    expect(receiver.packets).toHaveLength(0)
  })

  it('v2 avec --target : la ligne de commande reste prioritaire et l’ack le dit', async () => {
    await startBridge('127.0.0.1')
    const { client, reply } = await connect(hello({ target: '10.9.8.7' }))
    expect(reply.artnet).toEqual({ target: '127.0.0.1', port: receiver.port, source: 'cli' })
    client.send(OPCODE.binary, frame(21))
    const [packet] = await receiver.waitFor(1)
    expect(packet![18]).toBe(21)
  })

  it('v2 avec --target : une cible publique de l’écran de salle est ignorée, pas refusée', async () => {
    await startBridge('127.0.0.1')
    const { reply } = await connect(hello({ target: '8.8.8.8' }))
    expect(reply).toMatchObject({ type: 'ack', artnet: { target: '127.0.0.1', source: 'cli' } })
  })

  it('une nouvelle connexion v2 sans artnet efface la cible précédente', async () => {
    await startBridge()
    const first = await connect(hello({ target: '127.0.0.1' }))
    expect(first.reply.artnet).toMatchObject({ source: 'room' })
    await disconnect(first.client)
    const second = await connect(hello())
    expect(second.reply.artnet).toEqual({ target: null, port: receiver.port, source: 'none' })
  })

  it('un hello v1 après un v2 remet la cible à null : rien n’est émis vers l’ancienne IP', async () => {
    await startBridge()
    const first = await connect(hello({ target: '127.0.0.1' }))
    first.client.send(OPCODE.binary, frame(5))
    await receiver.waitFor(1)
    await disconnect(first.client)
    await settle(500) // fin du noir de sécurité
    const before = receiver.packets.length
    const second = await connect(helloV1)
    expect(second.reply.artnet).toEqual({ target: null, port: receiver.port, source: 'none' })
    second.client.send(OPCODE.binary, frame(6))
    await settle(400)
    // Seules les 3 trames à zéro de l'adieu à l'ancienne cible, jamais la trame 6.
    expect(receiver.packets.slice(before).every((packet) => packet[18] === 0)).toBe(true)
    expect(receiver.packets.some((packet) => packet[18] === 6)).toBe(false)
  })

  it('changer de cible envoie 3 trames à zéro à l’ancienne avant de basculer', async () => {
    await startBridge()
    const first = await connect(hello({ target: '127.0.0.1' }))
    first.client.send(OPCODE.binary, frame(5))
    await receiver.waitFor(1)
    await disconnect(first.client)
    await settle(500) // fin du noir de sécurité : plus rien ne part tout seul
    const before = receiver.packets.length
    const second = await connect(hello({ target: OTHER_NODE }))
    expect(second.reply.artnet).toEqual({ target: OTHER_NODE, port: receiver.port, source: 'room' })
    await receiver.waitFor(before + 3)
    await settle()
    const goodbye = receiver.packets.slice(before)
    expect(goodbye).toHaveLength(3)
    expect(goodbye.every((packet) => packet[18] === 0)).toBe(true)
    // La nouvelle cible reçoit ensuite les trames, l'ancienne plus rien.
    second.client.send(OPCODE.binary, frame(8))
    await settle()
    expect(receiver.packets).toHaveLength(before + 3)
  })

  it('même cible à la reconnexion : pas de trames à zéro en plus', async () => {
    await startBridge()
    const first = await connect(hello({ target: '127.0.0.1' }))
    first.client.send(OPCODE.binary, frame(5))
    await receiver.waitFor(1)
    await disconnect(first.client)
    await settle(500)
    const before = receiver.packets.length
    await connect(hello({ target: '127.0.0.1' }))
    await settle()
    expect(receiver.packets).toHaveLength(before)
  })

  it('un second hello en cours de session ne change pas la cible', async () => {
    await startBridge()
    const { client } = await connect(hello({ target: '127.0.0.1' }))
    client.send(OPCODE.text, hello({ target: OTHER_NODE }))
    client.send(OPCODE.text, helloV1)
    client.send(OPCODE.binary, frame(33))
    const [packet] = await receiver.waitFor(1)
    expect(packet![18]).toBe(33)
    await settle()
    expect(receiver.packets.every((one) => one[18] === 33)).toBe(true)
    expect(bridge.hasClient()).toBe(true)
  })

  it('un client refusé (busy) avec une autre cible ne touche à rien', async () => {
    await startBridge()
    const { client } = await connect(hello({ target: '127.0.0.1' }))
    client.send(OPCODE.binary, frame(44))
    await receiver.waitFor(1)
    const busy = await openRawClient(port)
    expect(await read(busy)).toMatchObject({ type: 'error', code: 'busy' })
    busy.send(OPCODE.text, hello({ target: OTHER_NODE }))
    await busy.closed()
    await settle()
    expect(receiver.packets.every((one) => one[18] === 44)).toBe(true)
    client.send(OPCODE.binary, frame(45))
    await vi.waitFor(() => expect(receiver.packets.some((one) => one[18] === 45)).toBe(true))
  })
})
