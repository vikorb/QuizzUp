import { parseRig } from '@hardware/dmx/fixtures'
import { createScenePlayer } from '@hardware/lighting/scenePlayer'
import type { SceneDefinition } from '@hardware/lighting/scenes'
import { DEFAULT_DESK_COLORS, DEFAULT_SCENES, stepDuration } from '@hardware/lighting/scenes'

import { RIG } from '../_helpers/rig'

const RED = { r: 255, g: 0, b: 0 }
const BLUE = { r: 0, g: 0, b: 255 }

const setup = () => {
  const onSmoke = vi.fn()
  const player = createScenePlayer({
    fixtures: parseRig(RIG, []).fixtures,
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
