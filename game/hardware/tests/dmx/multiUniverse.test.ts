import { parseRoomHardwareConfig } from '@hardware/config'
import type { FixtureState, ResolvedFixture } from '@hardware/dmx/fixtures'
import {
  darkState,
  parseRig,
  renderUniverse,
  renderUniverses,
  unsupportedUniverseProblems,
  usedUniverses,
} from '@hardware/dmx/fixtures'
import { createMeteredOutput } from '@hardware/dmx/meteredOutput'
import { DMX_DRIVER_UNIVERSES } from '@hardware/dmx/output'
import { findProfile } from '@hardware/dmx/profiles'
import { createSerialOutput } from '@hardware/dmx/serialOutput'
import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import { createUniverse, MAX_UNIVERSES } from '@hardware/dmx/universe'

import { createFakePort } from '../_helpers/fakeSerial'
import { createManualClock } from '../_helpers/manualClock'

const resolved = (id: string, address: number, universe?: number): ResolvedFixture => ({
  id,
  name: id,
  profileId: 'par-rgb',
  address,
  ...(universe === undefined ? {} : { universe }),
  profile: findProfile('par-rgb')!,
})

const lit = (red: number): FixtureState => ({
  ...darkState(),
  color: { r: red, g: 0, b: 0 },
  intensity: 1,
})

describe('rendu sur plusieurs univers', () => {
  const fixtures = [resolved('a', 1), resolved('b', 1, 1), resolved('c', 10, 1)]
  const states = new Map([
    ['a', lit(10)],
    ['b', lit(20)],
    ['c', lit(30)],
  ])

  it('ne rend dans un univers que les appareils qui y sont', () => {
    expect(renderUniverse(fixtures, states, 0)[0]).toBe(10)
    const second = renderUniverse(fixtures, states, 0, 1)
    expect(second[0]).toBe(20)
    expect(second[9]).toBe(30)
    expect(renderUniverse(fixtures, states, 0, 2).every((value) => value === 0)).toBe(true)
  })

  it('rend tous les univers utilisés, le 0 toujours en premier', () => {
    const frames = renderUniverses(fixtures, states, 0)
    expect([...frames.keys()]).toEqual([0, 1])
    expect(frames.get(0)![0]).toBe(10)
    expect(frames.get(1)![0]).toBe(20)
    // Sans appareil, l'univers 0 part quand même (comme avant les univers multiples).
    expect([...renderUniverses([], new Map(), 0).keys()]).toEqual([0])
    expect(usedUniverses([{ universe: 3 }, { universe: 1 }, {}])).toEqual([0, 1, 3])
  })
})

describe('parseRig et univers', () => {
  const par = (extra = {}) => ({ id: 'a', name: 'A', profileId: 'par-rgb', address: 1, ...extra })

  it('relit une config sans univers à l’identique (pas de champ ajouté)', () => {
    const { fixtures, problems } = parseRig([par()], [])
    expect(problems).toEqual([])
    expect(fixtures[0]).not.toHaveProperty('universe')
    const config = parseRoomHardwareConfig({ lighting: { fixtures: [par()] } }).config
    expect(config.lighting.fixtures[0]).toEqual(par())
  })

  it('garde l’univers déclaré', () => {
    const { fixtures } = parseRig([par({ universe: 2 })], [])
    expect(fixtures[0]!.universe).toBe(2)
  })

  it('refuse un univers invalide', () => {
    for (const universe of [-1, 16, 1.5, '1', null]) {
      const { fixtures, problems } = parseRig([par({ universe })], [])
      expect(fixtures).toEqual([])
      expect(problems).toEqual([expect.stringContaining('univers invalide')])
    }
    expect(MAX_UNIVERSES).toBe(16)
  })

  it('cherche les chevauchements univers par univers', () => {
    const ok = parseRig([par(), par({ id: 'b', name: 'B', universe: 1 })], [])
    expect(ok.problems).toEqual([])
    expect(ok.fixtures).toHaveLength(2)

    const clash = parseRig(
      [par({ universe: 1 }), par({ id: 'b', name: 'B', universe: 1, address: 2 })],
      []
    )
    expect(clash.fixtures).toHaveLength(1)
    expect(clash.problems).toEqual([
      expect.stringContaining('canal 2 déjà utilisé par « A » (univers 1)'),
    ])
  })
})

describe('sorties et univers', () => {
  it('l’interface USB ignore les univers autres que 0, sans plantage', async () => {
    const { port } = createFakePort()
    const output = createSerialOutput({ port, driver: 'usbpro', serial: null })
    await output.open()
    const data = createUniverse()
    data[0] = 5
    await output.write(data, 1)
    expect(port.written).toHaveLength(0)
    await output.write(data, 0)
    expect(port.written).toHaveLength(1)
    await output.write(data)
    expect(port.written).toHaveLength(2)
    expect(DMX_DRIVER_UNIVERSES).toEqual({
      simulation: 16,
      usbpro: 1,
      opendmx: 1,
      'artnet-bridge': 16,
    })
  })

  it('la simulation garde la dernière trame de chaque univers', async () => {
    const output = createSimulationOutput()
    const seen: [number, number][] = []
    output.onFrame((data, universe) => seen.push([universe, data[0]!]))
    const first = createUniverse()
    first[0] = 1
    const second = createUniverse()
    second[0] = 2
    await output.write(first, 0)
    await output.write(second, 1)
    expect(output.lastFrame(0)[0]).toBe(1)
    expect(output.lastFrame(1)[0]).toBe(2)
    expect(output.lastFrame(5)[0]).toBe(0)
    expect(seen).toEqual([
      [0, 1],
      [1, 2],
    ])
    // Une trame de jeu = une écriture sur l'univers 0.
    expect(output.framesSent()).toBe(1)
  })

  it('la mesure compte une trame de jeu par tour, quel que soit le nombre d’univers', async () => {
    const clock = createManualClock(0)
    const inner = createSimulationOutput()
    const output = createMeteredOutput(inner, clock)
    await output.write(createUniverse(), 0)
    await output.write(createUniverse(), 1)
    await output.write(createUniverse(), 2)
    expect(output.getStats()).toMatchObject({ framesSent: 1, measuredHz: 1, failures: 0 })
    expect(inner.lastFrame(2)).toHaveLength(512)
  })
})

describe('problèmes selon la sortie', () => {
  const fixtures = [{ name: 'A', universe: 0 }, { name: 'B', universe: 1 }, { name: 'C' }]

  it('signale les appareils hors des univers de l’USB', () => {
    expect(unsupportedUniverseProblems(fixtures, 'usbpro')).toEqual([
      'Appareil « B » : univers 1 non pris en charge par la sortie usbpro (univers 0 seulement)',
    ])
    expect(unsupportedUniverseProblems(fixtures, 'opendmx')).toHaveLength(1)
    expect(unsupportedUniverseProblems(fixtures, 'artnet-bridge')).toEqual([])
    expect(unsupportedUniverseProblems(fixtures, 'simulation')).toEqual([])
  })

  it('remonte le problème à la lecture de la config de salle', () => {
    const raw = (driver: string) => ({
      lighting: {
        driver,
        fixtures: [{ id: 'b', name: 'B', profileId: 'par-rgb', address: 1, universe: 1 }],
      },
    })
    expect(parseRoomHardwareConfig(raw('usbpro')).problems).toEqual([
      expect.stringContaining('univers 1 non pris en charge'),
    ])
    expect(parseRoomHardwareConfig(raw('artnet-bridge')).problems).toEqual([])
    // L'appareil reste dans la config : rien n'est perdu quand on change d'interface.
    expect(parseRoomHardwareConfig(raw('usbpro')).config.lighting.fixtures).toHaveLength(1)
  })
})
