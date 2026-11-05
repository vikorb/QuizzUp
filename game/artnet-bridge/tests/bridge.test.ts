import type { PortAddress } from '@bridge/artnet'
import { formatPortAddress } from '@bridge/artnet'
import {
  BLACKOUT_INTERVAL_MS,
  BLACKOUT_MS,
  createBridgeCore,
  KEEPALIVE_MS,
  MIN_INTERVAL_MS,
  SILENCE_TIMEOUT_MS,
  TICK_MS,
} from '@bridge/bridge'
import { buildOutputPlan, defaultMappings, parseMappingSpec } from '@bridge/mapping'

import { createManualClock } from './_helpers/manualClock'

type Sent = { at: number; universe: string; sequence: number; data: Uint8Array }

function setup(
  mappings = defaultMappings(),
  options: { silenceTimeoutMs?: number; blackoutMs?: number } = {}
) {
  const clock = createManualClock()
  const sent: Sent[] = []
  const log = vi.fn()
  const core = createBridgeCore({
    plan: buildOutputPlan(mappings),
    clock,
    log,
    transmit: (packet: Buffer, address: PortAddress) => {
      sent.push({
        at: clock.now(),
        universe: formatPortAddress(address),
        sequence: packet[12]!,
        data: Uint8Array.from(packet.subarray(18)),
      })
    },
    ...options,
  })
  return { clock, sent, log, core }
}

const universeWith = (value: number) => new Uint8Array(512).fill(value)
const isBlack = (sent: Sent) => sent.data.every((value) => value === 0)

describe('cœur du pont : envoi', () => {
  it('envoie chaque trame tout de suite, séquence croissante', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.frame(universeWith(5))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ universe: '0.0.0', sequence: 1 })
    expect(sent[0]!.data[0]).toBe(5)
    clock.advance(MIN_INTERVAL_MS)
    core.frame(universeWith(6))
    expect(sent.map((packet) => packet.sequence)).toEqual([1, 2])
    expect(core.getStatus()).toMatchObject({ mode: 'live', framesReceived: 2, packetsSent: 2 })
  })

  it('limite le débit sans perdre la trame la plus récente', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.frame(universeWith(1))
    core.frame(universeWith(2))
    core.frame(universeWith(3))
    expect(sent).toHaveLength(1)
    clock.advance(TICK_MS)
    expect(sent).toHaveLength(2)
    expect(sent[1]!.data[0]).toBe(3)
  })

  it('renvoie la dernière trame à plus de 1 Hz pour garder les nœuds', () => {
    const { clock, sent, core } = setup(defaultMappings(), { silenceTimeoutMs: 5000 })
    core.start()
    core.frame(universeWith(7))
    clock.advance(3000)
    const keepalives = sent.slice(1)
    expect(keepalives.length).toBeGreaterThanOrEqual(3)
    expect(keepalives.every((packet) => packet.data[0] === 7)).toBe(true)
    for (let index = 1; index < sent.length; index += 1) {
      expect(sent[index]!.at - sent[index - 1]!.at).toBeLessThanOrEqual(KEEPALIVE_MS + TICK_MS)
    }
  })

  it('n’envoie rien tant qu’aucun navigateur ne parle', () => {
    const { clock, sent, core } = setup()
    core.start()
    clock.advance(10_000)
    expect(sent).toHaveLength(0)
    core.clientDisconnected()
    expect(sent).toHaveLength(0)
  })

  it('envoie un paquet par univers de sortie, chacun avec sa séquence', () => {
    const { clock, sent, core } = setup([
      parseMappingSpec('1-72:0.0.1@1'),
      parseMappingSpec('128-148:0.0.2@1'),
      parseMappingSpec('200:0.0.1@100'),
    ])
    core.start()
    const internal = new Uint8Array(512)
    internal[0] = 11
    internal[127] = 128
    internal[199] = 200
    core.frame(internal)
    clock.advance(MIN_INTERVAL_MS)
    core.frame(internal)
    expect(sent.map((packet) => `${packet.universe}#${packet.sequence}`)).toEqual([
      '0.0.1#1',
      '0.0.2#1',
      '0.0.1#2',
      '0.0.2#2',
    ])
    expect(sent[0]!.data[0]).toBe(11)
    expect(sent[0]!.data[99]).toBe(200)
    expect(sent[1]!.data[0]).toBe(128)
  })

  it('reboucle la séquence après 255', () => {
    const { clock, sent, core } = setup()
    for (let index = 0; index < 256; index += 1) {
      core.frame(universeWith(1))
      clock.advance(MIN_INTERVAL_MS)
    }
    expect(sent[254]!.sequence).toBe(255)
    expect(sent[255]!.sequence).toBe(1)
  })
})

describe('cœur du pont : chien de garde', () => {
  it('envoie du noir si le navigateur se tait trop longtemps, puis s’arrête', () => {
    const { clock, sent, core, log } = setup()
    core.start()
    core.frame(universeWith(200))
    clock.advance(SILENCE_TIMEOUT_MS)
    expect(sent.every((packet) => packet.data[0] === 200)).toBe(true)
    expect(core.getStatus().mode).toBe('live')

    clock.advance(TICK_MS)
    expect(core.getStatus().mode).toBe('blackout')
    const firstBlack = sent.findIndex(isBlack)
    expect(sent[firstBlack]!.at - 1_000).toBeLessThanOrEqual(SILENCE_TIMEOUT_MS + TICK_MS)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('plus aucune trame du navigateur'))

    clock.advance(BLACKOUT_MS)
    const black = sent.slice(firstBlack)
    expect(black.every(isBlack)).toBe(true)
    expect(black.length).toBeGreaterThanOrEqual(BLACKOUT_MS / BLACKOUT_INTERVAL_MS - 1)
    expect(core.getStatus()).toMatchObject({ mode: 'waiting', blackouts: 1 })

    const count = sent.length
    clock.advance(10_000)
    expect(sent).toHaveLength(count)
  })

  it('coupe sur tous les univers de sortie', () => {
    const { clock, sent, core } = setup([
      parseMappingSpec('1-72:0.0.1@1'),
      parseMappingSpec('128-148:0.0.2@1'),
    ])
    core.start()
    core.frame(universeWith(255))
    sent.length = 0
    core.clientDisconnected()
    expect(sent.map((packet) => packet.universe)).toEqual(['0.0.1', '0.0.2'])
    expect(sent.every(isBlack)).toBe(true)
    clock.advance(500)
    expect(sent.filter((packet) => packet.universe === '0.0.2').length).toBeGreaterThan(3)
    expect(sent.every(isBlack)).toBe(true)
  })

  it('envoie du noir dès la déconnexion, même avec une trame en attente', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.frame(universeWith(9))
    core.frame(universeWith(10))
    core.clientDisconnected()
    clock.advance(TICK_MS * 2)
    expect(sent.slice(1).every(isBlack)).toBe(true)
  })

  it('reprend dès que le navigateur renvoie des trames', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.frame(universeWith(3))
    clock.advance(SILENCE_TIMEOUT_MS + TICK_MS)
    expect(core.getStatus().mode).toBe('blackout')
    core.frame(universeWith(4))
    expect(core.getStatus().mode).toBe('live')
    clock.advance(TICK_MS)
    expect(sent.at(-1)!.data[0]).toBe(4)
  })

  it('une nouvelle coupure pendant le noir prolonge le noir sans le recompter', () => {
    const { clock, core } = setup(defaultMappings(), { blackoutMs: 1000 })
    core.start()
    core.frame(universeWith(3))
    core.clientDisconnected()
    clock.advance(600)
    core.clientDisconnected()
    clock.advance(600)
    expect(core.getStatus()).toMatchObject({ mode: 'blackout', blackouts: 1 })
    clock.advance(500)
    expect(core.getStatus().mode).toBe('waiting')
  })

  it('envoie du noir à l’arrêt et coupe la boucle', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.start()
    core.frame(universeWith(8))
    core.stop()
    expect(isBlack(sent.at(-1)!)).toBe(true)
    const count = sent.length
    clock.advance(5000)
    expect(sent).toHaveLength(count)
    expect(clock.pending()).toBe(0)
    core.stop()
    core.sendBlackout()
    expect(sent.length).toBe(count + 2)
  })
})

describe('cœur du pont : gel (test de perte de signal)', () => {
  const HOLD_MS = 5000

  it('garde la dernière trame sans passer au noir, ignore les trames reçues', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.frame(universeWith(7))
    expect(core.hold(HOLD_MS)).toBe(true)
    expect(core.getStatus().mode).toBe('hold')
    const before = sent.length
    core.frame(universeWith(99))
    expect(core.getStatus().framesReceived).toBe(1)
    // Bien plus longtemps que le silence : pas de noir, la trame de départ est renvoyée.
    clock.advance(SILENCE_TIMEOUT_MS + 1000)
    expect(sent.length).toBeGreaterThan(before)
    expect(sent.slice(before).every((packet) => packet.data[0] === 7)).toBe(true)
    expect(sent.some(isBlack)).toBe(false)
    expect(core.getStatus()).toMatchObject({ mode: 'hold', blackouts: 0 })
  })

  it('émet avant le gel la trame reçue mais retenue par la cadence', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.frame(universeWith(1))
    core.frame(universeWith(2))
    expect(sent).toHaveLength(1)
    expect(core.hold(HOLD_MS)).toBe(true)
    expect(sent.at(-1)!.data[0]).toBe(2)
    clock.advance(KEEPALIVE_MS)
    expect(sent.at(-1)!.data[0]).toBe(2)
  })

  it('passe au noir à la fin du gel, puis reprend aux trames suivantes', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.frame(universeWith(7))
    core.hold(HOLD_MS)
    clock.advance(HOLD_MS - TICK_MS)
    expect(core.getStatus().mode).toBe('hold')
    expect(sent.some(isBlack)).toBe(false)
    clock.advance(TICK_MS)
    expect(core.getStatus()).toMatchObject({ mode: 'blackout', blackouts: 1 })
    expect(isBlack(sent.at(-1)!)).toBe(true)
    clock.advance(MIN_INTERVAL_MS)
    core.frame(universeWith(8))
    expect(core.getStatus().mode).toBe('live')
    expect(sent.at(-1)!.data[0]).toBe(8)
  })

  it('passe au noir à la déconnexion pendant le gel', () => {
    const { clock, sent, core } = setup()
    core.start()
    core.frame(universeWith(7))
    core.hold(HOLD_MS)
    clock.advance(1000)
    core.clientDisconnected()
    expect(core.getStatus()).toMatchObject({ mode: 'blackout', blackouts: 1 })
    expect(isBlack(sent.at(-1)!)).toBe(true)
    clock.advance(BLACKOUT_MS + TICK_MS)
    expect(core.getStatus().mode).toBe('waiting')
  })

  it('release met fin au gel tout de suite, sans effet hors gel', () => {
    const { sent, core } = setup()
    core.start()
    core.release()
    core.frame(universeWith(7))
    core.release()
    expect(core.getStatus().mode).toBe('live')
    core.hold(HOLD_MS)
    core.release()
    expect(core.getStatus().mode).toBe('blackout')
    expect(isBlack(sent.at(-1)!)).toBe(true)
  })

  it('refuse le gel sans trame en cours ou si un gel est déjà actif', () => {
    const { core } = setup()
    core.start()
    expect(core.hold(HOLD_MS)).toBe(false)
    core.frame(universeWith(7))
    expect(core.hold(HOLD_MS)).toBe(true)
    expect(core.hold(HOLD_MS)).toBe(false)
  })
})
