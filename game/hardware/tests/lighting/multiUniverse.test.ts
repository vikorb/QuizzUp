import type { DmxOutput } from '@hardware/dmx/output'
import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import { createLightingController } from '@hardware/lighting/lightingController'
import { SCENE_IDS } from '@hardware/lighting/scenes'

import { advanceAsync, createManualClock } from '../_helpers/manualClock'
import { lightingConfig, RIG } from '../_helpers/rig'

/** Salle sur 2 univers : le PAR 1 reste sur l'univers 0, l'ambiance et la fumée passent sur le 1. */
const RIG_TWO = RIG.map((fixture) =>
  fixture.id === 'wash' || fixture.id === 'smoke' ? { ...fixture, universe: 1 } : fixture
)

const setup = (driverOutput?: DmxOutput) => {
  const clock = createManualClock(10_000)
  const output = driverOutput ?? createSimulationOutput()
  const controller = createLightingController({
    config: lightingConfig({ fixtures: RIG_TWO }),
    output,
    clock,
    doc: document,
  })
  return { clock, output, controller }
}

/** Sortie qui note chaque écriture (univers, premier canal des appareils) et se fait passer pour `driver`. */
function recordingOutput(driver: DmxOutput['driver']) {
  const writes: { universe: number; data: Uint8Array }[] = []
  const output: DmxOutput = {
    driver,
    open: async () => undefined,
    write: async (data, universe = 0) => {
      writes.push({ universe, data: data.slice() })
    },
    close: async () => undefined,
    onDisconnect: () => () => undefined,
  }
  return { output, writes }
}

describe('contrôleur lumières sur plusieurs univers', () => {
  let current: ReturnType<typeof setup> | null = null
  afterEach(async () => {
    await current?.controller.stop()
    current = null
  })

  it('émet chaque univers séparément, l’univers 0 en premier', async () => {
    const recorder = recordingOutput('artnet-bridge')
    current = setup(recorder.output)
    const { controller, clock } = current
    await controller.start()
    await advanceAsync(clock, 200)
    const universes = recorder.writes.map((write) => write.universe)
    expect(new Set(universes)).toEqual(new Set([0, 1]))
    // Les écritures vont par paire : 0 puis 1.
    expect(universes.slice(0, 2)).toEqual([0, 1])
    // L'ambiance (canal 20 de l'univers 1) s'allume sur l'univers 1 seulement.
    controller.playScene(SCENE_IDS.IDLE)
    await advanceAsync(clock, 200)
    expect(controller.getFrame(1)[19]).toBeGreaterThan(0)
    expect(controller.getFrame(0)[19]).toBe(0)
    expect(controller.getState().problems).toEqual([])
  })

  it('sur une interface USB, n’envoie que l’univers 0 et signale les appareils déplacés', async () => {
    const recorder = recordingOutput('usbpro')
    current = setup(recorder.output)
    const { controller, clock } = current
    await controller.start()
    await advanceAsync(clock, 200)
    expect(new Set(recorder.writes.map((write) => write.universe))).toEqual(new Set([0]))
    expect(controller.getState().problems).toEqual([
      expect.stringContaining('« Ambiance » : univers 1 non pris en charge'),
      expect.stringContaining('« Fumée » : univers 1 non pris en charge'),
    ])
  })

  it('pont ancien (1 univers annoncé) : seul l’univers 0 part et les autres sont signalés', async () => {
    const recorder = recordingOutput('artnet-bridge')
    current = setup({ ...recorder.output, universeCount: () => 1 })
    const { controller, clock } = current
    await controller.start()
    await advanceAsync(clock, 200)
    expect(new Set(recorder.writes.map((write) => write.universe))).toEqual(new Set([0]))
    expect(controller.getState().problems).toEqual([
      expect.stringContaining('« Ambiance » : univers 1 non pris en charge'),
      expect.stringContaining('« Fumée » : univers 1 non pris en charge'),
    ])
  })

  it('le problème suit la sortie quand on change d’interface', async () => {
    current = setup()
    const { controller } = current
    await controller.start()
    expect(controller.getState().problems).toEqual([])
    await controller.setOutput(recordingOutput('usbpro').output)
    expect(controller.getState().problems).toHaveLength(2)
  })

  it('arrêt d’urgence et fermeture : du noir sur chaque univers', async () => {
    const recorder = recordingOutput('artnet-bridge')
    current = setup(recorder.output)
    const { controller, clock } = current
    await controller.start()
    await advanceAsync(clock, 200)
    controller.emergencyStop()
    await advanceAsync(clock, 100)
    const last = [0, 1].map((number) =>
      recorder.writes.findLast((write) => write.universe === number)!
    )
    for (const write of last) {
      expect(write.data.every((value) => value === 0)).toBe(true)
    }
    await controller.stop()
    expect(recorder.writes.slice(-2).map((write) => write.universe)).toEqual([0, 1])
  })

  it('diagnostic : canal brut et appareil réglés sur le bon univers', async () => {
    current = setup()
    const { controller, clock, output } = current
    const sim = output as ReturnType<typeof createSimulationOutput>
    await controller.start()
    expect(controller.diagnostics.begin()).toEqual({ ok: true })
    // Canal 20 : appareil « Ambiance » sur l'univers 1 seulement.
    expect(controller.diagnostics.setChannel(20, 200, 0)).toEqual({
      ok: false,
      reason: 'unknown_channel',
    })
    expect(controller.diagnostics.setChannel(20, 200, 1)).toEqual({ ok: true })
    // Canal 30 de l'univers 1 : fumée, jamais à la main ; le même canal sur l'univers 0 est libre.
    expect(controller.diagnostics.setChannel(30, 255, 1)).toEqual({
      ok: false,
      reason: 'smoke_channel',
    })
    expect(controller.diagnostics.setChannel(5, 1, 16)).toEqual({
      ok: false,
      reason: 'invalid_address',
    })
    expect(
      controller.diagnostics.setFixture('wash', { color: { r: 255, g: 0, b: 0 }, intensity: 1 })
    ).toEqual({ ok: true })
    await advanceAsync(clock, 200)
    expect(sim.lastFrame(1)[19]).toBeGreaterThan(0)
    expect(sim.lastFrame(0)[19]).toBe(0)
    // Mêmes adresses sur l'univers 0 : rien n'est touché.
    expect(
      sim
        .lastFrame(0)
        .slice(19, 24)
        .every((value) => value === 0)
    ).toBe(true)
    controller.diagnostics.clear()
    await advanceAsync(clock, 100)
    expect(sim.lastFrame(1)[19]).toBe(0)
  })

  it('sécurité : un univers sans appareil réglé au diagnostic passe au noir à l’arrêt d’urgence', async () => {
    const recorder = recordingOutput('artnet-bridge')
    current = setup(recorder.output)
    const { controller, clock } = current
    await controller.start()
    expect(controller.diagnostics.begin({ allowUnknownChannels: true })).toEqual({ ok: true })
    expect(controller.diagnostics.setChannel(7, 200, 3)).toEqual({ ok: true })
    await advanceAsync(clock, 200)
    expect(recorder.writes.findLast((write) => write.universe === 3)!.data[6]).toBe(200)

    controller.emergencyStop()
    await advanceAsync(clock, 100)
    const last = recorder.writes.findLast((write) => write.universe === 3)!
    expect(last.data.every((value) => value === 0)).toBe(true)
  })

  it('la fin du diagnostic remet à zéro l’univers sans appareil', async () => {
    const recorder = recordingOutput('artnet-bridge')
    current = setup(recorder.output)
    const { controller, clock } = current
    await controller.start()
    controller.diagnostics.begin({ allowUnknownChannels: true })
    controller.diagnostics.setChannel(7, 200, 3)
    await advanceAsync(clock, 200)
    controller.diagnostics.end()
    await advanceAsync(clock, 200)
    const last = recorder.writes.findLast((write) => write.universe === 3)!
    expect(last.data.every((value) => value === 0)).toBe(true)
  })

  it('un univers retiré de la config passe au noir quand l’ancien contrôleur s’arrête', async () => {
    const recorder = recordingOutput('artnet-bridge')
    current = setup(recorder.output)
    const { controller, clock } = current
    await controller.start()
    controller.playScene(SCENE_IDS.IDLE)
    await advanceAsync(clock, 200)
    expect(recorder.writes.findLast((write) => write.universe === 1)!.data[19]).toBeGreaterThan(0)
    await controller.stop()
    // Nouvelle config sans univers 1 sur la même sortie : l'univers 1 est déjà au noir.
    const last = recorder.writes.findLast((write) => write.universe === 1)!
    expect(last.data.every((value) => value === 0)).toBe(true)
    const next = createLightingController({
      config: lightingConfig({ fixtures: RIG }),
      output: recorder.output,
      clock,
      doc: document,
    })
    await next.start()
    await advanceAsync(clock, 200)
    await next.stop()
    expect(recorder.writes.findLast((write) => write.universe === 1)).toBe(last)
  })
})
