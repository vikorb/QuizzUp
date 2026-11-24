import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import { createLightingController } from '@hardware/lighting/lightingController'
import {
  DEFAULT_BINDINGS,
  DEFAULT_SCENES,
  SCENE_IDS,
  stepDuration,
} from '@hardware/lighting/scenes'

import { advanceAsync, createManualClock, flushPromises } from '../_helpers/manualClock'
import { lightingConfig } from '../_helpers/rig'

const SMOKE_CHANNEL = 29
const SMOKE_LEVEL = 180
const COOLDOWN_MS = 30_000

/** Contrôleur démarré, fumée armée. Pas de `doc` : le test ne touche pas à la visibilité. */
async function setup() {
  const clock = createManualClock(10_000)
  const output = createSimulationOutput()
  const controller = createLightingController({
    config: lightingConfig(),
    output,
    clock,
    doc: null,
  })
  await controller.start()
  controller.smoke.arm()
  return { clock, output, controller }
}

describe('contrôleur de lumières : partie en pause', () => {
  let controller: Awaited<ReturnType<typeof setup>>['controller'] | null = null
  afterEach(async () => {
    await controller?.stop()
    controller = null
  })

  it('couper la fumée à la pause envoie la trame à 0 tout de suite, sans attendre le tick', async () => {
    const ctx = await setup()
    controller = ctx.controller
    expect(controller.smoke.fire(3_000)).toMatchObject({ ok: true })
    await advanceAsync(ctx.clock, 100)
    expect(ctx.output.lastFrame()[SMOKE_CHANNEL]).toBe(SMOKE_LEVEL)

    controller.setGamePaused(true)
    // Aucune avance de l'horloge : seule la trame envoyée à la coupure peut avoir changé.
    await flushPromises()

    expect(ctx.output.lastFrame()[SMOKE_CHANNEL]).toBe(0)
    expect(controller.getState().smoke).toMatchObject({ status: 'cooldown', level: 0 })
  })

  it('smoke.stop() envoie aussi la trame à 0 tout de suite', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.smoke.fire(3_000)
    await advanceAsync(ctx.clock, 100)

    controller.smoke.stop()
    await flushPromises()

    expect(ctx.output.lastFrame()[SMOKE_CHANNEL]).toBe(0)
  })

  it('refuse tout jet manuel pendant la pause avec le motif paused', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.setGamePaused(true)

    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'paused' })
    expect(controller.getState().smoke.status).toBe('ready')
  })

  it('une scène lancée avant la pause ne tire pas la fumée pendant la pause', async () => {
    const ctx = await setup()
    controller = ctx.controller
    const warnings = vi.fn()
    controller.onWarning(warnings)
    // Victoire : fondu de 300 ms, puis étape `smoke`.
    controller.playScene(SCENE_IDS.VICTORY, { desk: 1 })
    controller.setGamePaused(true)

    await advanceAsync(ctx.clock, 500)

    expect(controller.getState().smoke.status).toBe('ready')
    expect(ctx.output.lastFrame()[SMOKE_CHANNEL]).toBe(0)
    expect(warnings).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'smoke_refused', reason: 'paused' })
    )
    // Les lumières, elles, continuent : la scène n'est pas arrêtée.
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.VICTORY)
  })

  it('l’étape refusée pendant la pause est perdue : rien ne repart à la reprise', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.playScene(SCENE_IDS.VICTORY, { desk: 1 })
    controller.setGamePaused(true)
    await advanceAsync(ctx.clock, 500)

    controller.setGamePaused(false)
    await advanceAsync(ctx.clock, 1_000)

    expect(controller.getState().smoke.status).toBe('ready')
  })

  it('à la reprise un jet repart, mais le temps de repos du jet coupé reste dû', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.smoke.fire(3_000)
    await advanceAsync(ctx.clock, 100)
    controller.setGamePaused(true)
    controller.setGamePaused(false)

    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'cooldown' })

    await advanceAsync(ctx.clock, COOLDOWN_MS + 100, 100)
    expect(controller.smoke.fire(1_000)).toMatchObject({ ok: true })
  })

  it('à la reprise sans jet coupé, un jet repart tout de suite', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.setGamePaused(true)
    controller.setGamePaused(false)

    expect(controller.smoke.fire(1_000)).toMatchObject({ ok: true })
  })

  it('l’arrêt d’urgence pendant la pause reste verrouillé et prioritaire', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.setGamePaused(true)
    controller.emergencyStop('Bouton opérateur')

    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'emergency' })
    expect(controller.smoke.arm()).toBe(false)
    controller.setGamePaused(false)
    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'emergency' })
    expect(controller.getState()).toMatchObject({ emergency: true })
  })

  it('le test de gel ne peut pas tirer pendant la pause', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.diagnostics.begin()
    controller.setGamePaused(true)

    expect(controller.smoke.fire(3_000)).toEqual({ ok: false, reason: 'paused' })
  })

  it('mettre en pause pendant un test de gel le coupe et exige un nouvel armement', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.diagnostics.begin()
    controller.smoke.fire(3_000)
    controller.diagnostics.freezeOutput(5_000, { confirm: true })
    expect(controller.diagnostics.getState().frozenUntil).not.toBeNull()

    controller.setGamePaused(true)
    await flushPromises()

    expect(controller.diagnostics.getState().frozenUntil).toBeNull()
    expect(controller.getState().smoke).toMatchObject({ status: 'cooldown', armed: false })
    expect(ctx.output.lastFrame()[SMOKE_CHANNEL]).toBe(0)
  })

  it('setGamePaused est sans effet quand l’état ne change pas', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.smoke.fire(3_000)

    controller.setGamePaused(false)

    expect(controller.getState().smoke.status).toBe('firing')
  })

  it('game_aborted ramène au repos même si une scène plus prioritaire tourne', async () => {
    const ctx = await setup()
    controller = ctx.controller
    controller.handleGameEvent({ type: 'answer_correct', payload: { desk: 1 } })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.CORRECT)

    controller.handleGameEvent({ type: 'game_aborted' })

    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.IDLE)
  })

  describe('scène `pause` et signaux game_paused / game_resumed', () => {
    const pauseScene = () => DEFAULT_SCENES.find((scene) => scene.id === SCENE_IDS.PAUSE)!

    it('liaisons par défaut : game_paused → pause, game_resumed → question, session_exit aucune', () => {
      expect(DEFAULT_BINDINGS.game_paused).toBe(SCENE_IDS.PAUSE)
      expect(DEFAULT_BINDINGS.game_resumed).toBe(SCENE_IDS.QUESTION)
      expect(DEFAULT_BINDINGS).not.toHaveProperty('session_exit')
    })

    it('la scène pause : priorité 60, un fondu de 400 ms, ni flash ni fumée', () => {
      const scene = pauseScene()

      expect(scene.priority).toBe(60)
      expect(scene.next).toBeUndefined()
      expect(scene.steps.map((step) => step.type)).toEqual(['color'])
      expect(scene.steps.reduce((sum, step) => sum + stepDuration(step), 0)).toBe(400)
    })

    it('game_paused joue pause et interrompt une scène de jeu prioritaire', async () => {
      const ctx = await setup()
      controller = ctx.controller
      controller.handleGameEvent({ type: 'answer_correct', payload: { desk: 1 } })
      expect(controller.getState().currentSceneId).toBe(SCENE_IDS.CORRECT)

      controller.handleGameEvent({ type: 'game_paused' })

      expect(controller.getState().currentSceneId).toBe(SCENE_IDS.PAUSE)
    })

    it('la scène pause ne tire aucun jet et ne relâche pas la coupure de la pause', async () => {
      const ctx = await setup()
      controller = ctx.controller
      controller.smoke.fire(3_000)
      await advanceAsync(ctx.clock, 100)

      controller.setGamePaused(true)
      controller.handleGameEvent({ type: 'game_paused' })
      await advanceAsync(ctx.clock, 1_000)

      expect(ctx.output.lastFrame()[SMOKE_CHANNEL]).toBe(0)
      expect(controller.getState().smoke).toMatchObject({ status: 'cooldown', level: 0 })
      expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'paused' })
    })

    it('game_resumed joue question une fois la scène pause terminée', async () => {
      const ctx = await setup()
      controller = ctx.controller
      controller.handleGameEvent({ type: 'game_paused' })
      await advanceAsync(ctx.clock, 600)

      controller.handleGameEvent({ type: 'game_resumed' })

      expect(controller.getState().currentSceneId).toBe(SCENE_IDS.QUESTION)
    })

    it('game_resumed reprend même si la scène pause tourne encore (reprise en moins de 400 ms)', async () => {
      const ctx = await setup()
      controller = ctx.controller
      controller.handleGameEvent({ type: 'game_paused' })
      await advanceAsync(ctx.clock, 100)
      expect(controller.getState().currentSceneId).toBe(SCENE_IDS.PAUSE)

      controller.handleGameEvent({ type: 'game_resumed' })

      expect(controller.getState().currentSceneId).toBe(SCENE_IDS.QUESTION)
    })

    it('une salle qui coupe la liaison game_paused garde ses lumières', async () => {
      const clock = createManualClock(10_000)
      const quiet = createLightingController({
        config: lightingConfig({ bindings: { game_paused: null } }),
        output: createSimulationOutput(),
        clock,
        doc: null,
      })
      await quiet.start()
      controller = quiet

      quiet.handleGameEvent({ type: 'game_paused' })

      expect(quiet.getState().currentSceneId).toBe(SCENE_IDS.IDLE)
    })
  })
})
