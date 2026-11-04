import { parseRoomHardwareConfig } from '@hardware/config'
import {
  BRIDGE_CLOSE_TIMEOUT_MS,
  BRIDGE_FRAME_BYTES,
  BRIDGE_MAX_SKIPPED_FRAMES,
  BRIDGE_OPEN_TIMEOUT_MS,
  createBridgeOutput,
  DEFAULT_BRIDGE_URL,
  encodeBridgeFrame,
  parseBridgeUrl,
} from '@hardware/dmx/bridgeOutput'
import { DMX_DRIVERS } from '@hardware/dmx/output'
import { createUniverse } from '@hardware/dmx/universe'
import { createLightingController } from '@hardware/lighting/lightingController'

import type { FakeWebSocket } from '../_helpers/fakeWebSocket'
import { createFakeWebSocketClass } from '../_helpers/fakeWebSocket'
import { advanceAsync, createManualClock, flushPromises } from '../_helpers/manualClock'
import { lightingConfig } from '../_helpers/rig'

const ACK = { type: 'ack', protocol: 1, bridge: 'quizzup-artnet-bridge', version: '0.1.0' }

function setup(overrides: Partial<Parameters<typeof createBridgeOutput>[0]> = {}) {
  const fake = createFakeWebSocketClass()
  const clock = createManualClock()
  const output = createBridgeOutput({
    url: DEFAULT_BRIDGE_URL,
    WebSocketImpl: fake.WebSocketImpl,
    clock,
    ...overrides,
  })
  return { ...fake, clock, output }
}

/** Ouvre la sortie en jouant le rôle du pont : connexion, hello, ack. */
async function openWithAck(context: ReturnType<typeof setup>) {
  const opening = context.output.open()
  const socket = context.sockets.at(-1)!
  socket.serverOpen()
  socket.serverSend(ACK)
  await opening
  return socket
}

/** Comme un vrai navigateur : `close()` laisse la socket « en fermeture » jusqu'à `onclose`. */
function closeLikeBrowser(socket: FakeWebSocket) {
  Object.assign(socket, {
    close: (code?: number, reason?: string) => {
      Object.assign(socket, { closedWith: { code, reason } })
      Object.defineProperty(socket, 'readyState', { value: 2, configurable: true })
    },
  })
}

describe('format des trames du pont', () => {
  it('encode version, univers gros-boutiste puis les 512 canaux', () => {
    const universe = createUniverse()
    universe[0] = 11
    universe[511] = 255
    const frame = encodeBridgeFrame(universe, 0x01_02)
    expect(frame.length).toBe(515)
    expect(BRIDGE_FRAME_BYTES).toBe(515)
    expect([...frame.subarray(0, 4)]).toEqual([1, 0x01, 0x02, 11])
    expect(frame[514]).toBe(255)
  })

  it('complète un univers court avec des zéros et tronque un univers trop long', () => {
    expect(encodeBridgeFrame(new Uint8Array([5]))[3]).toBe(5)
    expect(encodeBridgeFrame(new Uint8Array([5]))[4]).toBe(0)
    expect(encodeBridgeFrame(new Uint8Array(600).fill(7)).length).toBe(515)
  })
})

describe('adresse du pont', () => {
  it('accepte uniquement ws:// vers la machine elle-même', () => {
    expect(parseBridgeUrl('ws://127.0.0.1:7654')).toBe('ws://127.0.0.1:7654')
    expect(parseBridgeUrl('ws://localhost:7654/')).toBe('ws://localhost:7654')
    expect(parseBridgeUrl('ws://localhost:1/dmx')).toBe('ws://localhost:1/dmx')
    expect(parseBridgeUrl('ws://localhost')).toBe('ws://localhost:80')
    expect(parseBridgeUrl('ws://127.0.0.1:65535')).toBe('ws://127.0.0.1:65535')
  })

  it('refuse les autres hôtes, protocoles, ports et identifiants', () => {
    for (const url of [
      'ws://192.168.1.10:7654',
      'wss://127.0.0.1:7654',
      'http://127.0.0.1:7654',
      'ws://127.0.0.1:0',
      'ws://127.0.0.1:65536',
      'ws://user:pass@127.0.0.1:7654',
      'ws://127.0.0.1.evil.fr:7654',
      'ws://[::1]:7654',
      'ws://',
      42,
      null,
    ]) {
      expect(parseBridgeUrl(url)).toBeNull()
    }
  })

  it('est validée par la config de salle', () => {
    expect(DMX_DRIVERS).toContain('artnet-bridge')
    const ok = parseRoomHardwareConfig({
      lighting: { driver: 'artnet-bridge', bridgeUrl: 'ws://localhost:9000' },
    })
    expect(ok.problems).toEqual([])
    expect(ok.config.lighting.driver).toBe('artnet-bridge')
    expect(ok.config.lighting.bridgeUrl).toBe('ws://localhost:9000')

    const bad = parseRoomHardwareConfig({
      lighting: { driver: 'artnet-bridge', bridgeUrl: 'ws://10.0.0.2:9000' },
    })
    expect(bad.config.lighting.bridgeUrl).toBeUndefined()
    expect(bad.problems).toEqual([expect.stringContaining('Adresse du pont Art-Net refusée')])

    expect(parseRoomHardwareConfig({ lighting: {} }).config.lighting).not.toHaveProperty(
      'bridgeUrl'
    )
  })
})

describe('sortie pont Art-Net : ouverture', () => {
  it('se présente au pont puis attend son accusé de réception', async () => {
    const context = setup()
    expect(context.output.driver).toBe('artnet-bridge')
    const opening = context.output.open()
    const socket = context.sockets[0]!
    expect(socket.url).toBe('ws://127.0.0.1:7654')
    expect(socket.binaryType).toBe('arraybuffer')
    socket.serverOpen()
    expect(JSON.parse(socket.sent[0] as string)).toEqual({
      type: 'hello',
      protocol: 1,
      universe: 0,
    })
    socket.serverSend(ACK)
    await expect(opening).resolves.toBeUndefined()
    expect(context.output.bridgeVersion()).toBe('0.1.0')
    expect(context.clock.pending()).toBe(0)
  })

  it('garde une version inconnue à null', async () => {
    const context = setup()
    const opening = context.output.open()
    context.sockets[0]!.serverOpen()
    context.sockets[0]!.serverSend({ type: 'ack', protocol: 1 })
    await opening
    expect(context.output.bridgeVersion()).toBeNull()
  })

  it('rejette si le pont ne répond pas dans le délai', async () => {
    const context = setup({ openTimeoutMs: 300 })
    const opening = context.output.open()
    context.clock.advance(299)
    context.clock.advance(1)
    await expect(opening).rejects.toThrow('aucune réponse en 300 ms')
    expect(context.sockets[0]!.closedWith).not.toBeNull()
  })

  it('utilise le délai par défaut', async () => {
    const context = setup()
    const opening = context.output.open()
    context.sockets[0]!.serverOpen()
    context.clock.advance(BRIDGE_OPEN_TIMEOUT_MS)
    await expect(opening).rejects.toThrow('Pont Art-Net injoignable')
  })

  it('rejette si la connexion échoue (pont non lancé)', async () => {
    const context = setup()
    const opening = context.output.open()
    context.sockets[0]!.serverError()
    await expect(opening).rejects.toThrow('est-il lancé sur ce PC')
  })

  it('rejette si le pont ferme la connexion (origine refusée…)', async () => {
    const context = setup()
    const opening = context.output.open()
    context.sockets[0]!.serverClose(1006, '')
    await expect(opening).rejects.toThrow('connexion refusée (code 1006)')
  })

  it('rejette un pont qui signale une erreur', async () => {
    const context = setup()
    const opening = context.output.open()
    context.sockets[0]!.serverOpen()
    context.sockets[0]!.serverSend({ type: 'error', code: 'universe', message: 'univers refusé' })
    await expect(opening).rejects.toThrow('Pont Art-Net : univers refusé')
  })

  it('rejette un service qui ne parle pas le protocole', async () => {
    for (const reply of ['bonjour', '{"type":"pong"}', '"ack"', new ArrayBuffer(3)]) {
      const context = setup()
      const opening = context.output.open()
      context.sockets[0]!.serverOpen()
      context.sockets[0]!.onmessage?.({ data: reply })
      await expect(opening).rejects.toThrow('ne parle pas le protocole')
    }
  })

  it('rejette un pont de protocole incompatible', async () => {
    const context = setup()
    const opening = context.output.open()
    context.sockets[0]!.serverOpen()
    context.sockets[0]!.serverSend({ type: 'ack', protocol: 2 })
    await expect(opening).rejects.toThrow('protocole 2, attendu 1')
  })

  it('refuse une adresse hors de la machine sans rien ouvrir', async () => {
    const context = setup({ url: 'ws://192.168.1.50:7654' })
    await expect(context.output.open()).rejects.toThrow('Adresse du pont Art-Net refusée')
    expect(context.sockets).toHaveLength(0)
  })

  it('remonte une erreur du constructeur WebSocket', async () => {
    const thrown = createFakeWebSocketClass({ throwOnCreate: new SyntaxError('URL invalide') })
    const output = createBridgeOutput({
      url: DEFAULT_BRIDGE_URL,
      WebSocketImpl: thrown.WebSocketImpl,
    })
    await expect(output.open()).rejects.toThrow('URL invalide')
    const raw = createFakeWebSocketClass({ throwOnCreate: 'boum' })
    await expect(
      createBridgeOutput({ url: DEFAULT_BRIDGE_URL, WebSocketImpl: raw.WebSocketImpl }).open()
    ).rejects.toThrow('boum')
  })

  it('utilise le WebSocket global par défaut, ou échoue proprement sans', async () => {
    const fake = createFakeWebSocketClass()
    vi.stubGlobal('WebSocket', fake.WebSocketImpl)
    const output = createBridgeOutput({ url: DEFAULT_BRIDGE_URL })
    const opening = output.open()
    expect(fake.sockets).toHaveLength(1)
    fake.sockets[0]!.serverOpen()
    fake.sockets[0]!.serverSend(ACK)
    await opening
    await output.close()

    vi.stubGlobal('WebSocket', undefined)
    await expect(createBridgeOutput({ url: DEFAULT_BRIDGE_URL }).open()).rejects.toThrow(
      'WebSocket indisponible'
    )
    vi.unstubAllGlobals()
  })
})

describe('sortie pont Art-Net : écriture', () => {
  it('envoie chaque univers en trame binaire', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    const universe = createUniverse()
    universe[0] = 42
    await context.output.write(universe)
    const frame = socket.sent[1] as Uint8Array
    expect(frame).toBeInstanceOf(Uint8Array)
    expect([...frame.subarray(0, 4)]).toEqual([1, 0, 0, 42])
  })

  it('envoie un univers par trame, numéro dans l’en-tête, univers 0 en premier', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    const first = createUniverse()
    first[0] = 7
    const second = createUniverse()
    second[511] = 9
    await context.output.write(first, 0)
    await context.output.write(second, 15)
    const [frame0, frame15] = [socket.sent[1] as Uint8Array, socket.sent[2] as Uint8Array]
    expect([...frame0.subarray(0, 4)]).toEqual([1, 0, 0, 7])
    expect([...frame15.subarray(0, 3)]).toEqual([1, 0, 15])
    expect(frame15[BRIDGE_FRAME_BYTES - 1]).toBe(9)
  })

  it('refuse un numéro d’univers hors 0-15', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    await expect(context.output.write(createUniverse(), 16)).rejects.toThrow('Univers invalide')
    await expect(context.output.write(createUniverse(), -1)).rejects.toThrow('Univers invalide')
    await expect(context.output.write(createUniverse(), 1.5)).rejects.toThrow('Univers invalide')
    expect(socket.sent).toHaveLength(1)
  })

  it('saute un tour entier : les univers suivants suivent l’univers 0, sans compter deux fois', async () => {
    const context = setup({ maxBufferedBytes: 1000 })
    const socket = await openWithAck(context)
    socket.setBufferedAmount(1001)
    await context.output.write(createUniverse(), 0)
    await context.output.write(createUniverse(), 1)
    expect(socket.sent).toHaveLength(1)
    expect(context.output.skippedFrames()).toBe(1)
    socket.setBufferedAmount(0)
    await context.output.write(createUniverse(), 0)
    await context.output.write(createUniverse(), 1)
    expect(socket.sent).toHaveLength(3)
  })

  it('échoue proprement avant ouverture, après fermeture ou socket fermée', async () => {
    const context = setup()
    await expect(context.output.write(createUniverse())).rejects.toThrow('non connecté')
    const socket = await openWithAck(context)
    Object.defineProperty(socket, 'readyState', { value: 2, configurable: true })
    await expect(context.output.write(createUniverse())).rejects.toThrow('non connecté')
    await context.output.close()
    await expect(context.output.write(createUniverse())).rejects.toThrow('non connecté')
  })

  it('saute les trames quand la socket est pleine, sans prendre de retard', async () => {
    const context = setup({ maxBufferedBytes: 1000 })
    const socket = await openWithAck(context)
    socket.setBufferedAmount(1001)
    await context.output.write(createUniverse())
    await context.output.write(createUniverse())
    expect(socket.sent).toHaveLength(1)
    expect(context.output.skippedFrames()).toBe(2)
    socket.setBufferedAmount(1000)
    await context.output.write(createUniverse())
    expect(socket.sent).toHaveLength(2)
  })

  it('compte toutes les trames sautées sans casser la détection de saturation', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    const onDisconnect = vi.fn()
    context.output.onDisconnect(onDisconnect)
    const skipRun = async () => {
      socket.setBufferedAmount(1_000_000)
      for (let index = 1; index < BRIDGE_MAX_SKIPPED_FRAMES; index += 1) {
        // Un saut isolé n'est pas une erreur : `write` se résout, le compteur l'enregistre.
        await expect(context.output.write(createUniverse())).resolves.toBeUndefined()
      }
      socket.setBufferedAmount(0)
      await context.output.write(createUniverse())
    }
    await skipRun()
    await skipRun()
    expect(context.output.skippedFrames()).toBe(2 * (BRIDGE_MAX_SKIPPED_FRAMES - 1))
    expect(socket.sent).toHaveLength(3)
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('déclare le pont saturé après trop de trames sautées d’affilée', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    const onDisconnect = vi.fn()
    context.output.onDisconnect(onDisconnect)
    socket.setBufferedAmount(1_000_000)
    for (let index = 1; index < BRIDGE_MAX_SKIPPED_FRAMES; index += 1) {
      await context.output.write(createUniverse())
    }
    expect(onDisconnect).not.toHaveBeenCalled()
    await expect(context.output.write(createUniverse())).rejects.toThrow('saturé')
    expect(onDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) })
    )
    expect(socket.closedWith).not.toBeNull()
    await expect(context.output.write(createUniverse())).rejects.toThrow('non connecté')
  })
})

describe('sortie pont Art-Net : coupure et fermeture', () => {
  it('prévient quand la socket se ferme', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    const onDisconnect = vi.fn()
    context.output.onDisconnect(onDisconnect)
    socket.serverClose(1001, 'pont arrêté')
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect((onDisconnect.mock.calls[0]![0] as Error).message).toBe(
      'Pont Art-Net déconnecté (pont arrêté (code 1001))'
    )
    await expect(context.output.write(createUniverse())).rejects.toThrow('non connecté')
  })

  it('prévient quand le pont signale une erreur en cours de partie', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    const onDisconnect = vi.fn()
    context.output.onDisconnect(onDisconnect)
    socket.serverSend('pas du JSON')
    socket.serverSend({ type: 'ack', protocol: 1 })
    expect(onDisconnect).not.toHaveBeenCalled()
    socket.serverSend({ type: 'error' })
    expect((onDisconnect.mock.calls[0]![0] as Error).message).toBe('Pont Art-Net : erreur')
  })

  it('ne prévient pas lors d’une fermeture volontaire', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    const onDisconnect = vi.fn()
    context.output.onDisconnect(onDisconnect)
    await context.output.close()
    expect(socket.closedWith).toEqual({ code: 1000, reason: 'Fermeture par l’écran de salle' })
    socket.serverClose(1000)
    expect(onDisconnect).not.toHaveBeenCalled()
    await context.output.close()
  })

  it('tolère une socket qui lève à la fermeture', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    socket.close = () => {
      throw new Error('déjà fermée')
    }
    await expect(context.output.close()).resolves.toBeUndefined()

    const other = setup({ openTimeoutMs: 10 })
    const opening = other.output.open()
    other.sockets[0]!.close = () => {
      throw new Error('jamais ouverte')
    }
    other.clock.advance(10)
    await expect(opening).rejects.toThrow('aucune réponse')

    const saturated = setup({ maxSkippedFrames: 1 })
    const full = await openWithAck(saturated)
    full.setBufferedAmount(1_000_000)
    full.close = () => {
      throw new Error('déjà fermée')
    }
    await expect(saturated.output.write(createUniverse())).rejects.toThrow('saturé')
  })

  it('une ancienne socket ne perturbe pas une réouverture', async () => {
    const context = setup()
    const first = await openWithAck(context)
    const onDisconnect = vi.fn()
    context.output.onDisconnect(onDisconnect)
    await context.output.close()
    await openWithAck(context)
    first.serverClose(1006)
    expect(onDisconnect).not.toHaveBeenCalled()
    await expect(context.output.write(createUniverse())).resolves.toBeUndefined()
  })
})

describe('sortie pont Art-Net : fin de fermeture et reconnexion', () => {
  it('close attend que la socket soit réellement fermée', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    closeLikeBrowser(socket)
    const onDisconnect = vi.fn()
    context.output.onDisconnect(onDisconnect)
    let done = false
    const closing = context.output.close().then(() => {
      done = true
    })
    await flushPromises()
    expect(done).toBe(false)
    socket.serverClose(1000)
    await closing
    expect(done).toBe(true)
    expect(onDisconnect).not.toHaveBeenCalled()
    expect(context.clock.pending()).toBe(0)
  })

  it('close abandonne l’attente au bout d’une seconde', async () => {
    const context = setup()
    const socket = await openWithAck(context)
    closeLikeBrowser(socket)
    let done = false
    const closing = context.output.close().then(() => {
      done = true
    })
    context.clock.advance(BRIDGE_CLOSE_TIMEOUT_MS - 1)
    await flushPromises()
    expect(done).toBe(false)
    context.clock.advance(1)
    await closing
    expect(done).toBe(true)
    // Un onclose tardif ne fait plus rien.
    socket.serverClose(1000)
  })

  it('une reconnexion attend la fin de la fermeture précédente (sinon le pont la refuse)', async () => {
    const context = setup()
    const first = await openWithAck(context)
    closeLikeBrowser(first)
    void context.output.close()
    const reopening = context.output.open()
    await flushPromises()
    expect(context.sockets).toHaveLength(1)
    // Un second close pendant la fermeture attend la même fin.
    const again = context.output.close()
    first.serverClose(1000)
    await again
    await flushPromises()
    expect(context.sockets).toHaveLength(2)
    context.sockets[1]!.serverOpen()
    context.sockets[1]!.serverSend(ACK)
    await expect(reopening).resolves.toBeUndefined()
    await expect(context.output.write(createUniverse())).resolves.toBeUndefined()
  })

  it('une reconnexion après saturation attend aussi la fermeture de l’ancienne socket', async () => {
    const context = setup({ maxSkippedFrames: 1 })
    const first = await openWithAck(context)
    closeLikeBrowser(first)
    first.setBufferedAmount(1_000_000)
    await expect(context.output.write(createUniverse())).rejects.toThrow('saturé')
    const reopening = context.output.open()
    await flushPromises()
    expect(context.sockets).toHaveLength(1)
    context.clock.advance(BRIDGE_CLOSE_TIMEOUT_MS)
    await flushPromises()
    expect(context.sockets).toHaveLength(2)
    context.sockets[1]!.serverOpen()
    context.sockets[1]!.serverSend(ACK)
    await expect(reopening).resolves.toBeUndefined()
  })

  it('explique le refus quand un autre onglet est déjà connecté', async () => {
    const byMessage = setup()
    const opening = byMessage.output.open()
    byMessage.sockets[0]!.serverOpen()
    byMessage.sockets[0]!.serverSend({ type: 'error', code: 'busy', message: 'occupé' })
    await expect(opening).rejects.toThrow(
      'Pont Art-Net : un autre onglet est déjà connecté au pont'
    )

    const byCloseCode = setup()
    const second = byCloseCode.output.open()
    byCloseCode.sockets[0]!.serverClose(4004, '')
    await expect(second).rejects.toThrow('un autre onglet est déjà connecté au pont')
  })
})

describe('pont Art-Net et contrôleur lumières', () => {
  it('passe en erreur et coupe la fumée quand le pont tombe', async () => {
    const context = setup()
    const controller = createLightingController({
      config: lightingConfig(),
      output: context.output,
      clock: context.clock,
      doc: null,
    })
    const starting = controller.start()
    await flushPromises()
    const socket = context.sockets[0]!
    socket.serverOpen()
    socket.serverSend(ACK)
    await starting
    expect(controller.getState().outputStatus).toBe('open')
    await advanceAsync(context.clock, 100)
    expect(socket.sent.length).toBeGreaterThan(2)
    expect(controller.smoke.arm()).toBe(true)
    expect(controller.smoke.fire(1000).ok).toBe(true)

    socket.serverClose(1006)
    expect(controller.getState().outputStatus).toBe('error')
    expect(controller.getState().smoke.status).not.toBe('firing')
    expect(controller.getState().outputError).toContain('Pont Art-Net déconnecté')
    await controller.stop()
  })
})
