import type { PortAddress } from '@bridge/artnet'
import { formatPortAddress } from '@bridge/artnet'
import {
  BLACKOUT_MS,
  createBridgeCore,
  KEEPALIVE_MS,
  MIN_INTERVAL_MS,
  TICK_MS,
} from '@bridge/bridge'
import {
  buildOutputPlan,
  describePlan,
  MappingError,
  parseMappingEntry,
  parseMappingSpec,
  renderOutputs,
} from '@bridge/mapping'
import { createBridgeServer } from '@bridge/server'

import { createManualClock } from './_helpers/manualClock'
import { OPCODE, openRawClient, openUdpReceiver } from './_helpers/rawClient'

const fill = (value: number) => new Uint8Array(512).fill(value)

describe('mappage : univers interne', () => {
  it('lit le préfixe UNIVERS/ et la clé JSON universe', () => {
    expect(parseMappingSpec('1/1-512:0.0.5')).toMatchObject({ universe: 1, from: 1, to: 512 })
    expect(parseMappingSpec('3/10:0.0.2@4')).toMatchObject({
      universe: 3,
      from: 10,
      to: 10,
      start: 4,
    })
    expect(parseMappingSpec('1-72:0.0.1')).not.toHaveProperty('universe')
    expect(parseMappingEntry({ universe: 2, from: 1, to: 8, output: '0.0.4' })).toMatchObject({
      universe: 2,
    })
  })

  it('refuse un univers interne hors 0-15', () => {
    expect(() => buildOutputPlan([parseMappingSpec('16/1-8:0.0.1')])).toThrow(MappingError)
  })

  it('refuse un univers de sortie alimenté par deux univers internes', () => {
    expect(() =>
      buildOutputPlan([parseMappingSpec('1-8:0.0.1'), parseMappingSpec('1/9-16:0.0.1@9')])
    ).toThrow(/déjà alimenté par l'univers interne 0/)
  })

  it('recopie les univers internes 1-15 vers base+n sans écraser un mappage explicite', () => {
    const base: PortAddress = { net: 0, subnet: 0, universe: 0 }
    const plan = buildOutputPlan([parseMappingSpec('1/1-4:0.0.3')], base)
    const auto = plan.outputs.filter((output) => output.auto)
    expect(plan.outputs.find((output) => output.key === 3)!.source).toBe(1)
    expect(auto.map((output) => output.key)).not.toContain(3)
    expect(auto.every((output) => output.key === output.source)).toBe(true)
    expect(describePlan(plan).some((line) => line.includes('recopie'))).toBe(true)
  })

  it('rend seulement les sorties alimentées par l’univers demandé', () => {
    const plan = buildOutputPlan([parseMappingSpec('1-2:0.0.1'), parseMappingSpec('1/1-2:0.0.2')])
    expect(renderOutputs(plan, fill(9), 0)).toHaveLength(1)
    expect(renderOutputs(plan, fill(9), 1)[0]![0]).toBe(9)
    expect(renderOutputs(plan, fill(9), 5)).toEqual([])
  })
})

describe('cœur du pont : plusieurs univers', () => {
  function setup(mappings: string[]) {
    const clock = createManualClock()
    const sent: { universe: string; sequence: number; first: number }[] = []
    const log = vi.fn()
    const core = createBridgeCore({
      plan: buildOutputPlan(mappings.map((spec) => parseMappingSpec(spec))),
      clock,
      log,
      silenceTimeoutMs: 2000,
      blackoutMs: BLACKOUT_MS,
      transmit: (packet, address) =>
        sent.push({
          universe: formatPortAddress(address),
          sequence: packet[12]!,
          first: packet[18]!,
        }),
    })
    return { clock, sent, log, core }
  }

  it('émet chaque univers interne sur sa sortie, avec sa propre séquence', () => {
    const { sent, core, clock } = setup(['1-512:0.0.1', '1/1-512:0.0.2'])
    core.start()
    core.frame(fill(5), 0)
    core.frame(fill(6), 1)
    expect(sent).toEqual([
      { universe: '0.0.1', sequence: 1, first: 5 },
      { universe: '0.0.2', sequence: 1, first: 6 },
    ])
    clock.advance(MIN_INTERVAL_MS)
    core.frame(fill(7), 1)
    expect(sent.at(-1)).toEqual({ universe: '0.0.2', sequence: 2, first: 7 })
  })

  it('remet à zéro un univers qui se tait pendant que les autres continuent', () => {
    const { sent, core, clock, log } = setup(['1-512:0.0.1', '1/1-512:0.0.2'])
    core.start()
    core.frame(fill(5), 0)
    core.frame(fill(6), 1)
    for (let elapsed = 0; elapsed < 2400; elapsed += TICK_MS) {
      clock.advance(TICK_MS)
      core.frame(fill(5), 0)
    }
    expect(sent.filter((packet) => packet.universe === '0.0.2').at(-1)!.first).toBe(0)
    expect(sent.filter((packet) => packet.universe === '0.0.1').at(-1)!.first).toBe(5)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Univers interne 1'))
  })

  it('noir sur tous les univers quand plus aucune trame n’arrive', () => {
    const { sent, core, clock } = setup(['1-512:0.0.1', '1/1-512:0.0.2'])
    core.start()
    core.frame(fill(5), 0)
    core.frame(fill(6), 1)
    clock.advance(2100)
    const tail = sent.slice(-2)
    expect(tail.map((packet) => packet.universe).sort()).toEqual(['0.0.1', '0.0.2'])
    expect(tail.every((packet) => packet.first === 0)).toBe(true)
    expect(core.getStatus().mode).toBe('blackout')
  })

  it('renvoie la dernière trame de chaque univers pour garder les nœuds', () => {
    const { sent, core, clock } = setup(['1-512:0.0.1', '1/1-512:0.0.2'])
    core.start()
    core.frame(fill(5), 0)
    core.frame(fill(6), 1)
    const before = sent.length
    clock.advance(KEEPALIVE_MS)
    expect(sent.length).toBe(before + 2)
  })

  it('ignore, en le signalant une fois, un univers interne non mappé', () => {
    const { sent, core, log } = setup(['1-512:0.0.1'])
    core.start()
    core.frame(fill(5), 0)
    core.frame(fill(8), 4)
    core.frame(fill(8), 4)
    expect(sent.map((packet) => packet.universe)).toEqual(['0.0.1'])
    expect(log.mock.calls.filter(([line]) => String(line).includes('non mappé'))).toHaveLength(1)
  })
})

describe('pont : deux univers sur un faux nœud UDP', () => {
  it('route chaque trame WebSocket vers son univers Art-Net', async () => {
    const receiver = await openUdpReceiver()
    const bridge = createBridgeServer({
      port: 0,
      origins: ['https://salle.quizzup.fr'],
      plan: buildOutputPlan([parseMappingSpec('1-512:0.0.1'), parseMappingSpec('1/1-512:0.0.2')]),
      target: '127.0.0.1',
      artnetPort: receiver.port,
      bind: '127.0.0.1',
      silenceTimeoutMs: 5000,
      blackoutMs: 300,
      version: '9.9.9',
      log: () => undefined,
    })
    try {
      const port = await bridge.listen()
      const client = await openRawClient(port)
      client.send(OPCODE.text, JSON.stringify({ type: 'hello', protocol: 1, universe: 0 }))
      await client.next()
      const frame = (universe: number, value: number) => {
        const bytes = new Uint8Array(515)
        bytes[0] = 1
        bytes[2] = universe
        bytes.fill(value, 3)
        return bytes
      }
      client.send(OPCODE.binary, frame(0, 11))
      client.send(OPCODE.binary, frame(1, 22))
      const packets = await receiver.waitFor(2)
      // SubUni (octet 14) et premier canal (octet 18) de chaque paquet ArtDMX.
      const seen = packets.map((packet) => [packet[14], packet[18]])
      expect(seen).toEqual(
        expect.arrayContaining([
          [1, 11],
          [2, 22],
        ])
      )
    } finally {
      await bridge.close()
      await receiver.close()
    }
  })
})
