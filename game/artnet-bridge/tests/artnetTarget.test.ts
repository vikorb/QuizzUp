import { buildOutputPlan, defaultMappings } from '@bridge/mapping'
import type { BridgeServer } from '@bridge/server'
import { createBridgeServer } from '@bridge/server'

import type { RawClient, UdpReceiver } from './_helpers/rawClient'
import { OPCODE, openRawClient, openUdpReceiver } from './_helpers/rawClient'

const ORIGIN = 'https://salle.quizzup.fr'

let receiver: UdpReceiver
let bridge: BridgeServer
let port: number
let logs: string[]
let started = false

/** `cliTarget` : cible donnée en ligne de commande (prioritaire) ; sinon elle vient du hello v2. */
async function startBridge(cliTarget?: string) {
  receiver = await openUdpReceiver()
  logs = []
  bridge = createBridgeServer({
    port: 0,
    origins: [ORIGIN],
    plan: buildOutputPlan(defaultMappings()),
    ...(cliTarget ? { target: cliTarget, artnetPort: receiver.port } : {}),
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

describe('pont : cible Art-Net de l’écran de salle (protocole v2)', () => {
  it('v1 sans cible : ack inchangé (sans artnet), rien n’est envoyé', async () => {
    await startBridge()
    const { client, reply } = await connect(
      JSON.stringify({ type: 'hello', protocol: 1, universe: 0 })
    )
    expect(reply).toEqual({
      type: 'ack',
      protocol: 1,
      bridge: 'quizzup-artnet-bridge',
      version: '9.9.9',
      universes: 16,
    })
    client.send(OPCODE.binary, frame(7))
    await settle()
    expect(receiver.packets).toHaveLength(0)
    expect(logs.some((line) => line.includes('Aucune cible Art-Net'))).toBe(true)
  })

  it('v1 avec --target : comme avant, trames envoyées à la cible', async () => {
    await startBridge('127.0.0.1')
    const { client, reply } = await connect(
      JSON.stringify({ type: 'hello', protocol: 1, universe: 0 })
    )
    expect(reply.artnet).toBeUndefined()
    client.send(OPCODE.binary, frame(9))
    const [packet] = await receiver.waitFor(1)
    expect(packet![18]).toBe(9)
  })

  it('v2 : applique la cible reçue, l’annonce (source room) et lui envoie les trames', async () => {
    await startBridge()
    const { client, reply } = await connect(hello({ target: '127.0.0.1', port: receiver.port }))
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

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '255.255.255.255'])(
    'v2 : refuse la cible publique %s, avec une erreur claire, sans rien envoyer',
    async (target) => {
      await startBridge()
      const client = await openRawClient(port)
      client.send(OPCODE.text, hello({ target, port: receiver.port }))
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

  it('v2 : refuse une cible illisible ou un port invalide', async () => {
    await startBridge()
    for (const artnet of [
      { target: 'salle.local' },
      { target: '192.168.1.50', port: 70_000 },
      { port: 6454, target: 5 },
    ]) {
      const client = await openRawClient(port)
      client.send(OPCODE.text, hello(artnet))
      expect(await read(client)).toMatchObject({ type: 'error', code: 'target' })
      await client.closed()
    }
  })

  it('v2 sans artnet ni --target : source none, rien n’est envoyé', async () => {
    await startBridge()
    const { client, reply } = await connect(hello())
    expect(reply.artnet).toEqual({ target: null, port: 6454, source: 'none' })
    client.send(OPCODE.binary, frame(3))
    await settle()
    expect(receiver.packets).toHaveLength(0)
  })

  it('v2 avec --target : la ligne de commande reste prioritaire et l’ack le dit', async () => {
    await startBridge('127.0.0.1')
    const { client, reply } = await connect(hello({ target: '10.9.8.7', port: 6454 }))
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

  it('une nouvelle connexion remplace la cible précédente', async () => {
    await startBridge()
    const first = await connect(hello({ target: '127.0.0.1', port: receiver.port }))
    expect(first.reply.artnet).toMatchObject({ source: 'room' })
    first.client.send(OPCODE.close, Buffer.from([0x03, 0xe8]))
    await first.client.closed()
    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    const second = await connect(hello())
    expect(second.reply.artnet).toEqual({ target: null, port: 6454, source: 'none' })
  })
})
