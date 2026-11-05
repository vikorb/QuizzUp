import {
  BRIDGE_HOLD_TIMEOUT_MS,
  BRIDGE_POLL_TIMEOUT_MS,
  BridgeHoldError,
  BridgePollError,
  createBridgeOutput,
  DEFAULT_BRIDGE_URL,
} from '@hardware/dmx/bridgeOutput'

import { createFakeWebSocketClass } from '../_helpers/fakeWebSocket'
import { createManualClock } from '../_helpers/manualClock'

const ACK = {
  type: 'ack',
  protocol: 1,
  bridge: 'quizzup-artnet-bridge',
  version: '0.1.0',
  universes: 16,
}
const POLL_MESSAGE = '{"type":"poll"}'

/** Ouvre la sortie en jouant le rôle du pont : connexion, hello, ack (avec ou sans `features`). */
async function openBridge(ack: Record<string, unknown> = { ...ACK, features: ['poll'] }) {
  const fake = createFakeWebSocketClass()
  const clock = createManualClock()
  const output = createBridgeOutput({
    url: DEFAULT_BRIDGE_URL,
    WebSocketImpl: fake.WebSocketImpl,
    clock,
  })
  const opening = output.open()
  const socket = fake.sockets[0]!
  socket.serverOpen()
  socket.serverSend(ack)
  await opening
  return { output, socket, clock, sockets: fake.sockets }
}

describe('sortie pont : découverte des nœuds (poll)', () => {
  it('retient les capacités de l’ack ; un ancien pont n’en annonce aucune', async () => {
    expect((await openBridge({ ...ACK })).output.features()).toEqual([])
    expect((await openBridge()).output.features()).toEqual(['poll'])
    expect((await openBridge({ ...ACK, features: ['poll', 7, null] })).output.features()).toEqual([
      'poll',
    ])
    expect((await openBridge({ ...ACK, features: 'poll' })).output.features()).toEqual([])
  })

  it('envoie {"type":"poll"} et résout avec les nœuds de la réponse', async () => {
    const { output, socket } = await openBridge()
    const polling = output.poll()
    expect(socket.sent).toContain(POLL_MESSAGE)
    socket.serverSend({
      type: 'nodes',
      nodes: [
        { ip: '192.168.1.50', shortName: 'NET-3', longName: 'Showtec', universes: ['0.0.1', 4] },
        { ip: '10.0.0.4', shortName: 'B', longName: 'Boitier B' },
      ],
    })
    await expect(polling).resolves.toEqual([
      { ip: '192.168.1.50', shortName: 'NET-3', longName: 'Showtec', universes: ['0.0.1'] },
      { ip: '10.0.0.4', shortName: 'B', longName: 'Boitier B' },
    ])
  })

  it('écarte les nœuds mal formés ou d’une IP non locale', async () => {
    const { output, socket } = await openBridge()
    const polling = output.poll()
    socket.serverSend({
      type: 'nodes',
      nodes: [
        { ip: '8.8.8.8', shortName: 'Dehors' },
        { shortName: 'Sans IP' },
        'texte',
        null,
        { ip: '192.168.1.9' },
      ],
    })
    await expect(polling).resolves.toEqual([{ ip: '192.168.1.9', shortName: '', longName: '' }])
    const again = output.poll()
    socket.serverSend({ type: 'nodes', nodes: 'pas une liste' })
    await expect(again).resolves.toEqual([])
  })

  it('deux appels simultanés partagent une seule requête', async () => {
    const { output, socket } = await openBridge()
    const first = output.poll()
    const second = output.poll()
    expect(second).toBe(first)
    expect(socket.sent.filter((message) => message === POLL_MESSAGE)).toHaveLength(1)
    socket.serverSend({ type: 'nodes', nodes: [] })
    await expect(first).resolves.toEqual([])
  })

  it('rejette au bout du délai si le pont ne répond pas, puis accepte une nouvelle recherche', async () => {
    const { output, socket, clock } = await openBridge()
    const outcome = expect(output.poll()).rejects.toMatchObject({ code: 'timeout' })
    clock.advance(BRIDGE_POLL_TIMEOUT_MS)
    await outcome
    const retry = output.poll()
    socket.serverSend({ type: 'nodes', nodes: [] })
    await expect(retry).resolves.toEqual([])
  })

  it('rejette quand la connexion tombe ou quand la sortie est fermée pendant la recherche', async () => {
    const dropped = await openBridge()
    const first = expect(dropped.output.poll()).rejects.toMatchObject({ code: 'not_connected' })
    dropped.socket.serverClose(1006)
    await first

    const closed = await openBridge()
    const second = expect(closed.output.poll()).rejects.toMatchObject({ code: 'not_connected' })
    await closed.output.close()
    await second
  })

  it('rejette si le pont est trop ancien (pas de poll annoncé) ou non connecté', async () => {
    const fake = createFakeWebSocketClass()
    const idle = createBridgeOutput({
      url: DEFAULT_BRIDGE_URL,
      WebSocketImpl: fake.WebSocketImpl,
      clock: createManualClock(),
    })
    await expect(idle.poll()).rejects.toMatchObject({ code: 'not_connected' })
    await expect(idle.poll()).rejects.toBeInstanceOf(BridgePollError)

    const old = await openBridge({ ...ACK })
    await expect(old.output.poll()).rejects.toMatchObject({ code: 'unsupported' })
    expect(old.socket.sent).not.toContain(POLL_MESSAGE)
  })

  it('rejette si l’envoi échoue', async () => {
    const { output, socket } = await openBridge()
    socket.send = () => {
      throw new Error('socket cassée')
    }
    await expect(output.poll()).rejects.toMatchObject({
      code: 'poll_failed',
      message: 'socket cassée',
    })
  })

  it('code "poll" du pont : la recherche échoue (poll_failed) sans couper la connexion', async () => {
    const { output, socket } = await openBridge()
    const disconnected = vi.fn()
    output.onDisconnect(disconnected)
    const polling = output.poll()
    socket.serverSend({ type: 'error', code: 'poll', message: 'ArtPoll impossible : ENETUNREACH' })
    await expect(polling).rejects.toMatchObject({ code: 'poll_failed' })
    expect(disconnected).not.toHaveBeenCalled()
    // La connexion sert encore : une nouvelle recherche repart et aboutit.
    const retry = output.poll()
    socket.serverSend({ type: 'nodes', nodes: [] })
    await expect(retry).resolves.toEqual([])
  })

  it('un autre code d’erreur du pont coupe la connexion et fait échouer la recherche', async () => {
    const { output, socket } = await openBridge()
    const disconnected = vi.fn()
    output.onDisconnect(disconnected)
    const polling = expect(output.poll()).rejects.toMatchObject({ code: 'not_connected' })
    socket.serverSend({ type: 'error', code: 'frame', message: 'trame invalide' })
    await polling
    expect(disconnected).toHaveBeenCalledTimes(1)
  })

  it('ignore un message nodes sans recherche en cours', async () => {
    const { output, socket } = await openBridge()
    socket.serverSend({ type: 'nodes', nodes: [{ ip: '192.168.1.9' }] })
    const polling = output.poll()
    socket.serverSend({ type: 'nodes', nodes: [] })
    await expect(polling).resolves.toEqual([])
  })
})

describe('sortie pont : gel de la sortie (hold)', () => {
  const HOLD_ACK = { ...ACK, features: ['poll', 'hold'] }
  const HOLD = (ms: number) => JSON.stringify({ type: 'hold', ms })

  it('envoie {"type":"hold","ms":N} et se résout à la confirmation du pont', async () => {
    const { output, socket } = await openBridge(HOLD_ACK)
    expect(output.features()).toEqual(['poll', 'hold'])
    const holding = output.hold(15_000)
    expect(socket.sent).toContain(HOLD(15_000))
    socket.serverSend({ type: 'held', ms: 15_000 })
    await expect(holding).resolves.toBeUndefined()
  })

  it('refuse une durée hors bornes sans rien envoyer', async () => {
    const { output, socket } = await openBridge(HOLD_ACK)
    for (const ms of [999, 30_001, 0, -1, 1500.5, Number.NaN]) {
      await expect(output.hold(ms)).rejects.toMatchObject({ code: 'invalid_duration' })
    }
    const holding = output.hold(1000)
    socket.serverSend({ type: 'held', ms: 1000 })
    await holding
    expect(socket.sent.filter((message) => String(message).includes('"hold"'))).toEqual([
      HOLD(1000),
    ])
  })

  it('rejette proprement un pont trop ancien (sans hold dans features)', async () => {
    for (const ack of [{ ...ACK }, { ...ACK, features: ['poll'] }]) {
      const { output, socket } = await openBridge(ack)
      const error = await output.hold(5000).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(BridgeHoldError)
      expect(error).toMatchObject({ code: 'unsupported' })
      expect(socket.sent.some((message) => String(message).includes('"hold"'))).toBe(false)
      output.release()
      expect(socket.sent.some((message) => String(message).includes('release'))).toBe(false)
    }
  })

  it('rejette hors connexion, sur refus du pont (connexion gardée), au délai et à la coupure', async () => {
    const closed = await openBridge(HOLD_ACK)
    await closed.output.close()
    await expect(closed.output.hold(5000)).rejects.toMatchObject({ code: 'not_connected' })

    const { output, socket, clock } = await openBridge(HOLD_ACK)
    const refused = output.hold(5000)
    socket.serverSend({ type: 'error', code: 'hold', message: 'gel refusé' })
    await expect(refused).rejects.toMatchObject({ code: 'refused' })
    expect(socket.closedWith).toBeNull()

    const slow = output.hold(5000)
    clock.advance(BRIDGE_HOLD_TIMEOUT_MS)
    await expect(slow).rejects.toMatchObject({ code: 'timeout' })

    const cut = output.hold(5000)
    await expect(output.hold(5000)).rejects.toMatchObject({ code: 'refused' })
    socket.serverClose(1006)
    await expect(cut).rejects.toMatchObject({ code: 'not_connected' })
  })

  it('release envoie {"type":"release"}', async () => {
    const { output, socket } = await openBridge(HOLD_ACK)
    output.release()
    expect(socket.sent).toContain('{"type":"release"}')
  })
})
