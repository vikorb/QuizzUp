import { parseRoomHardwareConfig } from '@hardware/config'
import type { FixtureState } from '@hardware/dmx/fixtures'
import { darkState, renderUniverses } from '@hardware/dmx/fixtures'
import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import { createLightingController } from '@hardware/lighting/lightingController'
import type { SceneDefinition } from '@hardware/lighting/scenes'

import { advanceAsync, createManualClock } from '../_helpers/manualClock'
import { lightingConfig } from '../_helpers/rig'

const lit = (state: Partial<FixtureState>): FixtureState => ({
  ...darkState(),
  intensity: 1,
  ...state,
})

describe('lyre à roue de couleurs : cas limites de la config et du contrôleur', () => {
  it('relit à l’identique un spot du preset 6 pupitres enregistré avant la roue (canaux fixed)', () => {
    // Profil tel qu'enregistré en base avant L12 : roue et gobo en canaux `fixed`.
    const stored = {
      lighting: {
        customProfiles: [
          {
            id: 'six-desk-spot-9',
            name: 'Lyre spot 9 canaux (roue de couleurs, à vérifier)',
            kind: 'movingHead',
            channels: [
              { role: 'pan' },
              { role: 'tilt' },
              { role: 'fixed', value: 0 },
              { role: 'fixed', value: 0 },
              { role: 'strobe' },
              { role: 'dimmer' },
              { role: 'fixed', value: 0 },
              { role: 'fixed', value: 0 },
              { role: 'fixed', value: 0 },
            ],
          },
        ],
        fixtures: [
          {
            id: 'spot',
            name: 'Spot',
            profileId: 'six-desk-spot-9',
            address: 10,
            desk: 3,
            deskPositions: { 3: { pan: 150 * 257, tilt: 77 * 257 } },
          },
        ],
      },
    }
    const parsed = parseRoomHardwareConfig(stored)
    expect(parsed.problems).toEqual([])
    const universes = renderUniverses(
      parsed.fixtures,
      new Map([
        [
          'spot',
          lit({
            color: { r: 255, g: 0, b: 0, w: 0 },
            intensity: 0.6,
            strobe: 4,
            position: { pan: 150 * 257, tilt: 77 * 257 },
          }),
        ],
      ]),
      0
    )
    const frame = universes.get(0)!
    // pan, tilt, roue (fixed 0), gobo (fixed 0), strobe, dimmer 0,6 × 255, 3 canaux fixes.
    expect([...frame.slice(9, 18)]).toEqual([150, 77, 0, 0, 4, 153, 0, 0, 0])
    expect([...frame].filter((value) => value !== 0)).toHaveLength(4)
  })

  it('une lyre à roue sur l’univers 1 écrit sur cet univers et laisse le 0 intact', () => {
    const parsed = parseRoomHardwareConfig({
      lighting: {
        driver: 'artnet-bridge',
        fixtures: [
          { id: 'spot', name: 'Spot', profileId: 'moving-head-spot-9', address: 5, universe: 1 },
        ],
      },
    })
    expect(parsed.problems).toEqual([])
    const universes = renderUniverses(
      parsed.fixtures,
      new Map([['spot', lit({ color: { r: 0, g: 255, b: 0, w: 0 } })]]),
      0
    )
    expect([...universes.get(0)!].every((value) => value === 0)).toBe(true)
    // Adresse 5 : roue au 8e canal (index 4 + 7), vert = 20 ; dimmer 255 ; shutter 255.
    const frame = universes.get(1)!
    expect(frame[4 + 5]).toBe(255)
    expect(frame[4 + 6]).toBe(255)
    expect(frame[4 + 7]).toBe(20)
  })
})

describe('contrôleur : trames noires et blackout sur une lyre spot', () => {
  const scenes: SceneDefinition[] = [
    {
      id: 'idle',
      name: 'Repos',
      priority: 0,
      steps: [{ type: 'color', color: { r: 255, g: 0, b: 0, w: 0 }, intensity: 1 }],
    },
    { id: 'noir', name: 'Noir', priority: 5, steps: [{ type: 'blackout' }] },
  ]

  async function setup() {
    const clock = createManualClock(10_000)
    const output = createSimulationOutput()
    const controller = createLightingController({
      config: lightingConfig({
        fixtures: [{ id: 'spot', name: 'Spot', profileId: 'moving-head-spot-9', address: 1 }],
      }),
      output,
      clock,
      doc: document,
      scenes,
    })
    await controller.start()
    await advanceAsync(clock, 200)
    return { clock, controller, output }
  }

  it('scène de blackout : gradateur à 0, shutter fermé, la roue garde sa couleur', async () => {
    const { clock, controller } = await setup()
    const lit9 = controller.getFrame()
    expect([lit9[5], lit9[6], lit9[7]]).toEqual([255, 255, 10]) // dimmer, shutter ouvert, roue rouge

    controller.playScene('noir')
    await advanceAsync(clock, 200)
    const dark = controller.getFrame()
    expect([dark[5], dark[6], dark[7]]).toEqual([0, 0, 10])
    await controller.stop()
  })

  it('arrêt d’urgence : trame entièrement noire, roue et shutter compris', async () => {
    const { clock, controller, output } = await setup()
    controller.emergencyStop()
    await advanceAsync(clock, 200)
    expect(controller.getFrame().every((value) => value === 0)).toBe(true)
    expect(output.lastFrame().every((value) => value === 0)).toBe(true)
    await controller.stop()
    expect(output.lastFrame().every((value) => value === 0)).toBe(true)
  })
})
