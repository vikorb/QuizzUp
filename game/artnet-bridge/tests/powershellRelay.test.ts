import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { connect as tcpConnect, createServer } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
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
/**
 * Attente d'une trame ou d'un paquet qui DOIT arriver. Le relais est un processus PowerShell à
 * boucle unique : sur un poste chargé (runner de CI), un démarrage à froid ou une pause peut dépasser
 * les 2 s par défaut des helpers sans que le relais soit en défaut. Un succès ne dépend pas de cette
 * valeur ; seul un vrai blocage la atteint, et le test échoue alors avant son propre délai de 60 s.
 */
const EXPECTED_TIMEOUT_MS = 20_000
const ZEROS = new Uint8Array(512)
const ADDRESS_0 = { net: 0, subnet: 0, universe: 0 }

/** Univers annoncés dans l'ack : ce que le test de débit ci-dessous garantit à 40 Hz. */
const ANNOUNCED_UNIVERSES = 4

/** L'ack du pont, avec ce que le relais change : ni poll ni hold, 4 univers annoncés. */
const relayAck = (version: string, artnet: Parameters<typeof ackMessage>[1]) =>
  ackMessage(version, artnet)
    .replace('"features":["poll","hold"]', '"features":[]')
    .replace('"universes":16', `"universes":${ANNOUNCED_UNIVERSES}`)

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

/** Faux nœud Art-Net dont l'attente de paquets suit `EXPECTED_TIMEOUT_MS`. */
async function openReceiver(): Promise<UdpReceiver> {
  const receiver = await openUdpReceiver()
  const waitFor = receiver.waitFor
  receiver.waitFor = (count, timeoutMs = EXPECTED_TIMEOUT_MS) => waitFor(count, timeoutMs)
  return receiver
}

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

/**
 * Lance le relais sur un port libre, vers un faux nœud UDP ; rend la main quand il écoute. Le port est
 * libéré avant que le relais ne le prenne : si un autre processus l'a pris entre-temps, nouvel essai.
 */
async function startRelay(options: StartOptions = {}): Promise<Relay> {
  const receiver = await openReceiver()
  for (let attempt = 1; ; attempt += 1) {
    const port = await freePort()
    try {
      return await launchRelay(receiver, port, options)
    } catch (error) {
      if (attempt >= 3 || !String(error).includes(`le port ${port} est`)) {
        throw error
      }
    }
  }
}

async function launchRelay(
  receiver: UdpReceiver,
  port: number,
  { args = [], origin = 'arg' }: StartOptions
): Promise<Relay> {
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
  const next = client.next
  client.next = (timeoutMs = EXPECTED_TIMEOUT_MS) => next(timeoutMs)
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
        relayAck(version, { target: null, port: relay.receiver.port, source: 'none' })
      )
      client.socket.destroy()
    })

    it('hello v2 : la cible de la salle est appliquée et renvoyée dans l’ack', async () => {
      const relay = await startRelay()
      const client = await connect(relay, helloV2('127.0.0.1'))
      const raw = text(await client.next())
      const { version } = JSON.parse(raw) as { version: string }
      expect(raw).toBe(
        relayAck(version, { target: '127.0.0.1', port: relay.receiver.port, source: 'room' })
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

    it('après une coupure nette, la reconnexion immédiate n’est pas refusée « busy »', async () => {
      const relay = await startRelay()
      for (let round = 0; round < 5; round += 1) {
        const client = await connect(relay, helloV1)
        expect(JSON.parse(text(await client.next())).type).toBe('ack')
        client.socket.destroy()
      }
    })

    it('aucune présentation en 2 s : error « hello » puis 4000', async () => {
      const relay = await startRelay()
      const client = await connect(relay, null)
      expect(text(await client.next())).toBe(errorMessage('hello', 'aucune présentation reçue'))
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
      [
        'trame pour l’univers 256 (octet de poids fort)',
        helloV1,
        browserFrame(256),
        CLOSE_CODES.universe,
        'universe',
        "trame pour l'univers 256 (univers 0 à 15)",
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
      'n’écoute pas sur les autres adresses du PC : la connexion elle-même est refusée',
      async () => {
        // Une écoute sur toutes les cartes (HTTP.sys) accepterait la connexion, même pour la refuser ensuite.
        const outcome = await new Promise<string>((resolve) => {
          const socket = tcpConnect(relay.port, lanAddress!)
          socket.setTimeout(3000, () => {
            socket.destroy()
            resolve('sans réponse')
          })
          socket.once('connect', () => {
            socket.destroy()
            resolve('connecté')
          })
          socket.once('error', () => resolve('refusé'))
        })
        expect(outcome).not.toBe('connecté')
        // La boucle locale, elle, répond : sinon ce refus ne prouverait rien.
        const local = await openRawClient(relay.port)
        expect(local.status).toBe(101)
        local.socket.destroy()
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

/** Envoie `universes` univers à `hz` Hz pendant `durationMs`, sur un calendrier fixe (pas de dérive). */
async function stream(
  client: RawClient,
  {
    universes,
    hz,
    durationMs,
    onFrame,
  }: {
    universes: number
    hz: number
    durationMs: number
    onFrame?: (universe: number, counter: number, at: number) => void
  }
) {
  const start = performance.now()
  const period = 1000 / hz
  let counter = 0
  while (performance.now() - start < durationMs) {
    counter += 1
    for (let universe = 0; universe < universes; universe += 1) {
      const frame = browserFrame(universe, 1)
      new DataView(frame.buffer).setUint32(3, counter) // canaux 0 à 3 : numéro de la trame
      onFrame?.(universe, counter, performance.now())
      client.send(OPCODE.binary, frame)
    }
    await sleep(Math.max(0, start + counter * period - performance.now()))
  }
  return counter
}

describe.skipIf(process.platform !== 'win32')(
  'relais PowerShell : cadence',
  { timeout: 60_000 },
  () => {
    afterEach(stopAll)

    it('tient 4 univers à 40 Hz pendant 5 s : aucun retard qui s’accumule', async () => {
      const relay = await startRelay()
      const client = await connect(relay, helloV2('127.0.0.1'))
      await client.next()
      const sentAt = new Map<string, number>()
      const last = await stream(client, {
        universes: ANNOUNCED_UNIVERSES,
        hz: 40,
        durationMs: 5000,
        onFrame: (universe, counter, at) => sentAt.set(`${universe}:${counter}`, at),
      })
      await sleep(300)
      // Retard = arrivée du premier paquet portant ce numéro de trame - envoi de la trame.
      const lags: number[] = []
      const delivered = new Set<string>()
      relay.receiver.packets.forEach((packet, index) => {
        const key = `${packet.readUInt8(14) & 0x0f}:${packet.readUInt32BE(18)}`
        if (!delivered.has(key) && sentAt.has(key)) {
          delivered.add(key)
          lags.push(relay.receiver.times[index]! - sentAt.get(key)!)
        }
      })
      const worst = Math.max(...lags)
      // Mesuré sur ce poste : 33 à 50 ms au pire (l'ancienne écoute par HttpListener : 6 s, en
      // croissance). Seuil 250 ms = marge x5 pour un runner de CI partagé ; il reste très loin de
      // l'ancien comportement.
      expect(worst).toBeLessThan(250)
      for (let universe = 0; universe < ANNOUNCED_UNIVERSES; universe += 1) {
        // Les trames trop rapprochées sont fusionnées (une émission toutes les 22 ms au plus) : on
        // vérifie qu'une bonne part passe, et que la dernière trame de chaque univers est arrivée.
        const count = [...delivered].filter((key) => key.startsWith(`${universe}:`)).length
        expect(count).toBeGreaterThan(last * 0.5)
        expect(delivered.has(`${universe}:${last}`)).toBe(true)
      }
      client.socket.destroy()
    })

    it('coupure nette en pleine charge : plus aucune trame non nulle au-delà de 300 ms', async () => {
      const relay = await startRelay({ args: ['-Blackout', '500'] })
      const client = await connect(relay, helloV2('127.0.0.1'))
      await client.next()
      await stream(client, { universes: ANNOUNCED_UNIVERSES, hz: 40, durationMs: 1500 })
      const cutAt = performance.now()
      client.socket.destroy()
      await sleep(1500) // couvre le noir (500 ms) et le silence qui suit
      const nonZero = relay.receiver.times.filter((_time, index) =>
        relay.receiver.packets[index]!.subarray(18).some((byte) => byte !== 0)
      )
      // Le noir part dès que la coupure est vue (quelques ms) ; 300 ms de marge pour un runner lent.
      expect(Math.max(...nonZero)).toBeLessThan(cutAt + 300)
      const zeros = relay.receiver.times.filter(
        (time, index) =>
          time > cutAt && relay.receiver.packets[index]!.subarray(18).every((byte) => byte === 0)
      )
      expect(zeros.length).toBeGreaterThanOrEqual(ANNOUNCED_UNIVERSES)
    })
  }
)

describe.skipIf(process.platform !== 'win32')(
  'relais PowerShell : fermeture de la fenêtre',
  { timeout: 60_000 },
  () => {
    afterEach(stopAll)

    it('le gestionnaire de console est installé au démarrage (sinon un avertissement le dit)', async () => {
      const relay = await startRelay()
      // La console écrit en page de code OEM : on ne compare que la partie ASCII.
      expect(relay.output()).toMatch(/fermeture de la fen.tre.*noir/i)
      expect(relay.output()).not.toContain('PAS')
    })

    it('SendBlack : trames à zéro, séquence 0, sur chaque sortie connue, en trois passes', async () => {
      // On compile le vrai C# du script (le gestionnaire de fermeture n'appelle que ça) : la fermeture
      // d'une vraie fenêtre ne se simule pas depuis un test.
      const source = /\$blackSource = @'\r?\n([\s\S]*?)\r?\n'@/.exec(
        readFileSync(SCRIPT, 'utf8')
      )![1]!
      const dir = mkdtempSync(join(tmpdir(), 'quizzup-noir-'))
      const sourceFile = join(dir, 'noir.cs')
      writeFileSync(sourceFile, '\ufeff' + source, 'utf8')
      const harness = join(dir, 'noir.ps1')
      writeFileSync(
        harness,
        [
          'param([string]$Source, [int]$Port)',
          'Add-Type -TypeDefinition (Get-Content -Raw -Encoding UTF8 $Source)',
          '[QuizzUpBlack]::Udp = New-Object System.Net.Sockets.UdpClient',
          '[QuizzUpBlack]::Target = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Loopback, $Port)',
          '[QuizzUpBlack]::AddOutput(0, 0, 5)',
          '[QuizzUpBlack]::AddOutput(0, 1, 4)',
          '[QuizzUpBlack]::SendBlack()',
        ].join('\r\n'),
        'utf8'
      )
      const receiver = await openReceiver()
      try {
        const run = spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            harness,
            '-Source',
            sourceFile,
            '-Port',
            String(receiver.port),
          ],
          { encoding: 'utf8' }
        )
        expect(run.status, run.stdout + run.stderr).toBe(0)
        const packets = await receiver.waitFor(6)
        const expected = [5, 20].map((number) =>
          encodeArtDmx({ sequence: 0, address: portAddressFromNumber(number), data: ZEROS })
        )
        expect(packets).toHaveLength(6)
        for (const pass of [0, 1, 2]) {
          expect(packets[pass * 2]!.equals(expected[0]!)).toBe(true)
          expect(packets[pass * 2 + 1]!.equals(expected[1]!)).toBe(true)
        }
      } finally {
        await receiver.close()
      }
    })
  }
)
