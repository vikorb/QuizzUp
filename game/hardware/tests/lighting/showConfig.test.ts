import { DEFAULT_SCENES, flashPeriodMs, MIN_FLASH_INTERVAL_MS } from '@hardware/lighting/scenes'
import { parseScenes, SCENE_LIMITS } from '@hardware/lighting/showConfig'
import { SMOKE_HARD_LIMITS } from '@hardware/lighting/smoke'

const RED = { r: 255, g: 0, b: 0 }

const flash = (over: Record<string, unknown> = {}) => ({
  type: 'flash',
  color: RED,
  count: 2,
  onMs: 150,
  offMs: 250,
  ...over,
})

const scene = (steps: unknown[], over: Record<string, unknown> = {}) => ({
  id: 'show',
  name: 'Show',
  priority: 10,
  steps,
  ...over,
})

/** Une seule scène relue : ses étapes et les problèmes. */
const parseOne = (steps: unknown[], over: Record<string, unknown> = {}) => {
  const { scenes, problems } = parseScenes([scene(steps, over)])
  return { scene: scenes[0], steps: scenes[0]?.steps, problems }
}

describe('parseScenes : forme', () => {
  it('ne dit rien d’une salle sans scène', () => {
    for (const input of [undefined, null, []]) {
      expect(parseScenes(input)).toEqual({ scenes: [], problems: [] })
    }
  })

  it('refuse autre chose qu’une liste', () => {
    const { scenes, problems } = parseScenes({ id: 'show' })
    expect(scenes).toEqual([])
    expect(problems).toEqual(['lighting.scenes doit être une liste'])
  })

  it('garde une scène valide telle quelle, et la relecture ne change plus rien', () => {
    const input = scene(
      [
        {
          type: 'color',
          target: 'others',
          color: 'desk',
          intensity: 0.5,
          fadeMs: 300,
          aim: 'desk',
        },
        flash(),
        { type: 'blackout', fadeMs: 100 },
        { type: 'wait', durationMs: 500 },
        { type: 'smoke', durationMs: 2_000 },
      ],
      { next: 'idle' }
    )
    const first = parseScenes([input])
    expect(first.problems).toEqual([])
    expect(first.scenes).toEqual([input])
    expect(parseScenes(first.scenes)).toEqual(first)
  })

  it('écarte une scène sans identifiant ou sans étape valide, une étape illisible ou inconnue', () => {
    const { scenes, problems } = parseScenes([
      null,
      { steps: [] },
      { id: 'sans-etapes' },
      { id: 'vide', steps: [] },
      scene([{ type: 'danse' }, 'x', { type: 'wait', durationMs: Number.NaN }]),
      scene(
        [
          { type: 'wait', durationMs: 100 },
          { type: 'color', color: 'rouge' },
        ],
        { id: 'garde' }
      ),
    ])
    expect(scenes.map((entry) => entry.id)).toEqual(['garde'])
    expect(scenes[0]?.steps).toEqual([{ type: 'wait', durationMs: 100 }])
    expect(problems.length).toBeGreaterThanOrEqual(7)
  })

  it('ramène une couleur et une intensité hors plage', () => {
    const { steps } = parseOne([
      { type: 'color', color: { r: 999, g: -4, b: 12.4, w: 300 }, intensity: 4 },
    ])
    expect(steps).toEqual([{ type: 'color', color: { r: 255, g: 0, b: 12, w: 255 }, intensity: 1 }])
  })
})

describe('parseScenes : cibles et valeurs illisibles', () => {
  it('garde une liste d’identifiants comme cible, écarte une cible ou une visée invalide', () => {
    const { steps } = parseOne([
      { type: 'color', color: RED, target: ['par1', 'par2'], aim: 'home' },
      { type: 'color', color: RED, target: [1, 2] },
      { type: 'color', color: RED, target: 'partout' },
      { type: 'color', color: RED, aim: 'ciel' },
      { type: 'color', color: { r: 1, g: 2, b: 3, w: 'x' } },
      { type: 'color', color: RED, intensity: 'fort' },
      { type: 'color', color: RED, fadeMs: -1 },
    ])
    expect(steps).toEqual([{ type: 'color', color: RED, target: ['par1', 'par2'], aim: 'home' }])
  })

  it('écarte un « next » qui n’est pas un identifiant', () => {
    for (const next of [3, '', {}]) {
      const { scene: parsed, problems } = parseOne([{ type: 'wait', durationMs: 500 }], { next })
      expect(parsed?.next).toBeUndefined()
      expect(problems).toHaveLength(1)
    }
  })
})

describe('parseScenes : bornes une à une', () => {
  it('24 scènes au plus', () => {
    const many = Array.from({ length: SCENE_LIMITS.maxScenes + 1 }, (_item, index) =>
      scene([{ type: 'wait', durationMs: 100 }], { id: `s${index}` })
    )
    const { scenes, problems } = parseScenes(many)
    expect(scenes).toHaveLength(24)
    expect(scenes.some((entry) => entry.id === 's24')).toBe(false)
    expect(problems).toHaveLength(1)
    expect(parseScenes(many.slice(0, 24)).problems).toEqual([])
  })

  it('16 pas par scène au plus', () => {
    const wait = { type: 'wait', durationMs: 100 }
    expect(parseOne(Array.from({ length: 16 }, () => wait)).problems).toEqual([])
    const over = parseOne(Array.from({ length: 17 }, () => wait))
    expect(over.steps).toHaveLength(16)
    expect(over.problems).toHaveLength(1)
  })

  it('flash : 60 ms au moins pour l’allumé', () => {
    const { steps } = parseOne([flash({ onMs: 59, offMs: 500 })])
    expect(steps).toEqual([expect.objectContaining({ onMs: 60, offMs: 500 })])
    expect(parseOne([flash({ onMs: 60, offMs: 500 })]).problems).toEqual([])
  })

  it('flash : 60 ms au moins pour l’éteint', () => {
    const { steps } = parseOne([flash({ onMs: 500, offMs: 59 })])
    expect(steps).toEqual([expect.objectContaining({ onMs: 500, offMs: 60 })])
    expect(parseOne([flash({ onMs: 500, offMs: 60 })]).problems).toEqual([])
  })

  it('flash : période de 400 ms au moins (MIN_FLASH_INTERVAL_MS), pas les 334 ms de la conception', () => {
    const { steps } = parseOne([flash({ onMs: 100, offMs: 234 })])
    const [step] = steps ?? []
    if (step?.type !== 'flash') {
      throw new Error('flash attendu')
    }
    expect(step.onMs + step.offMs).toBe(MIN_FLASH_INTERVAL_MS)
    expect(flashPeriodMs(step)).toBe(MIN_FLASH_INTERVAL_MS)
    expect(parseOne([flash({ onMs: 100, offMs: 300 })]).problems).toEqual([])
  })

  it('flash : 5 s au plus par pas, le nombre d’éclairs est ramené', () => {
    const { steps } = parseOne([flash({ count: 100, onMs: 150, offMs: 250 })])
    expect(steps).toEqual([expect.objectContaining({ count: 12 })])
    expect(parseOne([flash({ count: 12 })]).problems).toEqual([])
    expect(parseOne([flash({ count: 13 })]).steps).toEqual([expect.objectContaining({ count: 12 })])
  })

  it('flash : une période de plus de 5 s écarte le pas', () => {
    const { steps, problems } = parseOne([
      flash({ onMs: 3_000, offMs: 2_500 }),
      { type: 'wait', durationMs: 100 },
    ])
    expect(steps).toEqual([{ type: 'wait', durationMs: 100 }])
    expect(problems).toHaveLength(1)
  })

  it('flash : un nombre d’éclairs invalide écarte le pas', () => {
    for (const count of [0, -1, Number.NaN, 'deux']) {
      expect(parseOne([flash({ count }), { type: 'wait', durationMs: 1 }]).steps).toHaveLength(1)
    }
  })

  it('durée d’un pas : 10 minutes au plus (attente, fondu, maintien), ramenée et signalée', () => {
    const max = SCENE_LIMITS.maxStepMs
    expect(max).toBe(10 * 60_000)
    const { steps, problems } = parseOne([
      { type: 'wait', durationMs: 1e12 },
      { type: 'color', color: RED, fadeMs: 1e12, holdMs: max + 1 },
      { type: 'blackout', fadeMs: max + 1, holdMs: 1e12 },
    ])
    expect(steps).toEqual([
      { type: 'wait', durationMs: max },
      { type: 'color', color: RED, fadeMs: max, holdMs: max },
      { type: 'blackout', fadeMs: max, holdMs: max },
    ])
    expect(problems).toHaveLength(5)
    // Pile au plafond : rien à signaler.
    expect(
      parseOne([
        { type: 'wait', durationMs: max },
        { type: 'color', color: RED, fadeMs: max },
      ]).problems
    ).toEqual([])
  })

  it('boucle : 200 ms au moins, sinon l’enchaînement est écarté', () => {
    const instant = parseOne([{ type: 'wait', durationMs: 199 }], { next: 'show' })
    expect(instant.scene?.next).toBeUndefined()
    expect(instant.problems).toHaveLength(1)

    const zero = parseOne([{ type: 'color', color: RED }], { next: 'show' })
    expect(zero.scene?.next).toBeUndefined()

    const enough = parseOne([{ type: 'wait', durationMs: 200 }], { next: 'show' })
    expect(enough.scene?.next).toBe('show')
    expect(enough.problems).toEqual([])
  })

  it('boucle de plusieurs scènes : la durée est celle du tour complet', () => {
    const tooShort = parseScenes([
      scene([{ type: 'wait', durationMs: 100 }], { id: 'a', next: 'b' }),
      scene([{ type: 'wait', durationMs: 99 }], { id: 'b', next: 'a' }),
    ])
    expect(tooShort.scenes.map((entry) => entry.next)).toEqual([undefined, undefined])

    const enough = parseScenes([
      scene([{ type: 'wait', durationMs: 100 }], { id: 'a', next: 'b' }),
      scene([{ type: 'wait', durationMs: 100 }], { id: 'b', next: 'a' }),
    ])
    expect(enough.scenes.map((entry) => entry.next)).toEqual(['b', 'a'])
    expect(enough.problems).toEqual([])
  })

  it('priorité d’une scène de salle ramenée dans 0..60, 10 si elle n’en donne pas', () => {
    expect(parseOne([{ type: 'wait', durationMs: 1 }], { priority: 99 }).scene?.priority).toBe(60)
    expect(parseOne([{ type: 'wait', durationMs: 1 }], { priority: 60 }).problems).toEqual([])
    expect(parseOne([{ type: 'wait', durationMs: 1 }], { priority: -5 }).scene?.priority).toBe(0)
    expect(
      parseOne([{ type: 'wait', durationMs: 1 }], { priority: Number.NaN }).scene?.priority
    ).toBe(10)
    const without = parseOne([{ type: 'wait', durationMs: 1 }], { priority: undefined })
    expect(without.scene?.priority).toBe(10)
    expect(without.problems).toEqual([])
  })

  it('priorité d’une scène qui boucle : 10 au plus, une scène qui ne boucle pas garde la sienne', () => {
    const looping = parseOne([{ type: 'wait', durationMs: 500 }], { priority: 50, next: 'show' })
    expect(looping.scene?.priority).toBe(10)
    expect(looping.problems).toHaveLength(1)

    const chain = parseScenes([
      scene([{ type: 'wait', durationMs: 500 }], { id: 'a', priority: 40, next: 'b' }),
      scene([{ type: 'wait', durationMs: 500 }], { id: 'b', priority: 40 }),
    ])
    expect(chain.scenes.map((entry) => entry.priority)).toEqual([40, 40])
  })

  it('enchaînement vers une scène inconnue écarté, vers une scène par défaut gardé', () => {
    const unknown = parseOne([{ type: 'wait', durationMs: 500 }], { next: 'nulle-part' })
    expect(unknown.scene?.next).toBeUndefined()
    expect(unknown.problems).toHaveLength(1)

    const known = DEFAULT_SCENES[0]?.id as string
    expect(parseOne([{ type: 'wait', durationMs: 500 }], { next: known }).scene?.next).toBe(known)
    expect(
      parseOne([{ type: 'wait', durationMs: 500 }], { next: 'identify' }).scene?.next
    ).toBeUndefined()
  })
})

describe('parseScenes : fumée', () => {
  it('un seul pas de fumée par scène : les suivants sont écartés', () => {
    const { steps, problems } = parseOne([
      { type: 'smoke', durationMs: 1_000 },
      { type: 'wait', durationMs: 100 },
      { type: 'smoke', durationMs: 2_000 },
    ])
    expect(steps).toEqual([
      { type: 'smoke', durationMs: 1_000 },
      { type: 'wait', durationMs: 100 },
    ])
    expect(problems).toHaveLength(1)
  })

  it('durée ramenée dans SMOKE_HARD_LIMITS', () => {
    expect(parseOne([{ type: 'smoke', durationMs: 5 }]).steps).toEqual([
      { type: 'smoke', durationMs: SMOKE_HARD_LIMITS.minDurationMs },
    ])
    expect(parseOne([{ type: 'smoke', durationMs: 60_000 }]).steps).toEqual([
      { type: 'smoke', durationMs: SMOKE_HARD_LIMITS.maxDurationMs },
    ])
    expect(
      parseOne([
        { type: 'smoke', durationMs: Number.NaN },
        { type: 'wait', durationMs: 1 },
      ]).steps
    ).toEqual([{ type: 'wait', durationMs: 1 }])
  })

  it('un seul jet pour un événement : une chaîne `next` garde la première fumée seulement', () => {
    const jet = { type: 'smoke', durationMs: 1_000 }
    const { scenes, problems } = parseScenes([
      scene([jet, { type: 'wait', durationMs: 100 }], { id: 's1', next: 's2' }),
      scene([{ type: 'wait', durationMs: 100 }, jet], { id: 's2', next: 's3' }),
      scene([jet, { type: 'wait', durationMs: 100 }], { id: 's3' }),
    ])
    const smokeIn = (id: string) =>
      scenes.find((entry) => entry.id === id)?.steps.filter((step) => step.type === 'smoke').length
    expect([smokeIn('s1'), smokeIn('s2'), smokeIn('s3')]).toEqual([1, 0, 0])
    expect(problems).toHaveLength(2)
    expect(problems.join(' ')).toContain('s2')
    expect(problems.join(' ')).toContain('s3')
    // Relue, la config ne change plus.
    expect(parseScenes(scenes)).toEqual({ scenes, problems: [] })
  })

  it('une scène qui ne garde que sa fumée de chaîne reste une scène lisible', () => {
    const { scenes } = parseScenes([
      scene([{ type: 'smoke', durationMs: 1_000 }], { id: 's1', next: 's2' }),
      scene([{ type: 'smoke', durationMs: 1_000 }], { id: 's2' }),
    ])
    expect(scenes.find((entry) => entry.id === 's2')?.steps).toEqual([
      { type: 'wait', durationMs: 0 },
    ])
    expect(parseScenes(scenes).scenes).toEqual(scenes)
  })

  it('une scène de salle qui mène à une scène par défaut avec fumée ne garde pas son `next`', () => {
    const { scenes, problems } = parseScenes([
      scene(
        [
          { type: 'smoke', durationMs: 1_000 },
          { type: 'wait', durationMs: 100 },
        ],
        { id: 'avant', next: 'victory' }
      ),
      scene([{ type: 'wait', durationMs: 100 }], { id: 'sans-fumee', next: 'victory' }),
    ])
    expect(scenes.find((entry) => entry.id === 'avant')?.next).toBeUndefined()
    expect(scenes.find((entry) => entry.id === 'sans-fumee')?.next).toBe('victory')
    expect(problems).toHaveLength(1)
  })

  it('refusée dans une scène qui se désigne elle-même', () => {
    const { steps, problems } = parseOne(
      [
        { type: 'smoke', durationMs: 2_000 },
        { type: 'wait', durationMs: 500 },
      ],
      { next: 'show' }
    )
    expect(steps).toEqual([{ type: 'wait', durationMs: 500 }])
    expect(problems).toHaveLength(1)
  })

  it('refusée dans une boucle de plusieurs scènes, gardée dans la scène qui y mène', () => {
    const { scenes } = parseScenes([
      scene(
        [
          { type: 'smoke', durationMs: 2_000 },
          { type: 'wait', durationMs: 300 },
        ],
        { id: 'entree', next: 'a' }
      ),
      scene([{ type: 'wait', durationMs: 300 }], { id: 'a', next: 'b' }),
      scene(
        [
          { type: 'smoke', durationMs: 2_000 },
          { type: 'wait', durationMs: 300 },
        ],
        { id: 'b', next: 'a' }
      ),
    ])
    const smokeIn = (id: string) =>
      scenes.find((entry) => entry.id === id)?.steps.some((step) => step.type === 'smoke')
    expect(smokeIn('b')).toBe(false)
    expect(smokeIn('entree')).toBe(true)
  })
})

describe('parseScenes : surcharge par identifiant', () => {
  it('la scène de salle remplace la scène par défaut du même identifiant', () => {
    const { scenes, problems } = parseScenes([
      scene([{ type: 'color', color: RED }], { id: 'buzz', name: 'Buzz maison', priority: 40 }),
    ])
    expect(problems).toEqual([])
    expect(scenes).toEqual([expect.objectContaining({ id: 'buzz', name: 'Buzz maison' })])
    expect(DEFAULT_SCENES.some((entry) => entry.id === 'buzz')).toBe(true)
  })

  it('deux scènes de même identifiant : la dernière l’emporte', () => {
    const { scenes } = parseScenes([
      scene([{ type: 'wait', durationMs: 1 }], { name: 'premiere' }),
      scene([{ type: 'wait', durationMs: 2 }], { name: 'seconde' }),
    ])
    expect(scenes).toHaveLength(1)
    expect(scenes[0]?.name).toBe('seconde')
  })

  it('la scène identify n’est jamais surchargée', () => {
    const { scenes, problems } = parseScenes([
      scene([{ type: 'color', color: RED }], { id: 'identify', priority: 90 }),
      scene([{ type: 'wait', durationMs: 1 }], { id: 'autre' }),
    ])
    expect(scenes.map((entry) => entry.id)).toEqual(['autre'])
    expect(problems).toHaveLength(1)
  })
})
