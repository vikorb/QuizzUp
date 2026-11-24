import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'

import { encodeArtDmx, portAddressFromNumber } from '@bridge/artnet'
import {
  ackMessage,
  BUSY_MESSAGE,
  checkArtnetRequest,
  CLOSE_CODES,
  errorMessage,
} from '@bridge/protocol'

import type { RawClient, UdpReceiver } from './_helpers/rawClient'
import { OPCODE, openRawClient, openUdpReceiver } from './_helpers/rawClient'

/**
 * Le vrai script `powershell/quizzup-lumieres.ps1`, lancé avec Windows PowerShell 5.1, face à un vrai
 * WebSocket et un vrai socket UDP local. Il parle le même protocole que le pont : les attendus sont
 * produits par le code TypeScript du pont (`protocol.ts`, `artnet.ts`).
 */
const SCRIPT = fileURLToPath(new URL('../powershell/quizzup-lumieres.ps1', import.meta.url))
const ORIGIN = 'https://salle.quizzup.fr'
const MARKER_TIMEOUT_MS = 30_000
const ZEROS = new Uint8Array(512)
const ADDRESS_0 = { net: 0, subnet: 0, universe: 0 }

const helloV1 = JSON.stringify({ type: 'hello', protocol: 1, universe: 0 })
const helloV2 = (target: unknown) =>
  JSON.stringify({ type: 'hello', protocol: 1, version: 2, universe: 0, artnet: { target } })

/** Trame du navigateur : version 1, univers sur 2 octets, puis 512 canaux (valeurs reconnaissables). */
const browserFrame = (universe = 0, seed = 1) => {
  const bytes = new Uint8Array(515)
  bytes[0] = 1
  bytes[1] = universe >> 8
  bytes[2] = universe & 0xff
  for (let channel = 0; channel < 512; channel += 1) {
    bytes[3 + channel] = (channel * 7 + universe + seed) & 0xff
  }
  return bytes
}

type Relay = { pid: number; port: number; receiver: UdpReceiver; output: () => string }

const running: { pid: number; receiver: UdpReceiver }[] = []

async function stopAll() {
  for (const entry of running.splice(0)) {
    // Seulement le processus lancé ici, par son PID (jamais par nom).
    spawnSync('taskkill', ['/PID', String(entry.pid), '/T', '/F'], { stdio: 'ignore' })
    await entry.receiver.close()
  }
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })

type StartOptions = { args?: string[]; origin?: 'arg' | 'env' | 'none' }

const powershellArgs = (relayArgs: string[]) => [
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  SCRIPT,
  ...relayArgs,
]

/** Lance le relais sur un port libre, vers un faux nœud UDP ; rend la main quand il écoute. */
async function startRelay({ args = [], origin = 'arg' }: StartOptions = {}): Promise<Relay> {
  const receiver = await openUdpReceiver()
  const port = await freePort()
  const env = { ...process.env, QUIZZUP_BRIDGE_ORIGINS: origin === 'env' ? ORIGIN : '' }
  const child = spawn(
    'powershell.exe',
    powershellArgs([
      '-Port',
      String(port),
      '-ArtnetPort',
      String(receiver.port),
      '-Bind',
      '127.0.0.1',
      ...(origin === 'arg' ? ['-Origin', ORIGIN] : []),
      ...args,
    ]),
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env }
  )
  running.push({ pid: child.pid!, receiver })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
  const relay: Relay = { pid: child.pid!, port, receiver, output: () => output }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`relais pas prêt après ${MARKER_TIMEOUT_MS} ms : ${output}`)),
      MARKER_TIMEOUT_MS
    )
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`relais arrêté (code ${code}) : ${output}`))
    })
    child.stdout.on('data', () => {
      if (output.includes(`ws://127.0.0.1:${port}`)) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
  return relay
}

/** Lance le script jusqu'à sa fin (réglage refusé) : code de sortie et texte affiché. */
function runToEnd(
  relayArgs: string[],
  origin = ''
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', powershellArgs(relayArgs), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, QUIZZUP_BRIDGE_ORIGINS: origin },
    })
    running.push({ pid: child.pid!, receiver: { close: () => Promise.resolve() } as UdpReceiver })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
    child.once('exit', (code) => resolve({ code, output }))
  })
}

const text = (frame: { payload: Buffer }) => frame.payload.toString('utf8')

async function connect(relay: Relay, hello: string | null, headers = {}): Promise<RawClient> {
  const client = await openRawClient(relay.port, headers)
  expect(client.status).toBe(101)
  if (hello !== null) {
    client.send(OPCODE.text, hello)
  }
  return client
}

/** Réponse à la fermeture du serveur (comme un navigateur), puis attente de la fin de la connexion. */
async function finish(client: RawClient, code = 1000) {
  client.send(OPCODE.close, Buffer.from([code >> 8, code & 0xff]))
  await client.closed()
}

const closeInfo = (frame: { opcode: number; payload: Buffer }) => ({
  opcode: frame.opcode,
  code: frame.payload.readUInt16BE(0),
  reason: frame.payload.subarray(2).toString('utf8'),
})

const expectedPacket = (sequence: number, frame: Uint8Array, universeNumber = 0) =>
  encodeArtDmx({
    sequence,
    address: portAddressFromNumber(universeNumber),
    data: frame.subarray(3),
  })

const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address

describe.skipIf(process.platform !== 'win32')('relais PowerShell : script', () => {
  it('est enregistré en UTF-8 avec BOM (PowerShell 5.1 en a besoin pour les accents)', () => {
    const head = readFileSync(SCRIPT).subarray(0, 3)
    expect([...head]).toEqual([0xef, 0xbb, 0xbf])
  })
})

describe.skipIf(process.platform !== 'win32')(
  'relais PowerShell : réglages',
  { timeout: 60_000 },
  () => {
    afterEach(stopAll)

    it('exige une origine (ni -Origin ni QUIZZUP_BRIDGE_ORIGINS)', async () => {
      const result = await runToEnd([])
      expect(result.code).toBe(1)
      expect(result.output).toContain('Erreur')
      expect(result.output).toContain('-Origin')
    })

    it('refuse une cible qui n’est pas une IPv4 et un port hors bornes', async () => {
      const badTarget = await runToEnd(['-Origin', ORIGIN, '-Target', '999.1.1.1'])
      expect(badTarget.code).toBe(1)
      expect(badTarget.output).toContain('-Target')
      const badPort = await runToEnd(['-Origin', ORIGIN, '-Port', '70000'])
      expect(badPort.code).toBe(1)
      expect(badPort.output).toContain('-Port')
    })

    it('lit les origines dans QUIZZUP_BRIDGE_ORIGINS et répond 426 hors WebSocket', async () => {
      const relay = await startRelay({ origin: 'env' })
      const status = await new Promise<number>((resolve) => {
        request({ host: '127.0.0.1', port: relay.port, path: '/' }, (response) => {
          response.resume()
          resolve(response.statusCode ?? 0)
        }).end()
      })
      expect(status).toBe(426)
      const client = await connect(relay, helloV1)
      expect(JSON.parse(text(await client.next())).type).toBe('ack')
      client.socket.destroy()
    })

    it('refuse de démarrer si le port est déjà pris par un autre relais', async () => {
      const relay = await startRelay()
      const second = await runToEnd(['-Origin', ORIGIN, '-Port', String(relay.port)])
      expect(second.code).toBe(1)
      expect(second.output).toContain(String(relay.port))
    })
  }
)

describe.skipIf(process.platform !== 'win32')(
  'relais PowerShell : poignée de main et protocole',
  { timeout: 60_000 },
  () => {
    afterEach(stopAll)

    it('hello v1 : ack identique à celui du pont (sans poll ni hold), aucune cible', async () => {
      const relay = await startRelay()
      const client = await connect(relay, helloV1)
      const raw = text(await client.next())
      const { version } = JSON.parse(raw) as { version: string }
      expect(typeof version).toBe('string')
      expect(raw).toBe(
        ackMessage(version, { target: null, port: relay.receiver.port, source: 'none' }).replace(
          '"features":["poll","hold"]',
          '"features":[]'
        )
      )
      client.socket.destroy()
    })

    it('hello v2 : la cible de la salle est appliquée et renvoyée dans l’ack', async () => {
      const relay = await startRelay()
      const client = await connect(relay, helloV2('127.0.0.1'))
      const raw = text(await client.next())
      const { version } = JSON.parse(raw) as { version: string }
      expect(raw).toBe(
        ackMessage(version, {
          target: '127.0.0.1',
          port: relay.receiver.port,
          source: 'room',
        }).replace('"features":["poll","hold"]', '"features":[]')
      )
      client.socket.destroy()
    })

    it('-Target prime sur la cible de la salle', async () => {
      const relay = await startRelay({ args: ['-Target', '127.0.0.1'] })
      const client = await connect(relay, helloV2('10.9.8.7'))
      const ack = JSON.parse(text(await client.next())) as { artnet: unknown }
      expect(ack.artnet).toEqual({ target: '127.0.0.1', port: relay.receiver.port, source: 'cli' })
      const frame = browserFrame()
      client.send(OPCODE.binary, frame)
      const [packet] = await relay.receiver.waitFor(1)
      expect(packet!.equals(expectedPacket(1, frame))).toBe(true)
      client.socket.destroy()
    })

    it('trames relayées : paquets ArtDMX identiques octet par octet, séquence comprise', async () => {
      const relay = await startRelay()
      const client = await connect(relay, helloV2('127.0.0.1'))
      await client.next()
      const first = browserFrame(0, 1)
      client.send(OPCODE.binary, first)
      expect((await relay.receiver.waitFor(1))[0]!.equals(expectedPacket(1, first))).toBe(true)
      const second = browserFrame(0, 2)
      client.send(OPCODE.binary, second)
      const packets = await relay.receiver.waitFor(2)
      expect(packets[1]!.equals(expectedPacket(2, second))).toBe(true)
      client.socket.destroy()
    })

    it('univers internes 0 à 15 : chacun sort sur son univers Art-Net (-Universe + n)', async () => {
      const relay = await startRelay({ args: ['-Universe', '0.0.5'] })
      const client = await connect(relay, helloV2('127.0.0.1'))
      await client.next()
      const universes = [0, 1, 7, 15]
      const frames = universes.map((universe) => browserFrame(universe, 3))
      for (const frame of frames) {
        client.send(OPCODE.binary, frame)
      }
      const packets = await relay.receiver.waitFor(universes.length)
      universes.forEach((universe, index) => {
        // Univers 15 : 0.0.5 + 15 = 20 = 0.1.4.
        expect(
          packets.some((packet) => packet.equals(expectedPacket(1, frames[index]!, 5 + universe)))
        ).toBe(true)
      })
      client.socket.destroy()
    })

    it('cible hors réseau local : refusée (4005), rien n’est envoyé', async () => {
      const relay = await startRelay()
      const client = await connect(relay, helloV2('8.8.8.8'))
      const message = (checkArtnetRequest({ target: '8.8.8.8' }) as { message: string }).message
      expect(text(await client.next())).toBe(errorMessage('target', message))
      const close = closeInfo(await client.next())
      expect(close.code).toBe(CLOSE_CODES.target)
      expect(message.startsWith(close.reason)).toBe(true)
      await finish(client, close.code)
      expect(relay.receiver.packets).toHaveLength(0)
    })

    it('un seul écran de salle à la fois : le second reçoit « busy » puis 4004', async () => {
      const relay = await startRelay()
      const first = await connect(relay, helloV1)
      await first.next()
      const second = await connect(relay, null)
      expect(text(await second.next())).toBe(errorMessage('busy', BUSY_MESSAGE))
      expect(closeInfo(await second.next())).toMatchObject({
        code: CLOSE_CODES.busy,
        reason: BUSY_MESSAGE,
      })
      await finish(second, CLOSE_CODES.busy)
      // Le premier écran n'est pas dérangé.
      first.send(OPCODE.ping, 'ok')
      expect((await first.next()).opcode).toBe(OPCODE.pong)
      first.socket.destroy()
    })

    it('aucune présentation en 2 s : error « hello » puis 4000', async () => {
      const relay = await startRelay()
      const client = await connect(relay, null)
      expect(text(await client.next(8000))).toBe(errorMessage('hello', 'aucune présentation reçue'))
      expect(closeInfo(await client.next())).toMatchObject({ code: CLOSE_CODES.helloExpected })
      await finish(client, CLOSE_CODES.helloExpected)
    })
  }
)

describe.skipIf(process.platform !== 'win32')(
  'relais PowerShell : refus (un même relais)',
  { timeout: 60_000 },
  () => {
    let relay: Relay
    beforeAll(async () => {
      relay = await startRelay()
    }, 60_000)
    afterAll(stopAll)

    const refusals: [string, string | null, Uint8Array | null, number, string, string][] = [
      [
        'trame avant le hello',
        null,
        browserFrame(),
        CLOSE_CODES.helloExpected,
        'hello',
        'présentation (hello) attendue en premier',
      ],
      [
        'protocole 2',
        JSON.stringify({ type: 'hello', protocol: 2, universe: 0 }),
        null,
        CLOSE_CODES.protocol,
        'protocol',
        'protocole 2 non géré (pont en protocole 1)',
      ],
      [
        'univers du hello hors 0-15',
        JSON.stringify({ type: 'hello', protocol: 1, universe: 16 }),
        null,
        CLOSE_CODES.universe,
        'universe',
        'univers interne 16 non géré (univers 0 à 15)',
      ],
      [
        'cible qui n’est pas une IPv4',
        helloV2('pas une ip'),
        null,
        CLOSE_CODES.target,
        'target',
        'cible Art-Net « pas une ip » : adresse IPv4 attendue',
      ],
      [
        'trame de mauvaise taille',
        helloV1,
        new Uint8Array(100),
        CLOSE_CODES.badFrame,
        'frame',
        'trame de 100 octets, attendu 515',
      ],
      [
        'trame en version 2',
        helloV1,
        Uint8Array.from(browserFrame(), (byte, index) => (index === 0 ? 2 : byte)),
        CLOSE_CODES.badFrame,
        'frame',
        'trame en version 2, attendu 1',
      ],
      [
        'trame pour l’univers 16',
        helloV1,
        browserFrame(16),
        CLOSE_CODES.universe,
        'universe',
        "trame pour l'univers 16 (univers 0 à 15)",
      ],
    ]

    it.each(refusals)('%s', async (_name, hello, binary, code, kind, message) => {
      const client = await connect(relay, hello)
      if (hello !== null && binary !== null) {
        expect(JSON.parse(text(await client.next())).type).toBe('ack')
      }
      if (binary) {
        client.send(OPCODE.binary, binary)
      }
      expect(text(await client.next())).toBe(errorMessage(kind, message))
      const close = closeInfo(await client.next())
      expect(close.code).toBe(code)
      expect(close.reason).toBe(message)
      await finish(client, code)
    })

    it('origine refusée (403) : autre origine ou en-tête absent', async () => {
      const other = await openRawClient(relay.port, { Origin: 'https://evil.example' })
      expect(other.status).toBe(403)
      const none = await openRawClient(relay.port, { Origin: undefined })
      expect(none.status).toBe(403)
    })

    it('hôte étranger refusé (protection contre le DNS rebinding)', async () => {
      const client = await openRawClient(relay.port, { Host: `evil.example:${relay.port}` })
      expect(client.status).not.toBe(101)
    })

    it.skipIf(!lanAddress)(
      'refuse une demande qui arrive par une autre adresse du PC',
      async () => {
        const status = await new Promise<string>((resolve) => {
          const call = request({
            host: lanAddress,
            port: relay.port,
            headers: {
              Host: `localhost:${relay.port}`,
              Connection: 'Upgrade',
              Upgrade: 'websocket',
              'Sec-WebSocket-Version': '13',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              Origin: ORIGIN,
            },
          })
          call.on('upgrade', (_response, socket) => {
            socket.destroy()
            resolve('upgrade')
          })
          call.on('response', (response) => {
            response.resume()
            resolve(String(response.statusCode))
          })
          call.on('error', () => resolve('erreur'))
          call.end()
        })
        expect(status).not.toBe('upgrade')
      }
    )
  }
)

describe.skipIf(process.platform !== 'win32')(
  'relais PowerShell : chien de garde',
  { timeout: 60_000 },
  () => {
    afterEach(stopAll)

    const expectZeros = (packet: Buffer | undefined, sequence: number) =>
      expect(packet!.equals(encodeArtDmx({ sequence, address: ADDRESS_0, data: ZEROS }))).toBe(true)

    it('fermeture du navigateur : trames à zéro (toutes les 100 ms) pendant -Blackout, puis silence', async () => {
      const relay = await startRelay({ args: ['-Blackout', '500'] })
      const client = await connect(relay, helloV2('127.0.0.1'))
      await client.next()
      client.send(OPCODE.binary, browserFrame())
      await relay.receiver.waitFor(1)
      await finish(client, 1000)
      const packets = await relay.receiver.waitFor(4)
      expectZeros(packets[1], 2)
      expectZeros(packets[2], 3)
      expectZeros(packets[3], 4)
      // La console écrit en page de code OEM : on ne compare que la partie ASCII.
      expect(relay.output()).toMatch(/Coupure de s.curit./)
    })

    it('connexion coupée net : même noir', async () => {
      const relay = await startRelay({ args: ['-Blackout', '500'] })
      const client = await connect(relay, helloV2('127.0.0.1'))
      await client.next()
      client.send(OPCODE.binary, browserFrame())
      await relay.receiver.waitFor(1)
      client.socket.destroy()
      const packets = await relay.receiver.waitFor(3)
      expectZeros(packets[1], 2)
      expectZeros(packets[2], 3)
    })

    it('navigateur muet plus de -Timeout : noir, connexion gardée', async () => {
      const relay = await startRelay({ args: ['-Timeout', '200', '-Blackout', '500'] })
      const client = await connect(relay, helloV2('127.0.0.1'))
      await client.next()
      client.send(OPCODE.binary, browserFrame())
      const packets = await relay.receiver.waitFor(2)
      expectZeros(packets[1], 2)
      client.send(OPCODE.ping, 'ok')
      expect((await client.next()).opcode).toBe(OPCODE.pong)
      client.socket.destroy()
    })

    it('changement de cible : 3 trames à zéro partent d’abord vers l’ancienne', async () => {
      const relay = await startRelay()
      const first = await connect(relay, helloV2('127.0.0.1'))
      await first.next()
      first.send(OPCODE.binary, browserFrame())
      await relay.receiver.waitFor(1)
      await finish(first, 1000)
      // Nouvel écran de salle sans cible (hello v1) : l'ancienne cible reçoit du noir avant d'être oubliée.
      const second = await connect(relay, helloV1)
      expect(JSON.parse(text(await second.next())).artnet).toMatchObject({
        target: null,
        source: 'none',
      })
      const zeros = relay.receiver.packets.filter((packet) =>
        packet.subarray(18).every((byte) => byte === 0)
      )
      expect(zeros.length).toBeGreaterThanOrEqual(3)
      second.socket.destroy()
    })
  }
)
