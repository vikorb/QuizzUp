import type { FixtureConfig, FixtureState } from '@hardware/dmx/fixtures'
import { parseRig, renderUniverse } from '@hardware/dmx/fixtures'
import { createScenePlayer } from '@hardware/lighting/scenePlayer'
import type { SceneDefinition } from '@hardware/lighting/scenes'
import {
  DEFAULT_DESK_COLORS,
  DEFAULT_EXIT,
  DEFAULT_SCENES,
  defaultScenesFor,
  exitScene,
  identifyScene,
  MAX_FLASHES_PER_SECOND,
  MIN_FLASH_INTERVAL_MS,
  NEON,
  SCENE_IDS,
  stepDuration,
} from '@hardware/lighting/scenes'
import type { Desk } from '@hardware/types'

import { RIG } from '../_helpers/rig'

const RED = { r: 255, g: 0, b: 0 }
const BLUE = { r: 0, g: 0, b: 255 }

/** Deux stroboscopes : un libre, un « dédié » au pupitre 1 (adresses 40-41 et 42-43). */
const STROBES: FixtureConfig[] = [
  { id: 'strobe-free', name: 'Strobe', profileId: 'strobe', address: 40 },
  { id: 'strobe-desk1', name: 'Strobe pupitre 1', profileId: 'strobe', address: 42, desk: 1 },
]

const setup = (rig: FixtureConfig[] = RIG, scenes: SceneDefinition[] = []) => {
  const onSmoke = vi.fn()
  const player = createScenePlayer({
    fixtures: parseRig(rig, []).fixtures,
    deskColors: DEFAULT_DESK_COLORS,
    onSmoke,
    resolveScene: (id) => scenes.find((entry) => entry.id === id),
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

    player.play(scene([{ type: 'color', target: ['par1'], color: RED }]), { desk: null }, 1_000)
    expect(state('par1')?.color).toMatchObject(RED)
    expect(state('wash')?.color).toMatchObject(BLUE)
  })

  it('sans pupitre, « desk » vise toute la salle, « others » personne, la couleur pupitre est blanche', () => {
    const { player, state } = setup()
    player.play(
      scene([
        { type: 'color', target: 'others', color: BLUE },
        { type: 'color', target: 'desk', color: RED },
        { type: 'color', target: 'desk', color: 'desk', aim: 'desk' },
      ]),
      { desk: null },
      0
    )
    for (const id of ['par1', 'par2', 'head', 'wash']) {
      expect(state(id)?.color, id).toMatchObject({ r: 255, g: 255, b: 255 })
    }
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
        { type: 'color', color: RED, intensity: 0.3 },
        // Période de 400 ms : le plafond d’éclairs de la salle.
        { type: 'flash', target: ['par1'], color: RED, count: 2, onMs: 100, offMs: 300 },
      ]),
      { desk: null },
      0
    )
    expect(state('par1')).toMatchObject({ color: RED, intensity: 1 })
    player.update(120)
    expect(state('par1')).toMatchObject({ color: RED, intensity: 0.3 })
    player.update(410)
    expect(state('par1')).toMatchObject({ color: RED, intensity: 1 })
    player.update(800)
    expect(state('par1')).toMatchObject({ color: RED, intensity: 0.3 })
    expect(player.currentSceneId()).toBeNull()
  })

  it('retient le retour à une autre couleur vive tant que le plafond d’éclairs court', () => {
    const { player, state } = setup()
    player.play(
      scene([
        { type: 'color', color: BLUE, intensity: 0.3 },
        { type: 'flash', target: ['par1'], color: RED, count: 1, onMs: 100, offMs: 0 },
      ]),
      { desk: null },
      0
    )
    expect(state('par1')?.color).toMatchObject(RED)
    // Le retour au bleu est une montée de composante : il attend la fin des 400 ms.
    player.update(120)
    expect(state('par1')?.color).toMatchObject(RED)
    player.update(400)
    expect(state('par1')).toMatchObject({ color: BLUE, intensity: 0.3 })
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
    // Un flash plus rapide que le plafond d’éclairs est ramené à `MIN_FLASH_INTERVAL_MS` par éclair.
    expect(stepDuration({ type: 'flash', color: RED, count: 2, onMs: 10, offMs: 5 })).toBe(
      2 * MIN_FLASH_INTERVAL_MS
    )
    expect(stepDuration({ type: 'flash', color: RED, count: 2, onMs: 300, offMs: 200 })).toBe(1_000)
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

describe('pupitre inconnu (participant sans pupitre)', () => {
  it('le buzz éclaire toute la salle en blanc au lieu de l’assombrir', () => {
    const buzz = defaultScene(SCENE_IDS.BUZZ)
    const { player, state } = setup()
    player.play(buzz, { desk: null }, 0)
    player.update(totalDuration(buzz) + 1)
    for (const id of ['par1', 'par2', 'head', 'wash']) {
      expect(state(id), id).toMatchObject({ color: { r: 255, g: 255, b: 255 }, intensity: 1 })
    }
  })

  it('la victoire d’un gagnant sans pupitre fait la fête dans toute la salle', () => {
    const { player, state } = setup()
    player.play(defaultScene(SCENE_IDS.VICTORY), { desk: null }, 0)
    // Fondu de 300 ms (personne à griser), puis le premier flash allumé.
    player.update(350)
    for (const id of ['par1', 'par2', 'head', 'wash']) {
      expect(state(id), id).toMatchObject({ color: NEON.warn, intensity: 1 })
    }
  })
})

describe('plafond d’éclairs de la salle (photosensibilité)', () => {
  type Play = { at: number; scene: SceneDefinition; desk?: Desk | null }

  // Mesure indépendante de la garde : niveau réellement émis, composante par composante (r, g, b, w,
  // chacune × intensité). Un éclair est vu quand une composante dépasse de 0,1 son minimum des
  // 1 000 dernières ms ; un fondu ou un palier prolongé ne compte qu'une fois (par appareil).
  const RISE = 0.1
  const WINDOW_MS = 1_000
  const emittedLevels = ({ intensity, color }: FixtureState) =>
    [color.r, color.g, color.b, color.w ?? 0].map((component) => (intensity * component) / 255)

  /**
   * Joue les scènes en échantillonnant chaque milliseconde. Renvoie les instants d'éclair par
   * appareil et pour la salle (appareils qui s'allument ensemble : un seul instant). Seuls les
   * éclairs à partir de `since` sont gardés ; tout est éteint au départ.
   */
  const measure = (
    plays: Play[],
    until: number,
    since = 0,
    rig: FixtureConfig[] = RIG,
    scenes: SceneDefinition[] = []
  ) => {
    const { player } = setup(rig, scenes)
    const windows = new Map<string, { at: number; level: number }[]>()
    const before = new Map<string, { levels: number[]; top: number; high: boolean }>()
    const perDevice = new Map<string, number[]>()
    for (let now = 0; now <= until; now += 1) {
      const start = plays.find((entry) => entry.at === now)
      if (start) {
        player.play(start.scene, { desk: start.desk ?? null }, now)
      } else {
        player.update(now)
      }
      for (const [id, state] of player.states()) {
        const levels = emittedLevels(state)
        const rises = levels.map((level, component) => {
          const key = `${id}:${component}`
          const window = windows.get(key) ?? [{ at: -1, level: 0 }]
          while (window.length > 0 && window[window.length - 1]!.level >= level) {
            window.pop()
          }
          window.push({ at: now, level })
          while (window[0]!.at <= now - WINDOW_MS) {
            window.shift()
          }
          windows.set(key, window)
          return level - window[0]!.level
        })
        // Composante qui monte le plus : un fondu qui allume plusieurs composantes l'une après
        // l'autre reste un seul éclair ; un changement de couleur compte quand la composante qui
        // dominait la montée tombe d'au moins 0,1 pendant qu'une autre prend la tête.
        const top = rises.indexOf(Math.max(...rises))
        const isHigh = rises[top]! >= RISE
        const last = before.get(id)
        const swapped =
          isHigh &&
          last?.high === true &&
          top !== last.top &&
          last.levels[last.top]! - levels[last.top]! >= RISE
        if ((isHigh && !last?.high) || swapped) {
          if (now >= since) {
            perDevice.set(id, [...(perDevice.get(id) ?? []), now])
          }
        }
        before.set(id, { levels, top, high: isHigh })
      }
    }
    const room = [...new Set([...perDevice.values()].flat())].sort(
      (first, second) => first - second
    )
    return { perDevice, room, player }
  }
  const gaps = (instants: number[]) => instants.slice(1).map((at, index) => at - instants[index]!)
  const expectCapped = (run: ReturnType<typeof measure>, label: string) => {
    expect(
      gaps(run.room).every((gap) => gap >= MIN_FLASH_INTERVAL_MS),
      `${label} : éclairs de la salle à ${run.room.join(', ')} ms`
    ).toBe(true)
    for (const [id, instants] of run.perDevice) {
      expect(
        gaps(instants).every((gap) => gap >= MIN_FLASH_INTERVAL_MS),
        `${label}, ${id} : éclairs à ${instants.join(', ')} ms`
      ).toBe(true)
    }
  }
  /** Fond à 0,55 comme pendant un extrait : toute la salle à intensité 0,55, posée à t = 0. */
  const clip = defaultScene(SCENE_IDS.CLIP)
  const ambient = scene([{ type: 'color', color: NEON.primary, intensity: 0.3 }])
  const BEFORE = 2_000

  it('le plafond est de 3 éclairs par seconde, avec une marge sur les 334 ms', () => {
    expect(MAX_FLASHES_PER_SECOND).toBe(3)
    expect(MIN_FLASH_INTERVAL_MS).toBeGreaterThanOrEqual(Math.ceil(1000 / MAX_FLASHES_PER_SECOND))
    expect(MIN_FLASH_INTERVAL_MS).toBe(400)
  })

  it('les flashs de chaque scène par défaut respectent le plafond dans leur définition', () => {
    for (const definition of DEFAULT_SCENES) {
      for (const step of definition.steps) {
        if (step.type === 'flash') {
          expect(step.onMs + step.offMs, definition.id).toBeGreaterThanOrEqual(
            MIN_FLASH_INTERVAL_MS
          )
        }
      }
    }
  })

  it('chaque scène par défaut garde 400 ms entre deux éclairs, par appareil et pour la salle', () => {
    // La sortie n'a que des fondus : seuls son délai et son maintien (5 min), sans effet sur les
    // éclairs, sont raccourcis pour ne pas échantillonner 5 minutes à la milliseconde.
    const shortExit = exitScene({ ...DEFAULT_EXIT, delayMs: 500, holdMs: 500 })
    for (const definition of DEFAULT_SCENES.map((entry) =>
      entry.id === SCENE_IDS.EXIT ? shortExit : entry
    )) {
      // Pupitre 1 (appareils dédiés), pupitre 3 (aucun appareil : toute la salle) et sans pupitre.
      for (const desk of [1, 3, null] as const) {
        const run = measure(
          [
            { at: 0, scene: ambient },
            { at: BEFORE, scene: definition, desk },
          ],
          BEFORE + totalDuration(definition) + 100,
          BEFORE
        )
        expectCapped(run, `${definition.id}, pupitre ${desk}`)
      }
    }
  })

  it('la victoire enchaînée sur la sortie puis son extinction garde 400 ms entre deux éclairs', () => {
    const delivered = defaultScenesFor({ ...DEFAULT_EXIT, delayMs: 500, holdMs: 500 })
    const victory = delivered.find((entry) => entry.id === SCENE_IDS.VICTORY)!
    for (const desk of [1, null] as const) {
      const run = measure(
        [
          { at: 0, scene: ambient },
          { at: BEFORE, scene: victory, desk },
        ],
        BEFORE + totalDuration(victory) + 500 + 3_000 + 500 + 3_000 + 100,
        BEFORE,
        RIG,
        delivered
      )
      expectCapped(run, `victoire puis sortie, pupitre ${desk}`)
    }
  })

  it('le test voit les éclairs des scènes par défaut (il ne mesure pas du vide)', () => {
    const run = measure(
      [
        { at: 0, scene: ambient },
        { at: BEFORE, scene: defaultScene(SCENE_IDS.BUZZ), desk: 1 },
      ],
      BEFORE + 1_000,
      BEFORE
    )
    expect(run.perDevice.get('par1')?.length).toBeGreaterThanOrEqual(2)
  })

  it('plusieurs appareils qui s’allument ensemble comptent pour un seul éclair', () => {
    const together = scene([{ type: 'flash', color: RED, count: 1, onMs: 100, offMs: 300 }])
    const run = measure([{ at: 0, scene: together }], 500)
    expect(run.room).toEqual([0])
    for (const id of ['par1', 'par2', 'head', 'wash']) {
      expect(run.perDevice.get(id), id).toEqual([0])
    }
  })

  it('ramène au plafond une scène volontairement trop rapide', () => {
    const tooFast = scene([
      { type: 'flash', target: ['par1'], color: RED, count: 8, onMs: 50, offMs: 50 },
    ])
    const run = measure([{ at: 0, scene: tooFast }], 4_000)
    // La période est portée à 400 ms : les 8 éclairs restent, espacés du plafond.
    expect(run.perDevice.get('par1')).toEqual(
      Array.from({ length: 8 }, (_unused, index) => index * 400)
    )
    expectCapped(run, 'scène trop rapide')
  })

  it('ramène au plafond une scène faite d’étapes de couleur alternées', () => {
    const blink = scene(
      Array.from({ length: 6 }, () => [
        { type: 'color' as const, target: ['par1'], color: RED, intensity: 1, holdMs: 50 },
        { type: 'color' as const, target: ['par1'], color: RED, intensity: 0, holdMs: 50 },
      ]).flat()
    )
    const run = measure([{ at: 0, scene: blink }], 2_000)
    expect(run.perDevice.get('par1')?.length).toBeGreaterThanOrEqual(2)
    expectCapped(run, 'couleurs alternées')
  })

  it('compte un changement noir / blanc à intensité 1', () => {
    const BLACK = { r: 0, g: 0, b: 0 }
    const WHITE = { r: 255, g: 255, b: 255 }
    const blink = scene(
      Array.from({ length: 6 }, () => [
        { type: 'color' as const, target: ['par1'], color: WHITE, intensity: 1, holdMs: 50 },
        { type: 'color' as const, target: ['par1'], color: BLACK, intensity: 1, holdMs: 50 },
      ]).flat()
    )
    const run = measure([{ at: 0, scene: blink }], 2_000)
    expect(run.perDevice.get('par1')?.length).toBeGreaterThanOrEqual(2)
    expectCapped(run, 'noir / blanc')
  })

  describe('scènes enchaînées par `next`', () => {
    const blink = (id: string, repeat: number, over: Partial<SceneDefinition> = {}) => ({
      ...scene(
        Array.from({ length: repeat }, () => [
          { type: 'color' as const, target: ['par1'], color: NEON.white, holdMs: 50 },
          { type: 'color' as const, target: ['par1'], color: { r: 0, g: 0, b: 0 }, holdMs: 50 },
        ]).flat()
      ),
      id,
      ...over,
    })

    it('garde 400 ms entre deux éclairs à travers `next`', () => {
      const first = blink('premier', 3, { next: 'second' })
      const second = blink('second', 3)
      const run = measure([{ at: 0, scene: first }], 3_000, 0, RIG, [first, second])
      // 6 clignotements demandés en 0,6 s : le plafond en retient deux (à 0 et à 400 ms, ce
      // dernier dans la scène enchaînée, qui démarre à 300 ms).
      expect(run.perDevice.get('par1')).toEqual([0, MIN_FLASH_INTERVAL_MS])
      expectCapped(run, 'scènes enchaînées')
    })

    it('garde 400 ms entre deux éclairs dans une boucle', () => {
      const loop = blink('boucle', 2, { next: 'boucle' })
      const run = measure([{ at: 0, scene: loop }], 4_000, 0, RIG, [loop])
      expect(run.perDevice.get('par1')?.length).toBeGreaterThanOrEqual(8)
      expectCapped(run, 'boucle')
      expect(run.player.currentSceneId()).toBe('boucle')
    })

    it('un changement de couleur à même niveau compte comme un éclair : boucle rouge / bleu', () => {
      const red = {
        ...scene([{ type: 'color', target: ['par1'], color: RED, holdMs: 150 }]),
        id: 'a',
        next: 'b',
      }
      const blue = {
        ...scene([{ type: 'color', target: ['par1'], color: BLUE, holdMs: 150 }]),
        id: 'b',
        next: 'a',
      }
      const { player, state } = setup(RIG, [red, blue])
      player.play(red, { desk: null }, 0)
      const changes: number[] = []
      let seen = JSON.stringify(state('par1')?.color)
      for (let now = 1; now <= 3_000; now += 1) {
        player.update(now)
        const color = JSON.stringify(state('par1')?.color)
        if (color !== seen) {
          changes.push(now)
          seen = color
        }
      }
      // Sans la garde par composante, la couleur changerait toutes les 150 ms (20 fois en 3 s).
      expect(changes.length).toBeGreaterThanOrEqual(5)
      expect(gaps(changes).every((gap) => gap >= MIN_FLASH_INTERVAL_MS)).toBe(true)

      const run = measure([{ at: 0, scene: red }], 3_000, 0, RIG, [red, blue])
      expectCapped(run, 'rouge / bleu')
    })
  })

  it('compte des montées de 0,55 à 1 : le fond déjà allumé ne cache pas les éclairs', () => {
    const blink = scene(
      Array.from({ length: 6 }, () => [
        { type: 'color' as const, target: ['par1'], color: NEON.white, intensity: 1, holdMs: 50 },
        {
          type: 'color' as const,
          target: ['par1'],
          color: NEON.white,
          intensity: 0.55,
          holdMs: 50,
        },
      ]).flat()
    )
    const run = measure(
      [
        { at: 0, scene: clip },
        { at: BEFORE, scene: blink },
      ],
      BEFORE + 2_000,
      BEFORE
    )
    expectCapped(run, 'montées de 0,55 à 1')

    // Le fond de l'extrait peut encore monter dans la fenêtre de `measure` : on lit donc l'état
    // du lecteur. Éclair à BEFORE, retour à 0,55, la remontée suivante attend les 400 ms.
    const { player, state } = setup()
    player.play(clip, { desk: null }, 0)
    for (let now = 10; now < BEFORE; now += 10) {
      player.update(now)
    }
    player.play(blink, { desk: null }, BEFORE)
    expect(state('par1')?.intensity).toBe(1)
    player.update(BEFORE + 60)
    expect(state('par1')?.intensity).toBeCloseTo(0.55)
    player.update(BEFORE + 200)
    expect(state('par1')?.intensity).toBeCloseTo(0.55)
    player.update(BEFORE + MIN_FLASH_INTERVAL_MS)
    expect(state('par1')?.intensity).toBe(1)
  })

  it('ramène au plafond un flash parti d’un fond à 0,55 (extrait en cours)', () => {
    const tooFast = scene([
      { type: 'flash', target: ['par1'], color: NEON.white, count: 10, onMs: 50, offMs: 50 },
    ])
    const run = measure(
      [
        { at: 0, scene: clip },
        { at: BEFORE, scene: tooFast },
      ],
      BEFORE + 5_000,
      BEFORE
    )
    expect(run.perDevice.get('par1')?.length).toBe(10)
    expectCapped(run, 'fond à 0,55')
  })

  it('garde l’écart à la jonction de deux scènes enchaînées', () => {
    const first = scene([
      { type: 'flash', target: ['par1'], color: RED, count: 1, onMs: 100, offMs: 0 },
    ])
    const second = scene([
      { type: 'flash', target: ['par1'], color: BLUE, count: 1, onMs: 600, offMs: 0 },
    ])
    const run = measure(
      [
        { at: 0, scene: first },
        { at: 150, scene: second },
      ],
      1_500
    )
    // Le second éclair attend le plafond (400 ms) au lieu de partir à 150 ms.
    expect(run.perDevice.get('par1')).toEqual([0, MIN_FLASH_INTERVAL_MS])
  })

  it('n’oublie pas l’état final d’une scène instantanée repoussée par le plafond', () => {
    const first = scene([
      { type: 'flash', target: ['par1'], color: RED, count: 1, onMs: 100, offMs: 0 },
    ])
    // Une seule étape instantanée : la scène est finie avant que le plafond ne permette l’allumage.
    const second = scene([{ type: 'color', target: ['par1'], color: BLUE, intensity: 1 }])
    const run = measure(
      [
        { at: 0, scene: first },
        { at: 150, scene: second },
      ],
      1_000
    )
    expect(run.perDevice.get('par1')).toEqual([0, MIN_FLASH_INTERVAL_MS])
    expect(run.player.states().get('par1')).toMatchObject({ color: BLUE, intensity: 1 })
  })

  it('applique l’état retenu d’un appareil que la scène suivante ne vise pas (identification)', () => {
    const first = scene([
      { type: 'flash', target: ['par1'], color: RED, count: 1, onMs: 100, offMs: 0 },
    ])
    const second = scene([{ type: 'color', target: ['par2'], color: BLUE, intensity: 1 }])
    const run = measure(
      [
        { at: 0, scene: first },
        { at: 150, scene: second },
        { at: 200, scene: identifyScene('par1') },
      ],
      1_000
    )
    // `par2` est retenu à 150 ms ; l'identification de `par1` ne l'efface pas.
    expect(run.perDevice.get('par2')).toEqual([MIN_FLASH_INTERVAL_MS])
    expect(run.player.states().get('par2')).toMatchObject({ color: BLUE, intensity: 1 })
    expectCapped(run, 'identification')
  })

  it('deux appareils qui flashent en alternance restent sous le plafond, vus ensemble', () => {
    const one = scene([
      { type: 'flash', target: ['par1'], color: RED, count: 1, onMs: 100, offMs: 300 },
    ])
    const two = scene([
      { type: 'flash', target: ['par2'], color: BLUE, count: 1, onMs: 600, offMs: 0 },
    ])
    const run = measure(
      [
        { at: 0, scene: one },
        { at: 200, scene: two },
      ],
      1_500
    )
    // Chacun respecte 400 ms de son côté ; vus ensemble, le second attend le plafond de la salle.
    expect(run.perDevice.get('par1')).toEqual([0])
    expect(run.perDevice.get('par2')).toEqual([MIN_FLASH_INTERVAL_MS])
    expect(run.room).toEqual([0, MIN_FLASH_INTERVAL_MS])
  })

  it('garde l’écart pendant un extrait : mauvaise réponse du pupitre 1 puis buzz du pupitre 2', () => {
    // Lyre partagée : elle a une position pour les pupitres 1 et 2 et s'allume pour les deux.
    const run = measure(
      [
        { at: 0, scene: clip },
        { at: BEFORE, scene: defaultScene(SCENE_IDS.WRONG), desk: 1 },
        { at: BEFORE + 210, scene: defaultScene(SCENE_IDS.BUZZ), desk: 2 },
      ],
      BEFORE + 4_000,
      BEFORE
    )
    expect(run.perDevice.get('head')?.length).toBeGreaterThanOrEqual(2)
    expectCapped(run, 'extrait, mauvaise réponse puis buzz')
  })

  describe('état retenu puis arrêt', () => {
    /** Un appareil allumé à 0 ms, puis une scène instantanée qui le rallume à 150 ms : retenue. */
    const withHeldState = () => {
      const { player, state } = setup()
      player.play(
        scene([{ type: 'flash', target: ['par1'], color: RED, count: 1, onMs: 100, offMs: 0 }]),
        { desk: null },
        0
      )
      player.update(120)
      player.play(
        scene([{ type: 'color', target: ['par1'], color: BLUE, intensity: 1 }]),
        { desk: null },
        150
      )
      // Retenu : la salle a flashé à 0 ms, moins de 400 ms plus tôt.
      expect(state('par1')?.intensity).toBe(0)
      return { player, state }
    }

    it('blackout() oublie l’état retenu : rien ne se rallume ensuite', () => {
      const { player, state } = withHeldState()
      player.blackout()
      player.update(1_150)
      for (const id of ['par1', 'par2', 'head', 'wash']) {
        expect(state(id)?.intensity, id).toBe(0)
      }
    })

    it('stop() oublie l’état retenu : rien ne se rallume ensuite', () => {
      const { player, state } = withHeldState()
      player.stop()
      player.update(1_150)
      for (const id of ['par1', 'par2', 'head', 'wash']) {
        expect(state(id)?.intensity, id).toBe(0)
      }
    })
  })
})

describe('rattrapage d’une boucle après un gel de la page', () => {
  // Trois paliers d'intensité qui montent de moins de 0,1 en tout : le plafond d'éclairs ne retient
  // rien, l'état affiché est donc exactement celui du pas en cours.
  const tour = [0.5, 0.54, 0.58]
  const loop: SceneDefinition = {
    ...scene(
      tour.map((intensity) => ({
        type: 'color' as const,
        target: ['par1'],
        color: RED,
        intensity,
        holdMs: 100,
      }))
    ),
    id: 'tour',
    next: 'tour',
  }
  const levelAt = (offset: number) => tour[Math.floor((offset % 300) / 100)]

  const frozen = (freezeMs: number) => {
    const { player, state } = setup(RIG, [loop])
    player.play(loop, { desk: null }, 0)
    for (let now = 10; now <= 1_000; now += 10) {
      player.update(now)
    }
    return { player, state, resumeAt: 1_000 + freezeMs }
  }

  it.each([10 * 60_000, 60 * 60_000])(
    'après %i ms de gel, le pas affiché est le bon dès la première trame',
    (freezeMs) => {
      const { player, state, resumeAt } = frozen(freezeMs)
      // Un instant à 150 ms du début d'un tour : le deuxième palier (le pas du milieu).
      const now = resumeAt - (resumeAt % 300) + 300 + 150
      player.update(now)
      expect(state('par1')?.intensity).toBeCloseTo(levelAt(now) as number)
      player.update(now + 16)
      expect(state('par1')?.intensity).toBeCloseTo(levelAt(now + 16) as number)
      player.update(now + 100)
      expect(state('par1')?.intensity).toBeCloseTo(levelAt(now + 100) as number)
      expect(player.currentSceneId()).toBe('tour')
    }
  )

  it('rattrape aussi une boucle de plusieurs scènes', () => {
    const premiere: SceneDefinition = {
      ...scene([{ type: 'color', target: ['par1'], color: RED, intensity: 0.5, holdMs: 100 }]),
      id: 'premiere',
      next: 'seconde',
    }
    const seconde: SceneDefinition = {
      ...scene([{ type: 'color', target: ['par1'], color: RED, intensity: 0.56, holdMs: 150 }]),
      id: 'seconde',
      next: 'premiere',
    }
    const { player, state } = setup(RIG, [premiere, seconde])
    player.play(premiere, { desk: null }, 0)
    player.update(100)
    // Tour de 250 ms : 3 600 050 ms = 14 400 tours + 50 ms, donc la première ; 3 600 150 ms : la seconde.
    player.update(3_600_050)
    expect(state('par1')?.intensity).toBeCloseTo(0.5)
    player.update(3_600_150)
    expect(state('par1')?.intensity).toBeCloseTo(0.56)
  })
})

describe('victoire à égalité', () => {
  it('les flashs visent toute la salle', () => {
    const tie = defaultScene(SCENE_IDS.VICTORY_TIE)
    const { player, state, onSmoke } = setup()
    // Salle déjà en ambiance, comme en partie : le fondu de départ baisse, il n'est pas un éclair.
    player.play(
      scene([{ type: 'color', color: NEON.primary, intensity: 0.3 }]),
      { desk: null },
      -5_000
    )
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
