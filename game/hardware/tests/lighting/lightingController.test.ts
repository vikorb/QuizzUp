import type { DmxOutput } from '@hardware/dmx/output'
import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import {
  createLightingController,
  WATCHDOG_STALL_MS,
  WRITE_TIMEOUT_MS,
} from '@hardware/lighting/lightingController'
import { DEFAULT_DESK_COLORS, SCENE_IDS } from '@hardware/lighting/scenes'

import { advanceAsync, createManualClock, flushPromises } from '../_helpers/manualClock'
import { lightingConfig } from '../_helpers/rig'

const SMOKE_CHANNEL = 29

const setup = (overrides: Parameters<typeof lightingConfig>[0] = {}) => {
  const clock = createManualClock(10_000)
  const output = createSimulationOutput()
  const controller = createLightingController({
    config: lightingConfig(overrides),
    output,
    clock,
    doc: document,
    resolveDesk: (participantId) => (participantId === 11 ? 1 : participantId === 22 ? 2 : null),
  })
  return { clock, output, controller }
}

const frame = (output: ReturnType<typeof createSimulationOutput>) => output.lastFrame()

describe('contrôleur lumières et fumée', () => {
  let current: ReturnType<typeof setup> | null = null
  afterEach(async () => {
    await current?.controller.stop()
    current = null
    vi.restoreAllMocks()
  })

  it('démarre en simulation, envoie des trames en continu et joue le repos', async () => {
    current = setup()
    const { controller, output, clock } = current
    await controller.start()
    await controller.start()
    expect(controller.getState()).toMatchObject({
      running: true,
      driver: 'simulation',
      simulation: true,
      outputStatus: 'open',
      currentSceneId: SCENE_IDS.IDLE,
      problems: [],
    })
    const sent = output.framesSent()
    await advanceAsync(clock, 1_000)
    expect(output.framesSent()).toBeGreaterThan(sent)
    expect(frame(output)[19]).toBeGreaterThan(0)
  })

  it('associe les événements du moteur aux scènes, pupitre résolu', async () => {
    current = setup()
    const { controller, output, clock } = current
    await controller.start()

    controller.handleGameEvent({ type: 'buzzer_pressed', payload: { participantId: 22, stage: 1 } })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.BUZZ)
    await advanceAsync(clock, 1_000)
    const universe = frame(output)
    expect([...universe.subarray(3, 6)]).toEqual([
      DEFAULT_DESK_COLORS[2].r,
      DEFAULT_DESK_COLORS[2].g,
      DEFAULT_DESK_COLORS[2].b,
    ])
    // Lyre pointée sur le pupitre 2 (pan 30000 = 0x7530).
    expect([universe[9], universe[10]]).toEqual([0x75, 0x30])
  })

  it('accepte un pupitre déjà fourni dans l’événement', async () => {
    current = setup()
    await current.controller.start()
    current.controller.handleGameEvent({ type: 'round_chooser_selected', payload: { desk: 1 } })
    current.clock.advance(400)
    expect(
      current.controller.getFixtureViews().find((view) => view.id === 'head')?.position
    ).toEqual({
      pan: 1_000,
      tilt: 2_000,
    })
  })

  it('distingue question perdue et question gagnée', async () => {
    current = setup()
    await current.controller.start()
    current.controller.handleGameEvent({ type: 'question_ended', payload: { winnerIds: [11] } })
    expect(current.controller.getState().currentSceneId).toBe(SCENE_IDS.IDLE)
    current.clock.advance(2_000)
    current.controller.handleGameEvent({ type: 'question_ended', payload: { winnerIds: [] } })
    expect(current.controller.getState().currentSceneId).toBe(SCENE_IDS.LOST)
  })

  it('n’interrompt pas une bonne réponse par une scène moins prioritaire', async () => {
    current = setup()
    await current.controller.start()
    current.controller.handleGameEvent({ type: 'answer_correct', payload: { participantId: 11 } })
    current.controller.handleGameEvent({ type: 'blind_test_stage_started', payload: { stage: 2 } })
    expect(current.controller.getState().currentSceneId).toBe(SCENE_IDS.CORRECT)
  })

  it('ignore les événements sans scène et applique les surcharges de la salle', async () => {
    current = setup({
      bindings: { buzzer_pressed: null, round_ended: 'answer-wrong', points_awarded: 'nope' },
    })
    const warnings = vi.fn()
    current.controller.onWarning(warnings)
    await current.controller.start()
    current.controller.handleGameEvent({ type: 'points_awarded' })
    expect(warnings).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'unknown_scene', sceneId: 'nope' })
    )
    current.controller.handleGameEvent({ type: 'buzzer_pressed', payload: { participantId: 11 } })
    expect(current.controller.getState().currentSceneId).toBe(SCENE_IDS.IDLE)
    current.controller.handleGameEvent({ type: 'round_themes_offered' })
    current.controller.handleGameEvent({ type: 'round_ended' })
    expect(current.controller.getState().currentSceneId).toBe(SCENE_IDS.WRONG)
  })

  it('victoire : fumée seulement si elle est armée, et bornée', async () => {
    current = setup()
    const { controller, output, clock } = current
    const warnings = vi.fn()
    controller.onWarning(warnings)
    await controller.start()

    controller.handleGameEvent({ type: 'game_ended', payload: { winnerIds: [11] } })
    await advanceAsync(clock, 500)
    expect(frame(output)[SMOKE_CHANNEL]).toBe(0)
    expect(warnings).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'smoke_refused', reason: 'not_armed' })
    )

    await advanceAsync(clock, 20_000, 100)
    expect(controller.smoke.arm()).toBe(true)
    controller.handleGameEvent({ type: 'game_ended', payload: { winnerIds: [11] } })
    await advanceAsync(clock, 500)
    expect(frame(output)[SMOKE_CHANNEL]).toBe(180)
    expect(controller.getState().smoke.status).toBe('firing')

    await advanceAsync(clock, 3_000)
    expect(frame(output)[SMOKE_CHANNEL]).toBe(0)
    expect(controller.getState().smoke.status).toBe('cooldown')
  })

  it('victoire à égalité : pas de pupitre mis en avant', async () => {
    current = setup()
    await current.controller.start()
    current.controller.handleGameEvent({ type: 'game_ended', payload: { winnerIds: [11, 22] } })
    current.controller.handleGameEvent({ type: 'game_ended', payload: {} })
    expect(current.controller.getState().currentSceneId).toBe(SCENE_IDS.VICTORY)
  })

  it('test manuel de la fumée et arrêt', async () => {
    current = setup()
    const { controller, output, clock } = current
    await controller.start()
    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'not_armed' })
    controller.smoke.arm()
    expect(controller.smoke.fire(1_000)).toEqual({ ok: true, durationMs: 1_000 })
    await advanceAsync(clock, 100)
    expect(frame(output)[SMOKE_CHANNEL]).toBe(180)
    controller.smoke.stop()
    await advanceAsync(clock, 100)
    expect(frame(output)[SMOKE_CHANNEL]).toBe(0)
    controller.smoke.disarm()
    expect(controller.getState().smoke.armed).toBe(false)
  })

  it('chien de garde : coupe la fumée si la page a gelé', async () => {
    current = setup()
    const { controller, output, clock } = current
    const warnings = vi.fn()
    controller.onWarning(warnings)
    await controller.start()
    controller.smoke.arm()
    controller.smoke.fire(3_000)
    clock.advance(100)

    clock.jump(WATCHDOG_STALL_MS + 100)
    await advanceAsync(clock, 40)
    expect(warnings).toHaveBeenCalledWith(expect.objectContaining({ kind: 'watchdog' }))
    expect(frame(output)[SMOKE_CHANNEL]).toBe(0)
    expect(controller.getState().smoke.lastStopReason).toBe('watchdog')
  })

  it('coupe la fumée quand l’onglet est masqué ou fermé', async () => {
    current = setup()
    const { controller } = current
    await controller.start()
    controller.smoke.arm()
    controller.smoke.fire(3_000)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(controller.getState().smoke.lastStopReason).toBe('page_hidden')
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    current.clock.advance(40_000)
    controller.smoke.fire(3_000)
    window.dispatchEvent(new Event('pagehide'))
    expect(controller.getState().smoke.lastStopReason).toBe('shutdown')
  })

  it('arrêt d’urgence : noir complet, fumée verrouillée, réarmement manuel', async () => {
    current = setup()
    const { controller, output, clock } = current
    await controller.start()
    controller.smoke.arm()
    controller.smoke.fire(3_000)
    controller.emergencyStop('Bouton opérateur')
    await flushPromises()
    expect(frame(output).every((value) => value === 0)).toBe(true)
    expect(controller.getState()).toMatchObject({
      emergency: true,
      emergencyReason: 'Bouton opérateur',
    })
    expect(controller.playScene(SCENE_IDS.BUZZ)).toBe(false)
    expect(controller.identifyFixture('par1')).toBe(false)
    expect(controller.smoke.arm()).toBe(false)

    await advanceAsync(clock, 1_000)
    expect(frame(output).every((value) => value === 0)).toBe(true)

    controller.resetEmergency()
    controller.resetEmergency()
    expect(controller.getState()).toMatchObject({
      emergency: false,
      currentSceneId: SCENE_IDS.IDLE,
    })
    expect(controller.getState().smoke.armed).toBe(false)
  })

  it('identifie un appareil', async () => {
    current = setup()
    await current.controller.start()
    expect(current.controller.identifyFixture('inconnu')).toBe(false)
    expect(current.controller.identifyFixture('par1')).toBe(true)
    expect(current.controller.getState().currentSceneId).toBe(SCENE_IDS.IDENTIFY)
    const view = current.controller.getFixtureViews().find((fixture) => fixture.id === 'par1')
    expect(view).toMatchObject({ kind: 'par', desk: 1, intensity: 1 })
  })

  it('signale une interface débranchée et coupe la fumée', async () => {
    current = setup()
    const { controller, output } = current
    const warnings = vi.fn()
    controller.onWarning(warnings)
    await controller.start()
    controller.smoke.arm()
    controller.smoke.fire(3_000)
    output.simulateDisconnect(new Error('USB débranché'))
    output.simulateDisconnect(new Error('encore'))
    expect(controller.getState()).toMatchObject({
      outputStatus: 'error',
      outputError: 'USB débranché',
    })
    expect(controller.getState().smoke.status).toBe('cooldown')
    expect(warnings).toHaveBeenCalledTimes(1)
  })

  it('signale une écriture en échec et une ouverture en échec', async () => {
    const clock = createManualClock()
    const failing: DmxOutput = {
      driver: 'usbpro',
      open: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockRejectedValue('câble'),
      close: vi.fn().mockResolvedValue(undefined),
      onDisconnect: () => () => undefined,
    }
    const controller = createLightingController({
      config: lightingConfig(),
      output: failing,
      clock,
      doc: null,
    })
    await controller.start()
    await flushPromises()
    expect(controller.getState()).toMatchObject({
      outputStatus: 'error',
      outputError: 'câble',
      simulation: false,
    })

    const refusing: DmxOutput = { ...failing, open: vi.fn().mockRejectedValue(new Error('refusé')) }
    await controller.setOutput(refusing)
    expect(controller.getState()).toMatchObject({ outputStatus: 'error', outputError: 'refusé' })
    await controller.stop()
  })

  it('ne cumule pas les écritures lentes mais envoie toujours la dernière trame', async () => {
    const clock = createManualClock()
    const releases: (() => void)[] = []
    const written: Uint8Array[] = []
    const slow: DmxOutput = {
      driver: 'usbpro',
      open: async () => undefined,
      write: vi.fn(
        (universe: Uint8Array) =>
          new Promise<void>((resolve) => {
            written.push(universe.slice())
            releases.push(resolve)
          })
      ),
      close: async () => undefined,
      onDisconnect: () => () => undefined,
    }
    const controller = createLightingController({
      config: lightingConfig(),
      output: slow,
      clock,
      doc: null,
    })
    await controller.start()
    clock.advance(200)
    expect(slow.write).toHaveBeenCalledTimes(1)

    controller.emergencyStop()
    releases.shift()?.()
    await flushPromises()
    expect(slow.write).toHaveBeenCalledTimes(2)
    expect(written[1]?.every((value) => value === 0)).toBe(true)

    // Interface bloquée : la fermeture n'attend pas plus que le délai prévu.
    const stopping = controller.stop()
    await advanceAsync(clock, 600)
    await stopping
    expect(controller.getState().outputStatus).toBe('closed')
  })

  it('bascule de la simulation vers une interface réelle', async () => {
    current = setup()
    const { controller, output } = current
    await controller.start()
    const next = createSimulationOutput()
    await controller.setOutput(next)
    expect(output.lastFrame().every((value) => value === 0)).toBe(true)
    expect(controller.getState().outputStatus).toBe('open')

    const offline = setup()
    await offline.controller.setOutput(createSimulationOutput())
    expect(offline.controller.getState()).toMatchObject({ running: false, outputStatus: 'closed' })
  })

  it('éteint et ferme la sortie à l’arrêt', async () => {
    current = setup()
    const { controller, output } = current
    const changes = vi.fn()
    controller.onChange(changes)
    await controller.start()
    controller.playScene(SCENE_IDS.CORRECT, { desk: 1 })
    await controller.stop()
    await controller.stop()
    expect(output.lastFrame().every((value) => value === 0)).toBe(true)
    expect(controller.getState()).toMatchObject({ running: false, outputStatus: 'closed' })
    expect(changes).toHaveBeenCalled()
    expect(controller.getFrame().every((value) => value === 0)).toBe(true)
  })

  it('accepte des scènes sur mesure et signale les problèmes de config', async () => {
    const clock = createManualClock()
    const controller = createLightingController({
      config: lightingConfig({ fixtures: [{ id: 'x', name: 'X', profileId: 'nope', address: 1 }] }),
      output: createSimulationOutput(),
      clock,
      scenes: [
        { id: SCENE_IDS.IDLE, name: 'Repos maison', priority: 0, steps: [{ type: 'blackout' }] },
      ],
    })
    expect(controller.getState().problems).toHaveLength(1)
    expect(controller.getFixtureViews()).toEqual([])
    await controller.start()
    expect(controller.playScene('inconnue')).toBe(false)
    await controller.stop()
  })

  it('changement de sortie : la trame noire part en dernier sur l’ancienne interface', async () => {
    const clock = createManualClock()
    const written: Uint8Array[] = []
    let closed = false
    const slowBlack: DmxOutput = {
      driver: 'usbpro',
      open: async () => undefined,
      write: vi.fn((universe: Uint8Array) => {
        if (closed) {
          throw new Error('écriture après fermeture')
        }
        written.push(universe.slice())
        return new Promise<void>((resolve) => clock.setTimeout(resolve, 100))
      }),
      close: async () => {
        closed = true
      },
      onDisconnect: () => () => undefined,
    }
    const controller = createLightingController({
      config: lightingConfig(),
      output: slowBlack,
      clock,
      doc: null,
    })
    await controller.start()
    controller.smoke.arm()
    controller.handleGameEvent({
      type: 'game_ended',
      payload: { reason: 'completed', winnerIds: [] },
    })
    await advanceAsync(clock, 400)

    const next = createSimulationOutput()
    const switching = controller.setOutput(next)
    await advanceAsync(clock, 1_000)
    await switching

    expect(closed).toBe(true)
    expect(written.at(-1)?.every((value) => value === 0)).toBe(true)
    expect(controller.getState().outputStatus).toBe('open')
    await advanceAsync(clock, 100)
    expect(next.framesSent()).toBeGreaterThan(0)
    await controller.stop()
  })

  it('stop() pendant start() : aucune boucle fantôme', async () => {
    const clock = createManualClock()
    let finishOpen: () => void = () => undefined
    const output = createSimulationOutput()
    const opening: DmxOutput = {
      ...output,
      open: () => new Promise<void>((resolve) => (finishOpen = resolve)),
    }
    const controller = createLightingController({
      config: lightingConfig(),
      output: opening,
      clock,
      doc: null,
    })
    const starting = controller.start()
    const stopping = controller.stop()
    finishOpen()
    await starting
    await stopping
    const sent = output.framesSent()
    await advanceAsync(clock, 500)
    expect(output.framesSent()).toBe(sent)
    expect(clock.pending()).toBe(0)
    expect(controller.getState()).toMatchObject({ running: false, outputStatus: 'closed' })
  })

  it('refuse la fumée tant que l’onglet est masqué', async () => {
    current = setup()
    const { controller } = current
    await controller.start()
    controller.smoke.arm()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'page_hidden' })
    visibility.mockReturnValue('visible')
    expect(controller.smoke.fire(1_000).ok).toBe(true)
  })

  it('signale une interface bloquée et coupe la fumée', async () => {
    const clock = createManualClock()
    const stuck: DmxOutput = {
      driver: 'usbpro',
      open: async () => undefined,
      write: () => new Promise<void>(() => undefined),
      close: async () => undefined,
      onDisconnect: () => () => undefined,
    }
    const controller = createLightingController({
      config: lightingConfig(),
      output: stuck,
      clock,
      doc: null,
    })
    await controller.start()
    controller.smoke.arm()
    controller.smoke.fire(3_000)
    await advanceAsync(clock, WRITE_TIMEOUT_MS + 50)
    expect(controller.getState()).toMatchObject({ outputStatus: 'error' })
    expect(controller.getState().outputError).toContain('bloquée')
    expect(controller.getState().smoke.status).toBe('cooldown')
    const stopping = controller.stop()
    await advanceAsync(clock, 600)
    await stopping
  })

  it('pas de victoire ni de fumée pour une partie terminée faute de contenu', async () => {
    current = setup()
    await current.controller.start()
    current.controller.smoke.arm()
    current.controller.handleGameEvent({
      type: 'game_ended',
      payload: { reason: 'no_content', winnerIds: [11] },
    })
    expect(current.controller.getState().currentSceneId).toBe(SCENE_IDS.IDLE)
    expect(current.controller.getState().smoke.status).toBe('ready')
  })

  it('borne la fréquence d’envoi', async () => {
    const clock = createManualClock()
    const output = createSimulationOutput()
    const controller = createLightingController({
      config: lightingConfig({ refreshHz: 0 }),
      output,
      clock,
      doc: null,
    })
    await controller.start()
    await advanceAsync(clock, 1_000)
    expect(output.framesSent()).toBeGreaterThanOrEqual(9)
    expect(output.framesSent()).toBeLessThanOrEqual(12)
    await controller.stop()
    const nan = createLightingController({
      config: lightingConfig({ refreshHz: Number.NaN }),
      output: createSimulationOutput(),
      clock,
      doc: null,
    })
    await nan.start()
    await nan.stop()
  })
})
