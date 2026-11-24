import { defaultRoomHardwareConfig, parseRoomHardwareConfig } from '@hardware/config'
import type { FixtureConfig } from '@hardware/dmx/fixtures'
import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import { createLightingController } from '@hardware/lighting/lightingController'
import type { ExitLightConfig } from '@hardware/lighting/scenes'
import {
  DEFAULT_BINDINGS,
  DEFAULT_EXIT,
  DEFAULT_SCENES,
  defaultScenesFor,
  exitScene,
  SCENE_IDS,
  stepDuration,
} from '@hardware/lighting/scenes'
import { parseExit, parseScenes } from '@hardware/lighting/showConfig'

import { createManualClock } from '../_helpers/manualClock'
import { lightingConfig, RIG } from '../_helpers/rig'

const SMOKE_INDEX = 29
const WARM = { r: 255, g: 180, b: 107, w: 255 }
const STROBE: FixtureConfig = { id: 'strobe', name: 'Strobe', profileId: 'strobe', address: 40 }

/** Réglage court pour des tests rapides : 1 s d'attente, 2 s de maintien, fondus de 3 s. */
const SHORT: ExitLightConfig = { ...DEFAULT_EXIT, delayMs: 1_000, holdMs: 2_000 }
const FADE_MS = 3_000

const duration = (id: string) =>
  DEFAULT_SCENES.find((scene) => scene.id === id)!.steps.reduce(
    (sum, step) => sum + stepDuration(step),
    0
  )
const VICTORY_MS = duration(SCENE_IDS.VICTORY)

const WINNER = { type: 'game_ended', payload: { desk: 1, winnerIds: [1] } }
const INCOMPLETE = { type: 'game_ended', payload: { reason: 'no_content', winnerIds: [] } }

/** Avance seconde par seconde et relève la scène en cours à chaque pas. */
const sampleScenes = (
  clock: ReturnType<typeof createManualClock>,
  scene: () => string | null,
  seconds: number
) => {
  const seen = new Set<string | null>()
  for (let at = 0; at < seconds; at += 1) {
    clock.advance(1_000)
    seen.add(scene())
  }
  return seen
}

const setup = (overrides: Parameters<typeof lightingConfig>[0] = {}) => {
  const clock = createManualClock(10_000)
  const controller = createLightingController({
    config: lightingConfig({ exit: SHORT, ...overrides }),
    output: createSimulationOutput(),
    clock,
    doc: document,
  })
  const wash = () => controller.getFixtureViews().find((view) => view.id === 'wash')!
  const scene = () => controller.getState().currentSceneId
  return { clock, controller, wash, scene }
}

describe('exitScene : la scène générée', () => {
  it('attend, s’allume en 3 s, reste allumée puis enchaîne l’extinction', () => {
    const generated = exitScene(SHORT)
    expect(generated).toMatchObject({ id: 'exit', priority: 15, next: 'exit-off' })
    expect(generated.steps).toEqual([
      { type: 'wait', durationMs: 1_000 },
      {
        type: 'color',
        color: WARM,
        intensity: 1,
        fadeMs: FADE_MS,
        holdMs: 2_000,
        aim: 'home',
      },
    ])
  })

  it('suit le réglage de la salle : couleur, intensité, délai, maintien', () => {
    const custom = {
      enabled: true,
      delayMs: 5,
      holdMs: 7,
      intensity: 0.5,
      color: { r: 1, g: 2, b: 3 },
    }
    expect(exitScene(custom).steps).toEqual([
      { type: 'wait', durationMs: 5 },
      {
        type: 'color',
        color: custom.color,
        intensity: 0.5,
        fadeMs: FADE_MS,
        holdMs: 7,
        aim: 'home',
      },
    ])
  })

  it('n’a ni flash, ni fumée, ni stroboscope, ni cible limitée : fondus seulement', () => {
    for (const generated of [
      exitScene(),
      ...DEFAULT_SCENES.filter((entry) => entry.id === 'exit-off'),
    ]) {
      for (const step of generated.steps) {
        expect(['wait', 'color']).toContain(step.type)
        expect(step).not.toHaveProperty('target')
      }
    }
  })

  it('par défaut : 10 s après la victoire, 5 min, blanc chaud fort, activée', () => {
    expect(DEFAULT_EXIT).toEqual({
      enabled: true,
      delayMs: 10_000,
      holdMs: 300_000,
      intensity: 1,
      color: WARM,
    })
    expect(DEFAULT_BINDINGS.game_ended_incomplete).toBe('exit')
    expect(DEFAULT_SCENES.find((entry) => entry.id === 'victory')?.next).toBe('exit')
    expect(DEFAULT_SCENES.find((entry) => entry.id === 'victory-tie')?.next).toBe('exit')
  })

  it('la victoire n’enchaîne plus rien quand la sortie est coupée', () => {
    const scenes = defaultScenesFor({ ...DEFAULT_EXIT, enabled: false })
    expect(scenes.find((entry) => entry.id === 'victory')).not.toHaveProperty('next')
    expect(scenes.find((entry) => entry.id === 'victory-tie')).not.toHaveProperty('next')
    // Les scènes livrées ne sont jamais modifiées.
    expect(DEFAULT_SCENES.find((entry) => entry.id === 'victory')?.next).toBe('exit')
  })
})

describe('scène de sortie dans le contrôleur', () => {
  let current: ReturnType<typeof setup> | null = null
  afterEach(async () => {
    await current?.controller.stop()
    current = null
  })

  it('après la victoire : attente, allumage en 3 s, maintien, extinction, puis rien', async () => {
    current = setup()
    const { controller, clock, wash, scene } = current
    await controller.start()
    controller.handleGameEvent(WINNER)
    expect(scene()).toBe('victory')

    clock.advance(VICTORY_MS - 100)
    expect(scene()).toBe('victory')

    // Fin de la victoire : la sortie attend son délai, la salle garde l'ambiance de victoire.
    clock.advance(100 + 500)
    expect(scene()).toBe('exit')
    expect(wash().intensity).toBeCloseTo(0.3)

    // Délai écoulé, fondu de 3 s en cours : ni éteint ni encore au maximum.
    clock.advance(500 + FADE_MS / 2)
    expect(wash().intensity).toBeGreaterThan(0.3)
    expect(wash().intensity).toBeLessThan(1)

    clock.advance(FADE_MS / 2 + 500)
    expect(scene()).toBe('exit')
    expect(wash().intensity).toBe(1)
    expect(wash().color).toMatchObject(WARM)

    // Maintien terminé : extinction vers l'ambiance, puis la scène est finie.
    clock.advance(2_000)
    expect(scene()).toBe('exit-off')
    clock.advance(FADE_MS + 100)
    expect(scene()).toBeNull()
    expect(wash().intensity).toBeCloseTo(0.3)
  })

  it('l’égalité enchaîne aussi la sortie', async () => {
    current = setup()
    const { controller, clock, scene } = current
    await controller.start()
    controller.handleGameEvent({ type: 'game_ended', payload: { winnerIds: [1, 2] } })
    expect(scene()).toBe('victory-tie')
    clock.advance(duration(SCENE_IDS.VICTORY_TIE) + 100)
    expect(scene()).toBe('exit')
  })

  it('une partie terminée faute de contenu mène directement à la sortie', async () => {
    current = setup()
    const { controller, clock, scene, wash } = current
    await controller.start()
    controller.handleGameEvent(INCOMPLETE)
    expect(scene()).toBe('exit')
    clock.advance(1_000 + FADE_MS + 100)
    expect(wash().intensity).toBe(1)
  })

  it('la liaison de la salle l’emporte sur la sortie par défaut', async () => {
    current = setup({ bindings: { game_ended_incomplete: null } })
    const { controller } = current
    await controller.start()
    controller.handleGameEvent(INCOMPLETE)
    expect(controller.getState().currentSceneId).not.toBe('exit')
  })

  it('la lumière de sortie attendue du délai par défaut est de 10 s sans réglage de salle', async () => {
    current = setup({ exit: undefined })
    const { controller, clock, scene, wash } = current
    await controller.start()
    clock.advance(2_000)
    controller.handleGameEvent(INCOMPLETE)
    clock.advance(9_900)
    expect(wash().intensity).toBeCloseTo(0.3)
    clock.advance(100 + FADE_MS + 100)
    expect(wash().intensity).toBe(1)
    clock.advance(300_000)
    expect(scene()).toBe('exit-off')
  })

  describe('interruption', () => {
    it('une nouvelle partie coupe la sortie pendant l’attente', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(500)
      controller.handleGameEvent({ type: 'game_started' })
      expect(scene()).toBe('game-start')
      // Rien ne relance la sortie après le début de partie.
      const seen = sampleScenes(clock, scene, 60)
      expect(seen).not.toContain('exit')
      expect(seen).not.toContain('exit-off')
    })

    it('une nouvelle partie coupe la sortie allumée, sans extinction ensuite', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(1_000 + FADE_MS + 500)
      controller.handleGameEvent({ type: 'game_started' })
      expect(scene()).toBe('game-start')
      const seen = new Set<string | null>()
      for (let at = 0; at < 60; at += 1) {
        clock.advance(1_000)
        seen.add(scene())
      }
      expect(seen).not.toContain('exit')
      expect(seen).not.toContain('exit-off')
    })

    it('une scène de question (priorité 10) n’éteint pas la sortie', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(2_000)
      controller.handleGameEvent({ type: 'question_started' })
      expect(scene()).toBe('exit')
    })

    it('l’arrêt de partie rend la main au repos', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(2_000)
      controller.handleGameEvent({ type: 'game_aborted' })
      expect(scene()).toBe('idle')
    })

    it('exit-off éteint la sortie à la demande', async () => {
      current = setup()
      const { controller, clock, scene, wash } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(1_000 + FADE_MS + 500)
      expect(wash().intensity).toBe(1)
      expect(controller.playScene('exit-off')).toBe(true)
      clock.advance(FADE_MS + 100)
      expect(scene()).toBeNull()
      expect(wash().intensity).toBeCloseTo(0.3)
    })

    it('le bouton de l’écran de fin (playScene) lance la sortie après une victoire', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(WINNER)
      clock.advance(VICTORY_MS + 1_000)
      controller.handleGameEvent({ type: 'game_aborted' })
      expect(controller.playScene('exit')).toBe(true)
      clock.advance(1_000 + FADE_MS + 100)
      expect(scene()).toBe('exit')
    })
  })

  describe('repos demandé par l’opérateur et début de partie', () => {
    const SIX_MINUTES = 6 * 60
    const FULL = { exit: DEFAULT_EXIT }

    // Le bouton « victoire » de l'écran Matériel, puis le bouton « repos », à trois moments.
    it.each([
      ['pendant la victoire', 2_000],
      ['pendant l’attente de la sortie', VICTORY_MS + 500],
      ['pendant le maintien de la sortie', VICTORY_MS + DEFAULT_EXIT.delayMs + FADE_MS + 500],
    ])('repos %s : tout de suite, et la sortie ne revient pas', async (_when, after) => {
      current = setup(FULL)
      const { controller, clock, scene, wash } = current
      await controller.start()
      expect(controller.playScene('victory')).toBe(true)
      clock.advance(after)

      expect(controller.playScene('idle')).toBe(true)
      expect(scene()).toBe('idle')
      clock.advance(2_000)
      expect(wash().intensity).toBeCloseTo(0.3)

      const seen = sampleScenes(clock, scene, SIX_MINUTES)
      expect(seen).not.toContain('victory')
      expect(seen).not.toContain('exit')
      expect(seen).not.toContain('exit-off')
      expect(wash().intensity).toBeCloseTo(0.3)
    })

    it('le repos demandé ne change pas les priorités entre événements de jeu', async () => {
      // Une liaison de la salle vers « idle » passe par le chemin des événements : la sortie reste.
      current = setup({ bindings: { question_started: 'idle' } })
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(2_000)
      controller.handleGameEvent({ type: 'question_started' })
      expect(scene()).toBe('exit')
    })

    it('un début de partie pendant la victoire n’est pas suivi d’une sortie', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(WINNER)
      clock.advance(2_000)
      controller.handleGameEvent({ type: 'game_started' })
      expect(scene()).toBe('game-start')
      controller.handleGameEvent({ type: 'question_started' })

      const seen = sampleScenes(clock, scene, 90)
      expect(seen).not.toContain('victory')
      expect(seen).not.toContain('exit')
      expect(seen).not.toContain('exit-off')
    })

    it('même chose pour une égalité', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent({ type: 'game_ended', payload: { winnerIds: [1, 2] } })
      clock.advance(2_000)
      controller.handleGameEvent({ type: 'game_started' })
      expect(scene()).toBe('game-start')
      const seen = sampleScenes(clock, scene, 90)
      expect(seen).not.toContain('victory-tie')
      expect(seen).not.toContain('exit')
    })
  })

  describe('arrêt d’urgence et arrêt des lumières', () => {
    it('l’arrêt d’urgence éteint tout, et la sortie ne repart pas au réarmement', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(1_000 + FADE_MS + 500)

      controller.emergencyStop()
      expect(controller.playScene('exit')).toBe(false)
      clock.advance(10_000)
      expect(controller.getFrame().every((value) => value === 0)).toBe(true)
      expect(controller.getState().emergency).toBe(true)

      controller.resetEmergency()
      expect(scene()).toBe('idle')
      const seen = new Set<string | null>()
      for (let at = 0; at < 30; at += 1) {
        clock.advance(1_000)
        seen.add(scene())
      }
      expect(seen).not.toContain('exit')
      expect(seen).not.toContain('exit-off')
    })

    it('l’arrêt d’urgence pendant l’attente annule aussi la sortie', async () => {
      current = setup()
      const { controller, clock, scene } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(300)
      controller.emergencyStop()
      clock.advance(20_000)
      expect(controller.getFrame().every((value) => value === 0)).toBe(true)
      controller.resetEmergency()
      const seen = sampleScenes(clock, scene, 20)
      expect(seen).not.toContain('exit')
      expect(seen).not.toContain('exit-off')
    })

    it('l’arrêt des lumières coupe la sortie', async () => {
      current = setup()
      const { controller, clock } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(1_000 + FADE_MS + 500)
      await controller.stop()
      expect(controller.getState().currentSceneId).toBeNull()
      clock.advance(20_000)
      expect(controller.getFrame().every((value) => value === 0)).toBe(true)
    })
  })

  describe('enabled: false', () => {
    const disabled = { exit: { ...SHORT, enabled: false } }

    it('rien ne s’enchaîne après la victoire', async () => {
      current = setup(disabled)
      const { controller, clock, scene, wash } = current
      await controller.start()
      controller.handleGameEvent(WINNER)
      clock.advance(VICTORY_MS + 100)
      expect(scene()).toBeNull()
      clock.advance(60_000)
      expect(scene()).toBeNull()
      expect(wash().intensity).toBeLessThan(1)
    })

    it('une partie incomplète n’allume pas la sortie toute seule', async () => {
      current = setup(disabled)
      const { controller, clock, scene, wash } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      expect(scene()).not.toBe('exit')
      // Plus longtemps que la sortie courte (9 s) : si elle partait, on la verrait.
      for (let at = 0; at < 12; at += 1) {
        clock.advance(1_000)
        expect(scene()).not.toBe('exit')
        expect(wash().intensity).toBeLessThanOrEqual(0.3 + 1e-9)
      }
    })

    it('le bouton de l’écran de fin reste possible', async () => {
      current = setup(disabled)
      const { controller, scene } = current
      await controller.start()
      expect(controller.playScene('exit')).toBe(true)
      expect(scene()).toBe('exit')
    })

    it('une liaison explicite de la salle sur la partie incomplète est respectée', async () => {
      current = setup({ ...disabled, bindings: { game_ended_incomplete: 'exit' } })
      const { controller } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      expect(controller.getState().currentSceneId).toBe('exit')
    })
  })

  describe('sécurité : ni fumée ni stroboscope', () => {
    it('la sortie ne demande aucune fumée, même armée (partie incomplète)', async () => {
      current = setup()
      const { controller, clock } = current
      const warnings = vi.fn()
      controller.onWarning(warnings)
      await controller.start()
      controller.smoke.arm()
      controller.handleGameEvent(INCOMPLETE)
      for (let at = 0; at < 12; at += 1) {
        clock.advance(1_000)
        expect(controller.getFrame()[SMOKE_INDEX]).toBe(0)
      }
      expect(controller.getState().smoke.status).toBe('ready')
      expect(warnings).not.toHaveBeenCalled()
    })

    it('après la victoire : un seul jet (celui de la victoire), aucun pendant la sortie', async () => {
      current = setup()
      const { controller, clock, scene } = current
      const warnings = vi.fn()
      controller.onWarning(warnings)
      await controller.start()
      controller.smoke.arm()
      const fired: number[] = []
      controller.onChange((state) => {
        if (state.smoke.status === 'firing') {
          fired.push(clock.now())
        }
      })
      controller.handleGameEvent(WINNER)
      // Jusqu'à la fin de la sortie : victoire, attente, allumage, maintien, extinction.
      for (let at = 0; at < VICTORY_MS + 12_000; at += 100) {
        clock.advance(100)
        if (scene() === 'exit' || scene() === 'exit-off') {
          expect(controller.getFrame()[SMOKE_INDEX]).toBe(0)
        }
      }
      expect(scene()).toBeNull()
      expect(fired.length).toBeGreaterThanOrEqual(1)
      // Tous les jets sont partis pendant la victoire.
      expect(Math.max(...fired) - 10_000).toBeLessThan(VICTORY_MS)
      expect(warnings).not.toHaveBeenCalled()
    })

    const shortWait = { type: 'wait', durationMs: 500 }
    const withoutSmoke = [
      { id: 'victory', name: 'v', priority: 50, steps: [shortWait] },
      { id: 'victory-tie', name: 'v', priority: 50, steps: [shortWait] },
    ]
    const smokeThenLight = [
      { type: 'smoke', durationMs: 2_000 },
      { type: 'color', color: WARM, fadeMs: 500, holdMs: 500 },
    ]

    it('cas A : une sortie de la salle avec fumée ne jette rien à la fin d’une partie incomplète', async () => {
      current = setup({
        scenes: [
          ...withoutSmoke,
          { id: 'exit', name: 'x', priority: 15, steps: smokeThenLight },
        ] as never,
      })
      const { controller, clock } = current
      await controller.start()
      controller.smoke.arm()
      controller.handleGameEvent(INCOMPLETE)
      for (let at = 0; at < 12; at += 1) {
        clock.advance(1_000)
        expect(controller.getFrame()[SMOKE_INDEX]).toBe(0)
        expect(controller.getState().smoke.status).toBe('ready')
      }
    })

    it('cas B : une extinction de la salle avec fumée ne jette rien au bouton « Éteindre la sortie »', async () => {
      current = setup({
        scenes: [
          ...withoutSmoke,
          { id: 'exit', name: 'x', priority: 15, steps: [smokeThenLight[1]], next: 'exit-off' },
          { id: 'exit-off', name: 'x', priority: 15, steps: smokeThenLight },
        ] as never,
      })
      const { controller, clock } = current
      await controller.start()
      controller.smoke.arm()
      controller.handleGameEvent(INCOMPLETE)
      clock.advance(1_500)
      expect(controller.playScene('exit-off')).toBe(true)
      for (let at = 0; at < 12; at += 1) {
        clock.advance(1_000)
        expect(controller.getFrame()[SMOKE_INDEX]).toBe(0)
        expect(controller.getState().smoke.status).toBe('ready')
      }
    })

    it('un stroboscope reste éteint pendant toute la sortie', async () => {
      current = setup({ fixtures: [...RIG, STROBE] })
      const { controller, clock } = current
      await controller.start()
      controller.handleGameEvent(INCOMPLETE)
      let brightest = 0
      for (let at = 0; at < 10; at += 1) {
        clock.advance(1_000)
        const views = controller.getFixtureViews()
        const strobe = views.find((view) => view.id === 'strobe')!
        expect(strobe.intensity).toBe(0)
        brightest = Math.max(brightest, views.find((view) => view.id === 'par1')!.intensity)
      }
      // Les autres appareils, eux, ont bien été allumés à fond.
      expect(brightest).toBe(1)
    })
  })
})

describe('lighting.exit : lecture de la configuration', () => {
  it('une configuration d’avant ce bloc reste valide, sans problème ni bloc ajouté', () => {
    const old = {
      version: 1,
      desksCount: 4,
      lighting: { driver: 'simulation', refreshHz: 30, fixtures: [], bindings: {} },
    }
    const { config, problems } = parseRoomHardwareConfig(old)
    expect(problems).toEqual([])
    expect(config.lighting).not.toHaveProperty('exit')
    expect(parseRoomHardwareConfig(config).config).toEqual(config)
    expect(parseExit(undefined)).toEqual({ exit: undefined, problems: [] })
    expect(parseExit(null)).toEqual({ exit: undefined, problems: [] })
    expect(defaultRoomHardwareConfig().lighting).not.toHaveProperty('exit')
  })

  it('une salle sans bloc a la sortie par défaut dans le contrôleur', () => {
    const { config } = parseRoomHardwareConfig({ lighting: { fixtures: RIG } })
    const controller = createLightingController({
      config: config.lighting,
      output: createSimulationOutput(),
      clock: createManualClock(),
      doc: null,
    })
    expect(controller.playScene('exit')).toBe(true)
  })

  it('relit un bloc complet et l’écrit tel quel', () => {
    const exit = { enabled: false, delayMs: 2_000, holdMs: 60_000, intensity: 0.5, color: WARM }
    const { config, problems } = parseRoomHardwareConfig({ lighting: { exit } })
    expect(problems).toEqual([])
    expect(config.lighting.exit).toEqual(exit)
    expect(parseRoomHardwareConfig(config).config.lighting.exit).toEqual(exit)
  })

  it('un bloc partiel prend les valeurs par défaut pour le reste', () => {
    expect(parseExit({ holdMs: 1_000 })).toEqual({
      exit: { ...DEFAULT_EXIT, holdMs: 1_000 },
      problems: [],
    })
    expect(parseExit({}).exit).toEqual(DEFAULT_EXIT)
  })

  it('ramène les durées et l’intensité dans leurs bornes, et le dit', () => {
    const { exit, problems } = parseExit({ delayMs: 99_999_999, holdMs: -5, intensity: 3 })
    expect(exit).toMatchObject({ delayMs: 600_000, holdMs: DEFAULT_EXIT.holdMs, intensity: 1 })
    expect(problems).toHaveLength(3)
    expect(parseExit({ intensity: -1 }).exit?.intensity).toBe(0)
  })

  it('signale une lumière de sortie qui plongerait la salle dans le noir, sans la corriger', () => {
    const dark = parseExit({ intensity: 0 })
    expect(dark.exit?.intensity).toBe(0)
    expect(dark.problems).toEqual([expect.stringContaining('intensity à 0')])

    const black = parseExit({ color: { r: 0, g: 0, b: 0 } })
    expect(black.exit?.color).toEqual({ r: 0, g: 0, b: 0 })
    expect(black.problems).toEqual([expect.stringContaining('color noire')])
    expect(parseExit({ color: { r: 0, g: 0, b: 0, w: 1 } }).problems).toEqual([])
    expect(parseExit({ intensity: 0.1 }).problems).toEqual([])
  })

  it('écarte les valeurs de mauvais type sans rien bloquer', () => {
    const { exit, problems } = parseExit({
      enabled: 'oui',
      delayMs: 'vite',
      intensity: 'fort',
      color: 'desk',
    })
    expect(exit).toEqual(DEFAULT_EXIT)
    expect(problems).toHaveLength(4)
    expect(parseExit({ color: { r: 'x' } }).exit?.color).toEqual(DEFAULT_EXIT.color)
    expect(parseExit({ color: { r: 999, g: 0, b: -3 } }).exit?.color).toEqual({
      r: 255,
      g: 0,
      b: 0,
    })
  })

  it('refuse un bloc qui n’est pas un objet, sans bloquer la relecture', () => {
    for (const input of [5, 'x', [1]]) {
      const { config, problems } = parseRoomHardwareConfig({ lighting: { exit: input } })
      expect(problems).toContain('lighting.exit doit être un objet')
      expect(config.lighting).not.toHaveProperty('exit')
    }
  })

  it('le contrôleur reborne un bloc qui n’est pas passé par la relecture', async () => {
    const clock = createManualClock(10_000)
    const controller = createLightingController({
      config: lightingConfig({ exit: { ...SHORT, delayMs: Number.NaN, intensity: 9 } }),
      output: createSimulationOutput(),
      clock,
      doc: null,
    })
    await controller.start()
    clock.advance(2_000)
    controller.handleGameEvent(INCOMPLETE)
    clock.advance(DEFAULT_EXIT.delayMs - 100)
    expect(controller.getFixtureViews().find((view) => view.id === 'wash')!.intensity).toBeCloseTo(
      0.3
    )
    clock.advance(100 + FADE_MS + 100)
    expect(controller.getFixtureViews().find((view) => view.id === 'wash')!.intensity).toBe(1)
    await controller.stop()
  })
})

describe('parseScenes : la sortie par défaut ne s’ouvre à aucun détour', () => {
  const wait = { type: 'wait', durationMs: 500 }
  const LIGHT = { r: 1, g: 2, b: 3 }

  it('refuse une boucle qui passe par la victoire et la sortie livrées', () => {
    const { scenes, problems } = parseScenes([
      { id: 'exit-off', name: 'x', priority: 10, steps: [wait], next: 'victory' },
    ])
    expect(problems).toEqual([expect.stringContaining('passe par une scène par défaut')])
    expect(scenes[0]).not.toHaveProperty('next')
  })

  it('refuse aussi la boucle quand la salle remplace la sortie', () => {
    const { scenes, problems } = parseScenes([
      { id: 'exit', name: 'x', priority: 10, steps: [wait], next: 'victory' },
    ])
    expect(problems).toHaveLength(1)
    expect(scenes[0]).not.toHaveProperty('next')
  })

  it('une fumée dans la scène de sortie de la salle est retirée après la victoire', () => {
    const { scenes, problems } = parseScenes([
      { id: 'exit', name: 'x', priority: 15, steps: [{ type: 'smoke', durationMs: 2_000 }, wait] },
    ])
    expect(problems).toEqual([expect.stringContaining('pas de fumée dans la sortie')])
    expect(scenes[0]!.steps.some((step) => step.type === 'smoke')).toBe(false)
  })

  it('cas A : une sortie de la salle avec fumée la perd, même quand la victoire n’en a pas', () => {
    const quiet = (id: string) => ({ id, name: 'v', priority: 50, steps: [wait] })
    const { scenes, problems } = parseScenes([
      quiet('victory'),
      quiet('victory-tie'),
      {
        id: 'exit',
        name: 'x',
        priority: 15,
        steps: [
          { type: 'smoke', durationMs: 2_000 },
          { type: 'color', color: LIGHT },
        ],
      },
    ])
    expect(problems).toEqual([expect.stringContaining('pas de fumée dans la sortie')])
    const exit = scenes.find((scene) => scene.id === 'exit')!
    expect(exit.steps.map((step) => step.type)).toEqual(['color'])
  })

  it('cas B : une extinction de la salle avec fumée la perd aussi', () => {
    const { scenes, problems } = parseScenes([
      { id: 'exit', name: 'x', priority: 15, steps: [wait], next: 'exit-off' },
      {
        id: 'exit-off',
        name: 'x',
        priority: 15,
        steps: [
          { type: 'smoke', durationMs: 2_000 },
          { type: 'color', color: LIGHT },
        ],
      },
    ])
    expect(problems).toEqual([expect.stringContaining('pas de fumée dans la sortie')])
    const off = scenes.find((scene) => scene.id === 'exit-off')!
    expect(off.steps.map((step) => step.type)).toEqual(['color'])
  })

  it('une sortie réduite à une fumée garde une attente nulle, jamais une scène vide', () => {
    const { scenes } = parseScenes([
      { id: 'exit', name: 'x', priority: 15, steps: [{ type: 'smoke', durationMs: 2_000 }] },
    ])
    expect(scenes[0]!.steps).toEqual([{ type: 'wait', durationMs: 0 }])
  })

  it('les scènes livrées ne sont jamais modifiées par la relecture', () => {
    const before = JSON.stringify(DEFAULT_SCENES)
    parseScenes([
      { id: 'exit-off', name: 'x', priority: 10, steps: [wait], next: 'victory' },
      { id: 'exit', name: 'x', priority: 10, steps: [{ type: 'smoke', durationMs: 2_000 }, wait] },
    ])
    expect(JSON.stringify(DEFAULT_SCENES)).toBe(before)
  })
})
