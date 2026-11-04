import { request } from 'node:http'

import { buildOutputPlan, defaultMappings, parseMappingSpec } from '@bridge/mapping'
import type { BridgeServer } from '@bridge/server'
import {
  allowedHostHeaders,
  createBridgeServer,
  LISTEN_HOST,
  normalizeOrigin,
} from '@bridge/server'

import type { RawClient, UdpReceiver } from './_helpers/rawClient'
import { encodeClientFrame, OPCODE, openRawClient, openUdpReceiver } from './_helpers/rawClient'

const ORIGIN = 'https://salle.quizzup.fr'
const HELLO = JSON.stringify({ type: 'hello', protocol: 1, universe: 0 })

const frameBytes = (first: number, universe = 0, version = 1) => {
  const bytes = new Uint8Array(515)
  bytes[0] = version
  bytes[1] = universe >> 8
  bytes[2] = universe & 0xff
  bytes.fill(first, 3)
  return bytes
}

let receiver: UdpReceiver
let bridge: BridgeServer
let port: number
let logs: string[]

async function startBridge(
  mappings = defaultMappings(),
  extra: { silenceTimeoutMs?: number } = {}
) {
  receiver = await openUdpReceiver()
  logs = []
  bridge = createBridgeServer({
    port: 0,
    origins: [ORIGIN],
    plan: buildOutputPlan(mappings),
    target: '127.0.0.1',
    artnetPort: receiver.port,
    bind: '127.0.0.1',
    silenceTimeoutMs: extra.silenceTimeoutMs ?? 5000,
    blackoutMs: 300,
    version: '9.9.9',
    log: (line) => logs.push(line),
  })
  port = await bridge.listen()
  started = true
}

async function connectReady(): Promise<RawClient> {
  const client = await openRawClient(port)
  expect(client.status).toBe(101)
  client.send(OPCODE.text, HELLO)
  const ack = await client.next()
  expect(JSON.parse(ack.payload.toString('utf8'))).toMatchObject({ type: 'ack', version: '9.9.9' })
  return client
}

let started = false

afterEach(async () => {
  if (started) {
    started = false
    await bridge.close()
    await receiver.close()
  }
})

describe('pont : poignée de main et sécurité', () => {
  it('écoute uniquement sur 127.0.0.1 et répond 426 hors WebSocket', async () => {
    await startBridge()
    expect(LISTEN_HOST).toBe('127.0.0.1')
    const status = await new Promise<number>((resolve) => {
      request({ host: '127.0.0.1', port, path: '/' }, (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      }).end()
    })
    expect(status).toBe(426)
  })

  it('accepte l’origine autorisée et répond ack', async () => {
    await startBridge()
    const client = await openRawClient(port)
    expect(client.status).toBe(101)
    expect(client.headers).toMatch(/Sec-WebSocket-Accept: \S+/)
    client.send(OPCODE.text, HELLO)
    const ack = JSON.parse((await client.next()).payload.toString('utf8'))
    expect(ack).toEqual({
      type: 'ack',
      protocol: 1,
      bridge: 'quizzup-artnet-bridge',
      version: '9.9.9',
    })
    expect(bridge.hasClient()).toBe(true)
    expect(logs).toContain(`Écran de salle connecté (${ORIGIN})`)
  })

  it('refuse une origine non autorisée ou absente', async () => {
    await startBridge()
    const evil = await openRawClient(port, { Origin: 'https://evil.example' })
    expect(evil.status).toBe(403)
    expect(evil.body).toContain('Origine non autorisée')
    const none = await openRawClient(port, { Origin: undefined })
    expect(none.status).toBe(403)
    expect(logs.some((line) => line.includes('« https://evil.example » non autorisée'))).toBe(true)
    expect(logs.some((line) => line.includes('(absente)'))).toBe(true)
    expect(bridge.hasClient()).toBe(false)
  })

  it('refuse un hôte autre que 127.0.0.1 / localhost (DNS rebinding)', async () => {
    await startBridge()
    const rebinding = await openRawClient(port, { Host: `evil.example:${port}` })
    expect(rebinding.status).toBe(403)
    const missing = await openRawClient(port, { Host: undefined })
    expect(missing.status).toBe(403)
    // Sans port explicite, l'hôte seul n'est accepté que si le pont écoute sur le port 80.
    const portless = await openRawClient(port, { Host: 'localhost' })
    expect(portless.status).toBe(403)
    const local = await openRawClient(port, { Host: `localhost:${port}` })
    expect(local.status).toBe(101)
  })

  it('accepte l’hôte sans port quand le pont écoute sur le port 80 (port par défaut de ws://)', () => {
    expect([...allowedHostHeaders(80)].sort()).toEqual([
      '127.0.0.1',
      '127.0.0.1:80',
      'localhost',
      'localhost:80',
    ])
    expect([...allowedHostHeaders(7654)].sort()).toEqual(['127.0.0.1:7654', 'localhost:7654'])
  })

  it('refuse une requête WebSocket mal formée', async () => {
    await startBridge()
    const client = await openRawClient(port, { 'Sec-WebSocket-Version': '8' })
    expect(client.status).toBe(400)
    const badKey = await openRawClient(port, { 'Sec-WebSocket-Key': 'court' })
    expect(badKey.status).toBe(400)
  })

  it('accepte un seul écran de salle à la fois', async () => {
    await startBridge()
    const first = await connectReady()
    // Le navigateur ne lit pas un statut 409 : le refus passe par un message d'erreur explicite.
    const second = await openRawClient(port)
    expect(second.status).toBe(101)
    expect(JSON.parse((await second.next()).payload.toString('utf8'))).toEqual({
      type: 'error',
      code: 'busy',
      message: 'un autre onglet est déjà connecté au pont',
    })
    const busyClose = await second.next()
    expect(busyClose.opcode).toBe(OPCODE.close)
    expect(busyClose.payload.readUInt16BE(0)).toBe(4004)
    expect(bridge.hasClient()).toBe(true)
    first.send(OPCODE.close, Buffer.from([0x03, 0xe8]))
    await first.closed()
    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    const third = await connectReady()
    expect(third.status).toBe(101)
  })

  it('exige le hello en premier, au bon protocole et au bon univers', async () => {
    await startBridge()
    const early = await openRawClient(port)
    early.send(OPCODE.binary, frameBytes(1))
    expect(JSON.parse((await early.next()).payload.toString('utf8'))).toMatchObject({
      type: 'error',
      code: 'hello',
    })
    const close = await early.next()
    expect(close.opcode).toBe(OPCODE.close)
    expect(close.payload.readUInt16BE(0)).toBe(4000)
    await early.closed()
    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))

    const future = await openRawClient(port)
    future.send(OPCODE.text, JSON.stringify({ type: 'hello', protocol: 2 }))
    expect(JSON.parse((await future.next()).payload.toString('utf8')).code).toBe('protocol')
    expect((await future.next()).payload.readUInt16BE(0)).toBe(4001)
    await future.closed()
    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))

    const other = await openRawClient(port)
    other.send(OPCODE.text, JSON.stringify({ type: 'hello', protocol: 1, universe: 16 }))
    expect(JSON.parse((await other.next()).payload.toString('utf8')).code).toBe('universe')
    expect((await other.next()).payload.readUInt16BE(0)).toBe(4002)
  })
})

describe('pont : WebSocket → Art-Net (UDP)', () => {
  it('convertit chaque trame en paquet ArtDMX', async () => {
    await startBridge()
    const client = await connectReady()
    client.send(OPCODE.binary, frameBytes(42))
    const [packet] = await receiver.waitFor(1)
    expect(packet!.subarray(0, 8).toString('latin1')).toBe('Art-Net\0')
    expect(packet!.readUInt16LE(8)).toBe(0x50_00)
    expect(packet!.readUInt16BE(10)).toBe(14)
    expect(packet![12]).toBe(1)
    expect(packet!.readUInt16BE(16)).toBe(512)
    expect(packet![18]).toBe(42)
    expect(packet![529]).toBe(42)
  })

  it('répartit l’univers interne selon le mappage', async () => {
    await startBridge([parseMappingSpec('1-72:0.0.1@1'), parseMappingSpec('128-148:0.0.2@1')])
    const client = await connectReady()
    const frame = frameBytes(0)
    frame[3] = 11 // canal 1
    frame[3 + 127] = 128 // canal 128
    client.send(OPCODE.binary, frame)
    const packets = await receiver.waitFor(2)
    const byUniverse = new Map(packets.map((packet) => [packet[14], packet]))
    expect(byUniverse.get(1)![18]).toBe(11)
    expect(byUniverse.get(2)![18]).toBe(128)
    expect(byUniverse.get(1)![12]).toBe(1)
    expect(byUniverse.get(2)![12]).toBe(1)
  })

  it('envoie du noir quand l’écran de salle se déconnecte', async () => {
    await startBridge()
    const client = await connectReady()
    client.send(OPCODE.binary, frameBytes(255))
    await receiver.waitFor(1)
    client.socket.destroy()
    await vi.waitFor(() => {
      const last = receiver.packets.at(-1)!
      expect(last[18]).toBe(0)
    })
    expect(logs.some((line) => line.includes('navigateur déconnecté'))).toBe(true)
  })

  it('envoie du noir quand le navigateur se tait', async () => {
    await startBridge(defaultMappings(), { silenceTimeoutMs: 200 })
    const client = await connectReady()
    client.send(OPCODE.binary, frameBytes(200))
    await receiver.waitFor(1)
    await vi.waitFor(() => expect(receiver.packets.some((packet) => packet[18] === 0)).toBe(true), {
      timeout: 2000,
    })
    expect(logs.some((line) => line.includes('plus aucune trame'))).toBe(true)
  })

  it('ferme la connexion sur une trame invalide', async () => {
    await startBridge()
    const client = await connectReady()
    client.send(OPCODE.binary, frameBytes(1, 0, 2))
    expect(JSON.parse((await client.next()).payload.toString('utf8')).code).toBe('frame')
    expect((await client.next()).payload.readUInt16BE(0)).toBe(4003)

    await client.closed()
    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    const wrong = await connectReady()
    wrong.send(OPCODE.binary, frameBytes(1, 16))
    expect(JSON.parse((await wrong.next()).payload.toString('utf8')).code).toBe('universe')
  })

  it('ignore les messages texte après le hello', async () => {
    await startBridge()
    const client = await connectReady()
    client.send(OPCODE.text, 'bonjour')
    client.send(OPCODE.binary, frameBytes(5))
    const [packet] = await receiver.waitFor(1)
    expect(packet![18]).toBe(5)
  })

  it('envoie du noir à l’arrêt du pont', async () => {
    await startBridge()
    const client = await connectReady()
    client.send(OPCODE.binary, frameBytes(99))
    await receiver.waitFor(1)
    await bridge.close()
    await vi.waitFor(() => expect(receiver.packets.at(-1)![18]).toBe(0))
    await client.closed()
  })
})

describe('pont : trames WebSocket', () => {
  it('répond aux ping et réassemble un message fragmenté', async () => {
    await startBridge()
    const client = await openRawClient(port)
    client.send(OPCODE.ping, 'coucou')
    const pong = await client.next()
    expect(pong.opcode).toBe(OPCODE.pong)
    expect(pong.payload.toString()).toBe('coucou')
    client.send(OPCODE.pong, '')
    const half = Math.floor(HELLO.length / 2)
    client.send(OPCODE.text, HELLO.slice(0, half), { fin: false })
    client.send(OPCODE.ping, 'x')
    client.send(OPCODE.continuation, HELLO.slice(half))
    expect((await client.next()).opcode).toBe(OPCODE.pong)
    expect(JSON.parse((await client.next()).payload.toString()).type).toBe('ack')
    const frame = frameBytes(77)
    client.send(OPCODE.binary, frame.subarray(0, 200), { fin: false })
    client.send(OPCODE.continuation, frame.subarray(200))
    const [packet] = await receiver.waitFor(1)
    expect(packet![18]).toBe(77)
  })

  it('accepte des trames découpées en plusieurs paquets TCP', async () => {
    await startBridge()
    const client = await openRawClient(port)
    const bytes = encodeClientFrame(OPCODE.text, Buffer.from(HELLO))
    for (const byte of bytes) {
      client.sendRaw(Buffer.from([byte]))
    }
    expect(JSON.parse((await client.next()).payload.toString()).type).toBe('ack')
    const binary = encodeClientFrame(OPCODE.binary, frameBytes(3))
    client.sendRaw(binary.subarray(0, 3))
    await new Promise((resolve) => setTimeout(resolve, 10))
    client.sendRaw(binary.subarray(3))
    const [packet] = await receiver.waitFor(1)
    expect(packet![18]).toBe(3)
  })

  const expectClose = async (client: RawClient, code: number) => {
    const close = await client.next()
    expect(close.opcode).toBe(OPCODE.close)
    expect(close.payload.readUInt16BE(0)).toBe(code)
    // Comme un navigateur : on acquitte la fermeture en fermant notre côté.
    client.socket.end()
    await client.closed()
  }

  it('ferme en 1002 sur une trame non masquée, réservée ou un fragment inattendu', async () => {
    await startBridge()
    const unmasked = await openRawClient(port)
    unmasked.send(OPCODE.text, HELLO, { mask: false })
    await expectClose(unmasked, 1002)

    for (const bytes of [
      Buffer.from([0x80 | 0x40 | OPCODE.text, 0x80, 0, 0, 0, 0]),
      Buffer.from([0x80 | 0x3, 0x80, 0, 0, 0, 0]),
      Buffer.from([0x80 | 0xb, 0x80, 0, 0, 0, 0]),
      Buffer.from([OPCODE.ping, 0x80, 0, 0, 0, 0]),
      encodeClientFrame(OPCODE.continuation, Buffer.from('x')),
      Buffer.concat([
        encodeClientFrame(OPCODE.text, Buffer.from('a'), { fin: false }),
        encodeClientFrame(OPCODE.text, Buffer.from('b')),
      ]),
    ]) {
      await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
      const client = await openRawClient(port)
      client.sendRaw(bytes)
      await expectClose(client, 1002)
    }
  })

  it('ferme en 1009 sur un message trop long et en 1007 sur un texte non UTF-8', async () => {
    await startBridge()
    const big = await openRawClient(port)
    big.send(OPCODE.binary, new Uint8Array(70_000))
    await expectClose(big, 1009)

    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    const fragmented = await openRawClient(port)
    fragmented.send(OPCODE.binary, new Uint8Array(400), { fin: false })
    fragmented.send(OPCODE.continuation, new Uint8Array(400), { fin: false })
    await expectClose(fragmented, 1009)

    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    const invalid = await openRawClient(port)
    invalid.send(OPCODE.text, Buffer.from([0xff, 0xfe]))
    await expectClose(invalid, 1007)
  })

  it('renvoie la fermeture du client avec son code', async () => {
    await startBridge()
    const client = await connectReady()
    const payload = Buffer.concat([Buffer.from([0x0f, 0xa0]), Buffer.from('au revoir')])
    client.send(OPCODE.close, payload)
    const echo = await client.next()
    expect(echo.opcode).toBe(OPCODE.close)
    expect(echo.payload.readUInt16BE(0)).toBe(4000)
    await client.closed()
    expect(logs.some((line) => line.includes('déconnecté (code 4000)'))).toBe(true)

    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    const strange = await openRawClient(port)
    strange.send(OPCODE.close, Buffer.from([0x03, 0xed]))
    expect((await strange.next()).payload.readUInt16BE(0)).toBe(1000)

    await vi.waitFor(() => expect(bridge.hasClient()).toBe(false))
    const empty = await openRawClient(port)
    empty.send(OPCODE.close, Buffer.alloc(0))
    expect((await empty.next()).opcode).toBe(OPCODE.close)
  })

  it('ferme une connexion qui ne se présente pas', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await startBridge()
      const client = await openRawClient(port)
      vi.advanceTimersByTime(2000)
      expect(JSON.parse((await client.next()).payload.toString()).message).toContain(
        'aucune présentation'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('fonctionne avec le client WebSocket de Node (undici)', async () => {
    await startBridge()
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { Origin: ORIGIN },
    } as unknown as string[])
    socket.binaryType = 'arraybuffer'
    const ack = await new Promise<string>((resolve, reject) => {
      socket.addEventListener('open', () => socket.send(HELLO))
      socket.addEventListener('message', (event) => resolve(String(event.data)))
      socket.addEventListener('error', () => reject(new Error('connexion refusée')))
    })
    expect(JSON.parse(ack).type).toBe('ack')
    socket.send(frameBytes(64))
    const [packet] = await receiver.waitFor(1)
    expect(packet![18]).toBe(64)
    socket.close()
  })
})

describe('origines', () => {
  it('normalise les origines http(s)', () => {
    expect(normalizeOrigin('https://Salle.QuizzUp.fr/')).toBe('https://salle.quizzup.fr')
    expect(normalizeOrigin('http://localhost:4174')).toBe('http://localhost:4174')
    expect(normalizeOrigin('https://salle.quizzup.fr:443')).toBe('https://salle.quizzup.fr')
    expect(normalizeOrigin('null')).toBeNull()
    expect(normalizeOrigin('file:///C:/salle.html')).toBeNull()
  })
})
