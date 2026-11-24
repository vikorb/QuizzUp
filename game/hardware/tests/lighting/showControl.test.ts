import { parseRig } from '@hardware/dmx/fixtures'
import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import { createLightingController } from '@hardware/lighting/lightingController'
import { createScenePlayer } from '@hardware/lighting/scenePlayer'
import type { SceneDefinition } from '@hardware/lighting/scenes'
import { DEFAULT_DESK_COLORS, SCENE_IDS, SHOW_CUES } from '@hardware/lighting/scenes'

import { advanceAsync, createManualClock } from '../_helpers/manualClock'
import { lightingConfig, RIG } from '../_helpers/rig'

const SMOKE_CHANNEL = 29
const RED = { r: 255, g: 0, b: 0 }

const wait = (durationMs: number) => ({ type: 'wait' as const, durationMs })
const show = (id: string, steps: SceneDefinition['steps'], over: Partial<SceneDefinition> = {}) =>
  ({ id, name: id, priority: 10, steps, ...over }) satisfies SceneDefinition

const setup = (overrides: Parameters<typeof lightingConfig>[0] = {}) => {
  const clock = createManualClock(10_000)
  const output = createSimulationOutput()
  const controller = createLightingController({
    config: lightingConfig(overrides),
    output,
    clock,
    doc: document,
  })
  return { clock, output, controller }
}

describe('show réglable : enchaînement de scènes (lecteur)', () => {
  const withScenes = (scenes: SceneDefinition[]) => {
    const byId = new Map(scenes.map((entry) => [entry.id, entry]))
    const onSmoke = vi.fn()
    const instance = createScenePlayer({
      fixtures: parseRig(RIG, []).fixtures,
      deskColors: DEFAULT_DESK_COLORS,
      onSmoke,
      resolveScene: (id) => byId.get(id),
    })
    return { instance, onSmoke, byId }
  }

  it('lance la scène suivante à la fin de la première, avec le même pupitre', () => {
    const { instance, byId } = withScenes([
      show('a', [wait(500)], { next: 'b' }),
      show('b', [{ type: 'color', target: 'desk', color: 'desk' }, wait(500)], { priority: 30 }),
    ])
    instance.play(byId.get('a') as SceneDefinition, { desk: 2 }, 0)
    instance.update(499)
    expect(instance.currentSceneId()).toBe('a')
    instance.update(500)
    expect(instance.currentSceneId()).toBe('b')
    expect(instance.states().get('par2')?.color).toMatchObject(DEFAULT_DESK_COLORS[2])
    instance.update(1_000)
    expect(instance.currentSceneId()).toBeNull()
  })

  it('la scène suivante garde sa propre priorité', () => {
    const { instance, byId } = withScenes([
      show('a', [wait(100)], { next: 'b' }),
      show('b', [wait(1_000)], { priority: 40 }),
    ])
    instance.play(byId.get('a') as SceneDefinition, { desk: null }, 0)
    instance.update(200)
    expect(instance.play(show('basse', [wait(10)], { priority: 20 }), { desk: null }, 300)).toBe(
      false
    )
    expect(instance.currentSceneId()).toBe('b')
  })

  it('une scène qui se désigne elle-même boucle, et une autre scène l’interrompt', () => {
    const { instance, byId } = withScenes([show('boucle', [wait(300)], { next: 'boucle' })])
    instance.play(byId.get('boucle') as SceneDefinition, { desk: null }, 0)
    for (const at of [300, 600, 3_000, 10_000]) {
      instance.update(at)
      expect(instance.currentSceneId()).toBe('boucle')
    }
    expect(instance.play(show('autre', [wait(10)], { priority: 10 }), { desk: null }, 10_000)).toBe(
      true
    )
    expect(instance.currentSceneId()).toBe('autre')
  })

  it('une scène suivante inconnue termine la chaîne', () => {
    const { instance, byId } = withScenes([show('a', [wait(100)], { next: 'absente' })])
    instance.play(byId.get('a') as SceneDefinition, { desk: null }, 0)
    instance.update(200)
    expect(instance.currentSceneId()).toBeNull()
  })

  it('une boucle de durée nulle non bornée par parseScenes ne bloque pas le lecteur', () => {
    const { instance, byId } = withScenes([
      show('nulle', [{ type: 'color', color: RED }], { next: 'nulle' }),
    ])
    instance.play(byId.get('nulle') as SceneDefinition, { desk: null }, 0)
    expect(() => instance.update(5_000)).not.toThrow()
    expect(instance.currentSceneId()).toBe('nulle')
  })

  it('une fumée de la scène suivante part à l’heure, pas après un gel de la page', () => {
    const chain = [
      show('a', [wait(1_000)], { next: 'b' }),
      show('b', [{ type: 'smoke', durationMs: 2_000 }, wait(100)]),
    ]
    const onTime = withScenes(chain)
    onTime.instance.play(chain[0] as SceneDefinition, { desk: null }, 0)
    onTime.instance.update(1_000)
    expect(onTime.onSmoke).toHaveBeenCalledWith(2_000)

    const frozen = withScenes(chain)
    frozen.instance.play(chain[0] as SceneDefinition, { desk: null }, 0)
    frozen.instance.update(5_000)
    expect(frozen.onSmoke).not.toHaveBeenCalled()
  })
})

describe('show réglable : scènes de la salle dans le contrôleur', () => {
  let current: ReturnType<typeof setup> | null = null
  afterEach(async () => {
    await current?.controller.stop()
    current = null
  })

  it('une scène de salle remplace la scène par défaut du même identifiant', async () => {
    current = setup({
      scenes: [
        show('question-lost', [{ type: 'color', color: { r: 1, g: 2, b: 3 }, intensity: 1 }], {
          priority: 40,
        }),
      ],
    })
    const { controller, clock } = current
    await controller.start()
    controller.handleGameEvent({ type: 'question_ended', payload: { winnerIds: [] } })
    await advanceAsync(clock, 100, 50)
    const par = controller.getFixtureViews().find((view) => view.id === 'par1')
    expect(par?.color).toMatchObject({ r: 1, g: 2, b: 3 })
  })

  it('enchaîne deux scènes de la salle', async () => {
    current = setup({
      bindings: { signal: 'a' },
      scenes: [show('a', [wait(500)], { next: 'b' }), show('b', [wait(2_000)])],
    })
    const { controller, clock } = current
    await controller.start()
    controller.handleGameEvent({ type: 'signal' })
    expect(controller.getState().currentSceneId).toBe('a')
    await advanceAsync(clock, 600, 100)
    expect(controller.getState().currentSceneId).toBe('b')
  })

  it('la scène identify n’est pas surchargeable, même sans passer par parseRoomHardwareConfig', async () => {
    current = setup({
      scenes: [show('identify', [{ type: 'color', color: RED }], { priority: 90 })],
    })
    const { controller } = current
    const warnings = vi.fn()
    controller.onWarning(warnings)
    await controller.start()
    expect(controller.playScene('identify')).toBe(false)
    expect(warnings).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unknown_scene' }))
    expect(controller.identifyFixture('par1')).toBe(true)
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.IDENTIFY)
  })

  it('la fumée est refusée dans une boucle, même sans passer par parseRoomHardwareConfig', async () => {
    current = setup({
      bindings: { signal: 'boucle' },
      scenes: [
        show('boucle', [{ type: 'smoke', durationMs: 2_000 }, wait(400)], { next: 'boucle' }),
      ],
    })
    const { controller, clock, output } = current
    await controller.start()
    expect(controller.smoke.arm()).toBe(true)
    controller.handleGameEvent({ type: 'signal' })
    await advanceAsync(clock, 3_000, 100)
    expect(controller.getState().currentSceneId).toBe('boucle')
    expect(controller.getState().smoke.status).toBe('ready')
    expect(output.lastFrame()[SMOKE_CHANNEL]).toBe(0)
  })

  describe('fumée d’une scène enchaînée', () => {
    const chain = [
      show('a', [wait(1_000)], { next: 'b' }),
      show('b', [{ type: 'smoke', durationMs: 2_000 }, wait(100)]),
    ]

    it('part une fois la scène précédente terminée, si elle est armée', async () => {
      current = setup({ bindings: { signal: 'a' }, scenes: chain })
      const { controller, clock } = current
      await controller.start()
      controller.smoke.arm()
      controller.handleGameEvent({ type: 'signal' })
      await advanceAsync(clock, 1_200, 100)
      expect(controller.getState().smoke.status).toBe('firing')
    })

    it('ne part pas en retard quand le navigateur a gelé la page', async () => {
      current = setup({ bindings: { signal: 'a' }, scenes: chain })
      const { controller, clock, output } = current
      await controller.start()
      controller.smoke.arm()
      controller.handleGameEvent({ type: 'signal' })
      clock.jump(5_000)
      await advanceAsync(clock, 100, 50)
      expect(controller.getState().smoke.status).toBe('ready')
      expect(output.lastFrame()[SMOKE_CHANNEL]).toBe(0)
    })

    it('reste soumise à l’armement', async () => {
      current = setup({ bindings: { signal: 'a' }, scenes: chain })
      const { controller, clock } = current
      const warnings = vi.fn()
      controller.onWarning(warnings)
      await controller.start()
      controller.handleGameEvent({ type: 'signal' })
      await advanceAsync(clock, 1_200, 100)
      expect(warnings).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'smoke_refused', reason: 'not_armed' })
      )
    })

    it('reste soumise à la pause de la partie et à l’arrêt d’urgence', async () => {
      current = setup({ bindings: { signal: 'a' }, scenes: chain })
      const { controller, clock } = current
      await controller.start()
      controller.smoke.arm()
      controller.handleGameEvent({ type: 'signal' })
      controller.setGamePaused(true)
      await advanceAsync(clock, 1_200, 100)
      expect(controller.getState().smoke.status).toBe('ready')

      controller.setGamePaused(false)
      controller.emergencyStop()
      expect(controller.playScene('a')).toBe(false)
      expect(controller.getState().smoke.status).toBe('emergency')
    })
  })
})

describe('show réglable : clés d’événement', () => {
  let current: ReturnType<typeof setup> | null = null
  afterEach(async () => {
    await current?.controller.stop()
    current = null
  })

  it('round_started.<miniGame> l’emporte sur round_started', async () => {
    current = setup({ bindings: { 'round_started.sudden_death': SCENE_IDS.LOST } })
    const { controller } = current
    await controller.start()
    controller.handleGameEvent({ type: 'round_started', payload: { miniGame: 'sudden_death' } })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.LOST)
  })

  it('round_started sert de repli aux autres mini-jeux et aux événements sans mini-jeu', async () => {
    current = setup({ bindings: { 'round_started.sudden_death': SCENE_IDS.LOST } })
    const { controller } = current
    await controller.start()
    controller.handleGameEvent({ type: 'round_started', payload: { miniGame: 'streak' } })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.ROUND_START)
    controller.handleGameEvent({ type: 'game_aborted' })
    controller.handleGameEvent({ type: 'round_started', payload: { miniGame: 7 } })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.ROUND_START)
    controller.handleGameEvent({ type: 'game_aborted' })
    controller.handleGameEvent({ type: 'round_started' })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.ROUND_START)
  })

  it('round_started.<miniGame> à null coupe la scène de ce mini-jeu seulement', async () => {
    current = setup({ bindings: { 'round_started.true_false': null } })
    const { controller } = current
    await controller.start()
    controller.handleGameEvent({ type: 'round_started', payload: { miniGame: 'true_false' } })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.IDLE)
    controller.handleGameEvent({ type: 'round_started', payload: { miniGame: 'streak' } })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.ROUND_START)
  })

  it('SHOW_CUES : trois signaux de l’écran de salle, seule la sortie sans liaison par défaut', async () => {
    expect([...SHOW_CUES]).toEqual(['game_paused', 'game_resumed', 'session_exit'])
    current = setup()
    const { controller } = current
    await controller.start()
    controller.handleGameEvent({ type: 'session_exit' })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.IDLE)
  })

  it('SHOW_CUES : une liaison de la salle lance sa scène', async () => {
    current = setup({ bindings: { game_paused: SCENE_IDS.LOST } })
    const { controller } = current
    await controller.start()
    controller.handleGameEvent({ type: 'game_paused' })
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.LOST)
  })
})
