import type { FixtureConfig } from '@hardware/dmx/fixtures'
import { parseRig, renderUniverse } from '@hardware/dmx/fixtures'
import { createScenePlayer } from '@hardware/lighting/scenePlayer'
import type { SceneDefinition } from '@hardware/lighting/scenes'
import {
  DEFAULT_DESK_COLORS,
  DEFAULT_SCENES,
  identifyScene,
  NEON,
  SCENE_IDS,
  stepDuration,
} from '@hardware/lighting/scenes'

import { RIG } from '../_helpers/rig'

const RED = { r: 255, g: 0, b: 0 }
const BLUE = { r: 0, g: 0, b: 255 }

/** Deux stroboscopes : un libre, un « dédié » au pupitre 1 (adresses 40-41 et 42-43). */
const STROBES: FixtureConfig[] = [
  { id: 'strobe-free', name: 'Strobe', profileId: 'strobe', address: 40 },
  { id: 'strobe-desk1', name: 'Strobe pupitre 1', profileId: 'strobe', address: 42, desk: 1 },
]

const setup = (rig: FixtureConfig[] = RIG) => {
  const onSmoke = vi.fn()
  const player = createScenePlayer({
    fixtures: parseRig(rig, []).fixtures,
    deskColors: DEFAULT_DESK_COLORS,
    onSmoke,
  })
  const state = (id: string) => player.states().get(id)
  return { player, onSmoke, state }
}

const scene = (steps: SceneDefinition['steps'], priority = 10): SceneDefinition => ({
  id: `scene-${priority}`,
  name: 'test',
  priority,
  steps,
})

describe('lecteur de scènes', () => {
  it('ne pilote pas la machine à fumée comme une lumière', () => {
    const { player } = setup()
    expect([...player.states().keys()]).toEqual(['par1', 'par2', 'head', 'wash'])
  })

  it('fait un fondu de couleur et d’intensité', () => {
    const { player, state } = setup()
    player.play(
      scene([{ type: 'color', color: RED, intensity: 1, fadeMs: 1_000 }]),
      { desk: null },
      0
    )
    player.update(500)
    expect(state('par1')).toMatchObject({ color: { r: 127.5 }, intensity: 0.5 })
    expect(player.currentSceneId()).toBe('scene-10')
    player.update(1_000)
    expect(state('wash')).toMatchObject({ color: { r: 255, g: 0, b: 0 }, intensity: 1 })
    expect(player.currentSceneId()).toBeNull()
    // L'état final reste affiché après la scène.
    player.update(5_000)
    expect(state('wash')?.color.r).toBe(255)
  })

  it('cible le pupitre concerné, les autres, ou une liste', () => {
    const { player, state } = setup()
    player.play(
      scene([
        { type: 'color', target: 'others', color: BLUE },
        { type: 'color', target: 'desk', color: 'desk', aim: 'desk' },
      ]),
      { desk: 2 },
      0
    )
    expect(state('par2')?.color).toMatchObject(DEFAULT_DESK_COLORS[2])
    expect(state('head')?.position).toEqual({ pan: 30_000, tilt: 40_000 })
    expect(state('head')?.color).toMatchObject(DEFAULT_DESK_COLORS[2])
    expect(state('par1')?.color).toMatchObject(BLUE)
    expect(state('wash')?.color).toMatchObject(BLUE)

    player.play(scene([{ type: 'color', target: ['par1'], color: RED }]), { desk: null }, 10)
    expect(state('par1')?.color).toMatchObject(RED)
    expect(state('wash')?.color).toMatchObject(BLUE)
  })

  it('sans pupitre, la cible « desk » est vide et la couleur pupitre est blanche', () => {
    const { player, state } = setup()
    player.play(
      scene([
        { type: 'color', target: 'desk', color: RED },
        { type: 'color', target: 'others', color: 'desk', aim: 'desk' },
      ]),
      { desk: null },
      0
    )
    expect(state('par1')?.color).toMatchObject({ r: 255, g: 255, b: 255 })
    expect(state('head')?.position).toBeNull()
  })

  it('ramène les lyres au repos', () => {
    const { player, state } = setup()
    player.play(scene([{ type: 'color', target: 'desk', color: RED, aim: 'desk' }]), { desk: 1 }, 0)
    expect(state('head')?.position).toEqual({ pan: 1_000, tilt: 2_000 })
    player.play(scene([{ type: 'color', color: RED }]), { desk: 1 }, 1)
    expect(state('head')?.position).toEqual({ pan: 1_000, tilt: 2_000 })
    player.play(scene([{ type: 'color', color: RED, aim: 'home' }]), { desk: 1 }, 2)
    expect(state('head')?.position).toBeNull()
  })

  it('garde la position si la lyre n’a rien d’enregistré pour ce pupitre', () => {
    const { player, state } = setup()
    player.play(scene([{ type: 'color', color: RED, aim: 'desk' }]), { desk: 4 }, 0)
    expect(state('head')?.position).toBeNull()
  })

  it('fait clignoter puis revient à l’état précédent', () => {
    const { player, state } = setup()
    player.play(
      scene([
        { type: 'color', color: BLUE, intensity: 0.3 },
        { type: 'flash', target: ['par1'], color: RED, count: 2, onMs: 100, offMs: 50 },
      ]),
      { desk: null },
      0
    )
    expect(state('par1')).toMatchObject({ color: RED, intensity: 1 })
    player.update(120)
    expect(state('par1')).toMatchObject({ color: BLUE, intensity: 0.3 })
    player.update(160)
    expect(state('par1')?.color).toMatchObject(RED)
    player.update(300)
    expect(state('par1')).toMatchObject({ color: BLUE, intensity: 0.3 })
    expect(player.currentSceneId()).toBeNull()
  })

  it('fait un fondu au noir', () => {
    const { player, state } = setup()
    player.play(
      scene([
        { type: 'color', color: RED },
        { type: 'blackout', fadeMs: 100 },
      ]),
      { desk: null },
      0
    )
    player.update(50)
    expect(state('par1')?.intensity).toBe(0.5)
    player.update(100)
    expect(state('par1')?.intensity).toBe(0)

    player.play(scene([{ type: 'color', color: RED }, { type: 'blackout' }]), { desk: null }, 200)
    expect(state('par2')?.intensity).toBe(0)
  })

  it('demande la fumée au contrôleur, sauf en rattrapage après un gel', () => {
    const { player, onSmoke } = setup()
    player.play(
      scene([
        { type: 'wait', durationMs: 100 },
        { type: 'smoke', durationMs: 2_000 },
      ]),
      { desk: null },
      0
    )
    player.update(100)
    expect(onSmoke).toHaveBeenCalledWith(2_000)

    onSmoke.mockClear()
    player.play(
      scene([
        { type: 'wait', durationMs: 100 },
        { type: 'smoke', durationMs: 2_000 },
      ]),
      { desk: null },
      1_000
    )
    player.update(5_000)
    expect(onSmoke).not.toHaveBeenCalled()
  })

  it('respecte la priorité des scènes', () => {
    const { player } = setup()
    const long = [{ type: 'wait' as const, durationMs: 1_000 }]
    expect(player.play(scene(long, 30), { desk: null }, 0)).toBe(true)
    expect(player.play(scene(long, 10), { desk: null }, 10)).toBe(false)
    expect(player.currentSceneId()).toBe('scene-30')
    expect(player.play(scene(long, 30), { desk: null }, 20)).toBe(true)
    player.update(2_000)
    expect(player.play(scene(long, 0), { desk: null }, 2_000)).toBe(true)
  })

  it('arrête et éteint', () => {
    const { player, state } = setup()
    player.play(scene([{ type: 'color', color: RED, holdMs: 1_000 }]), { desk: null }, 0)
    player.stop()
    expect(player.currentSceneId()).toBeNull()
    expect(state('par1')?.color).toMatchObject(RED)
    player.update(10)
    player.blackout()
    expect(state('par1')).toMatchObject({ intensity: 0, color: { r: 0 } })
  })

  it('joue toutes les scènes par défaut jusqu’au bout', () => {
    for (const definition of DEFAULT_SCENES) {
      const { player } = setup()
      player.play(definition, { desk: 1 }, 0)
      const total = definition.steps.reduce((sum, step) => sum + stepDuration(step), 0)
      player.update(total + 1)
      expect(player.currentSceneId()).toBeNull()
    }
  })

  it('calcule la durée des étapes', () => {
    expect(stepDuration({ type: 'color', color: RED })).toBe(0)
    expect(stepDuration({ type: 'blackout', fadeMs: 10, holdMs: 5 })).toBe(15)
    expect(stepDuration({ type: 'flash', color: RED, count: 2, onMs: 10, offMs: 5 })).toBe(30)
    expect(stepDuration({ type: 'wait', durationMs: -5 })).toBe(0)
    expect(stepDuration({ type: 'smoke', durationMs: 1_000 })).toBe(0)
  })
})

const defaultScene = (id: string) => DEFAULT_SCENES.find((definition) => definition.id === id)!
const totalDuration = (definition: SceneDefinition) =>
  definition.steps.reduce((sum, step) => sum + stepDuration(step), 0)

describe('stroboscopes : jamais pilotés par une scène qui ne les nomme pas', () => {
  const rig = [...RIG, ...STROBES]
  const fixtures = parseRig(rig, []).fixtures

  it('restent à zéro (gradateur et canal strobe) dans chaque scène par défaut', () => {
    for (const definition of DEFAULT_SCENES) {
      // Pupitre 1 (strobe dédié), pupitre 3 (aucun appareil) et aucun pupitre.
      for (const desk of [1, 3, null] as const) {
        const { player } = setup(rig)
        player.play(definition, { desk }, 0)
        for (let now = 0; now <= totalDuration(definition) + 100; now += 10) {
          player.update(now)
          const frame = renderUniverse(fixtures, player.states(), 0)
          // Adresses 40 à 43 : gradateur et strobe des deux stroboscopes.
          expect(
            [...frame.subarray(39, 43)],
            `${definition.id} pupitre ${desk} à ${now} ms`
          ).toEqual([0, 0, 0, 0])
        }
      }
    }
  })

  it('ne s’allument que si la cible les nomme', () => {
    const { player, state } = setup(rig)
    player.play(identifyScene('strobe-free'), { desk: null }, 0)
    expect(state('strobe-free')?.intensity).toBe(1)
    expect(state('strobe-desk1')?.intensity).toBe(0)
    expect(state('par1')?.intensity).toBe(0)
  })
})

describe('pupitre sans appareil', () => {
  // Pupitre 3 : ni PAR dédié, ni position de lyre enregistrée.
  it('le buzz éclaire toute la salle au lieu de l’assombrir', () => {
    const buzz = defaultScene(SCENE_IDS.BUZZ)
    const { player, state } = setup()
    player.play(buzz, { desk: 3 }, 0)
    player.update(totalDuration(buzz) + 1)
    for (const id of ['par1', 'par2', 'head', 'wash']) {
      expect(state(id), id).toMatchObject({ color: DEFAULT_DESK_COLORS[3], intensity: 1 })
    }
  })

  it('le buzz d’un pupitre équipé laisse les autres appareils en retrait', () => {
    const buzz = defaultScene(SCENE_IDS.BUZZ)
    const { player, state } = setup()
    player.play(buzz, { desk: 1 }, 0)
    player.update(totalDuration(buzz) + 1)
    expect(state('par1')).toMatchObject({ color: DEFAULT_DESK_COLORS[1], intensity: 1 })
    expect(state('par2')?.intensity).toBe(0.1)
    expect(state('wash')?.intensity).toBe(0.1)
  })

  it('« desk » vaut tout et « others » rien, sans toucher aux lumières déjà réglées', () => {
    const { player, state } = setup()
    player.play(
      scene([
        { type: 'color', target: 'others', color: BLUE },
        { type: 'color', target: 'desk', color: RED },
      ]),
      { desk: 3 },
      0
    )
    for (const id of ['par1', 'par2', 'head', 'wash']) {
      expect(state(id)?.color, id).toMatchObject(RED)
    }
  })

  it('victoire : la salle fait la fête au lieu d’être grisée', () => {
    const victory = defaultScene(SCENE_IDS.VICTORY)
    const { player, state } = setup()
    player.play(victory, { desk: 3 }, 0)
    // Pendant les flashs (300 ms de fondu, puis 100 ms allumé).
    player.update(350)
    for (const id of ['par1', 'par2', 'head', 'wash']) {
      expect(state(id), id).toMatchObject({ color: NEON.warn, intensity: 1 })
    }
  })
})

describe('victoire à égalité', () => {
  it('les flashs visent toute la salle', () => {
    const tie = defaultScene(SCENE_IDS.VICTORY_TIE)
    const { player, state, onSmoke } = setup()
    player.play(tie, { desk: null }, 0)
    expect(onSmoke).not.toHaveBeenCalled()
    // Fondu de 300 ms, puis la fumée (soumise au contrôleur), puis le premier flash allumé.
    player.update(350)
    expect(onSmoke).toHaveBeenCalledWith(3_000)
    for (const id of ['par1', 'par2', 'head', 'wash']) {
      expect(state(id), id).toMatchObject({ color: NEON.warn, intensity: 1 })
    }
  })

  it('ne flashe pas plus vite que la victoire d’un seul pupitre', () => {
    const period = (id: string) => {
      const flash = defaultScene(id).steps.find((step) => step.type === 'flash')
      return flash?.type === 'flash' ? flash.onMs + flash.offMs : 0
    }
    expect(period(SCENE_IDS.VICTORY_TIE)).toBeGreaterThanOrEqual(period(SCENE_IDS.VICTORY))
  })
})
