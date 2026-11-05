import {
  buttonsByCorner,
  DEFAULT_BUZZER_LAYOUT,
  moveBuzzerToCorner,
  setBuzzerColor,
} from '@hardware/buzzers/layout'
import {
  activeKeymap,
  activeLightingConfig,
  defaultRoomHardwareConfig,
  DMX_REFRESH_LIMITS,
  parseRoomHardwareConfig,
  withBuzzerLayout,
  withDesksCount,
  withLearnedKeymap,
  withPlanPoint,
} from '@hardware/config'
import { DEFAULT_DESK_COLORS } from '@hardware/lighting/scenes'
import { DEFAULT_SMOKE_SAFETY } from '@hardware/lighting/smoke'
import { resolveRoomPlan } from '@hardware/plan'

describe('configuration matérielle de salle', () => {
  it('donne une salle neuve en simulation, fumée désactivée', () => {
    const config = defaultRoomHardwareConfig()
    expect(config.lighting.driver).toBe('simulation')
    expect(config.lighting.smoke).toEqual(DEFAULT_SMOKE_SAFETY)
    expect(config.buzzers.keymap).toEqual({})
  })

  it('relit une config vide (`rooms.config` par défaut = {})', () => {
    for (const input of [{}, null, undefined, 'x', []]) {
      const parsed = parseRoomHardwareConfig(input)
      expect(parsed.config).toEqual(defaultRoomHardwareConfig())
      expect(parsed.problems).toEqual([])
    }
  })

  it('relit une config complète et la renvoie normalisée', () => {
    const parsed = parseRoomHardwareConfig({
      version: 1,
      buzzers: { keymap: { KeyA: { desk: 1, button: 'A' }, Escape: { desk: 1, button: 'B' } } },
      lighting: {
        driver: 'usbpro',
        refreshHz: 100,
        fixtures: [{ id: 'par', name: 'PAR', profileId: 'par-rgb', address: 1 }],
        customProfiles: [],
        deskColors: { 1: { r: 300, g: 0, b: 0 }, 2: { r: 'x' } },
        bindings: { buzzer_pressed: null, answer_correct: 'victory', bad: 3 },
        smoke: { enabled: true, maxDurationMs: 99_999 },
      },
    })
    expect(parsed.problems).toEqual(['Touche Escape : touche système interdite'])
    expect(parsed.config.buzzers.keymap).toEqual({ KeyA: { desk: 1, button: 'A' } })
    expect(parsed.config.lighting).toMatchObject({
      driver: 'usbpro',
      refreshHz: DMX_REFRESH_LIMITS.max,
      fixtures: [{ id: 'par', name: 'PAR', profileId: 'par-rgb', address: 1 }],
      bindings: { buzzer_pressed: null, answer_correct: 'victory' },
      smoke: { enabled: true, maxDurationMs: 10_000, requireConfirmation: true },
    })
    expect(parsed.config.lighting.deskColors[1]).toEqual({ r: 255, g: 0, b: 0 })
    expect(parsed.config.lighting.deskColors[2]).toEqual(DEFAULT_DESK_COLORS[2])
    expect(parsed.fixtures[0]?.profile.id).toBe('par-rgb')
    // La config normalisée ne stocke pas le profil résolu.
    expect(parsed.config.lighting.fixtures[0]).not.toHaveProperty('profile')
  })

  it('retombe en simulation pour une sortie inconnue', () => {
    const parsed = parseRoomHardwareConfig({ lighting: { driver: 'artnet', refreshHz: 1 } })
    expect(parsed.config.lighting.driver).toBe('simulation')
    expect(parsed.config.lighting.refreshHz).toBe(DMX_REFRESH_LIMITS.min)
    expect(parsed.problems[0]).toContain('artnet')
  })

  describe('cible Art-Net (`lighting.artnet`)', () => {
    const parse = (artnet: unknown) =>
      parseRoomHardwareConfig({ lighting: { driver: 'artnet-bridge', artnet } })

    it('relit une config v1 sans `artnet`, sans problème', () => {
      const parsed = parse(undefined)
      expect(parsed.config.lighting).not.toHaveProperty('artnet')
      expect(parsed.problems).toEqual([])
      expect(defaultRoomHardwareConfig().lighting).not.toHaveProperty('artnet')
    })

    it('garde une IP locale (espaces retirés)', () => {
      expect(parse({ target: '192.168.1.50' }).config.lighting.artnet).toEqual({
        target: '192.168.1.50',
      })
      const padded = parse({ target: ' 10.0.0.9 ' })
      expect(padded.config.lighting.artnet).toEqual({ target: '10.0.0.9' })
      expect(padded.problems).toEqual([])
    })

    it('est conservé tel quel par une seconde relecture', () => {
      const once = parse({ target: '192.168.1.50' }).config
      expect(parseRoomHardwareConfig(once).config).toEqual(once)
    })

    it.each(['8.8.8.8', '1.1.1.1', '192.168.1.300', 'noeud.local', 42])(
      'écarte la cible %s et signale un problème',
      (target) => {
        const parsed = parse({ target })
        expect(parsed.config.lighting).not.toHaveProperty('artnet')
        expect(parsed.problems).toHaveLength(1)
        expect(parsed.problems[0]).toContain('IP du nœud Art-Net refusée')
      }
    )

    it.each([6455, 53, 161, 70_000, '6454'])(
      'ne relit jamais de port (%s) : la cible est gardée, le port retiré',
      (port) => {
        const parsed = parse({ target: '192.168.1.50', port })
        expect(parsed.config.lighting.artnet).toEqual({ target: '192.168.1.50' })
        expect(parsed.problems).toEqual([])
        expect(parseRoomHardwareConfig(parsed.config).config.lighting.artnet).toEqual({
          target: '192.168.1.50',
        })
      }
    )

    it('traite une cible vide, nulle ou une section illisible comme un réglage absent', () => {
      for (const artnet of [{ target: '' }, { target: '  ' }, {}, null, 'x', []]) {
        const parsed = parse(artnet)
        expect(parsed.config.lighting).not.toHaveProperty('artnet')
        expect(parsed.problems).toEqual([])
      }
    })
  })

  describe('nombre de pupitres (`desksCount`)', () => {
    it('vaut 4 pour une salle neuve et pour une config sans le champ', () => {
      expect(defaultRoomHardwareConfig().desksCount).toBe(4)
      for (const input of [{}, null, { buzzers: { keymap: {} } }, { version: 1, lighting: {} }]) {
        const parsed = parseRoomHardwareConfig(input)
        expect(parsed.config.desksCount).toBe(4)
        expect(parsed.problems).toEqual([])
      }
    })

    it('relit un nombre de 1 à 6', () => {
      for (const desksCount of [1, 2, 3, 4, 5, 6]) {
        const parsed = parseRoomHardwareConfig({ desksCount })
        expect(parsed.config.desksCount).toBe(desksCount)
        expect(parsed.problems).toEqual([])
      }
    })

    it('ramène une valeur hors bornes ou décimale dans 1 à 6 et la signale', () => {
      expect(parseRoomHardwareConfig({ desksCount: 0 }).config.desksCount).toBe(1)
      expect(parseRoomHardwareConfig({ desksCount: 9 }).config.desksCount).toBe(6)
      expect(parseRoomHardwareConfig({ desksCount: 5.8 }).config.desksCount).toBe(5)
      expect(parseRoomHardwareConfig({ desksCount: 9 }).problems[0]).toContain('pupitres')
    })

    it('retombe sur 4 pour une valeur qui n’est pas un nombre', () => {
      for (const desksCount of ['6', null, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
        const parsed = parseRoomHardwareConfig({ desksCount })
        expect(parsed.config.desksCount).toBe(4)
        expect(parsed.problems).toHaveLength(1)
      }
    })

    it('élargit au plus haut pupitre équipé seulement quand le champ est absent', () => {
      const keymap = { KeyT: { desk: 6, button: 'A' } }
      const fixtures = [{ id: 'par', name: 'PAR', profileId: 'par-rgb', address: 1, desk: 5 }]

      // Ancienne config (salle équipée avant le réglage) : on garde ses pupitres.
      expect(parseRoomHardwareConfig({ buzzers: { keymap } }).config.desksCount).toBe(6)
      expect(parseRoomHardwareConfig({ lighting: { fixtures } }).config.desksCount).toBe(5)
      expect(
        parseRoomHardwareConfig({ buzzers: { keymap: { KeyA: { desk: 2, button: 'A' } } } })
      ).toMatchObject({ config: { desksCount: 4 } })

      // Champ présent, même à 4 : jamais remonté, le reste est ignoré.
      expect(
        parseRoomHardwareConfig({ desksCount: 4, buzzers: { keymap } }).config.desksCount
      ).toBe(4)
      expect(
        parseRoomHardwareConfig({ desksCount: 2, lighting: { fixtures } }).config.desksCount
      ).toBe(2)
    })

    const sixDeskConfig = () =>
      parseRoomHardwareConfig({
        desksCount: 6,
        buzzers: {
          keymap: {
            KeyA: { desk: 1, button: 'A' },
            KeyB: { desk: 4, button: 'D' },
            KeyT: { desk: 5, button: 'A' },
            KeyY: { desk: 6, button: 'B' },
          },
        },
        lighting: {
          fixtures: [
            { id: 'par4', name: 'PAR 4', profileId: 'par-rgb', address: 1, desk: 4 },
            { id: 'par6', name: 'PAR 6', profileId: 'par-rgb', address: 10, desk: 6 },
          ],
        },
      }).config

    it('garde en réserve les buzzers et les lumières des pupitres retirés, et les restitue', () => {
      const config = sixDeskConfig()

      const four = withDesksCount(config, 4)

      expect(four.desksCount).toBe(4)
      // Rien n'est effacé de la config enregistrée...
      expect(four.buzzers.keymap).toEqual(config.buzzers.keymap)
      expect(four.lighting.fixtures).toEqual(config.lighting.fixtures)
      // ... mais seuls les pupitres de la salle sont actifs.
      expect(Object.keys(activeKeymap(four)).sort()).toEqual(['KeyA', 'KeyB'])
      expect(
        activeLightingConfig(four).fixtures.map((fixture) => [fixture.id, fixture.desk])
      ).toEqual([
        ['par4', 4],
        ['par6', undefined],
      ])
      // Relue, la config ne remonte pas à 6.
      expect(parseRoomHardwareConfig(four).config).toEqual(four)

      // Remonter à 6 restitue tout, tel quel.
      const sixAgain = withDesksCount(four, 6)
      expect(sixAgain).toEqual(config)
      expect(activeKeymap(sixAgain)).toEqual(config.buzzers.keymap)
      expect(activeLightingConfig(sixAgain).fixtures).toEqual(config.lighting.fixtures)
    })

    it('ne modifie pas la config reçue et ramène un nombre absurde dans 1..6', () => {
      const config = sixDeskConfig()
      expect(withDesksCount(config, 99).desksCount).toBe(6)
      expect(withDesksCount(config, 0).desksCount).toBe(1)
      withDesksCount(config, 4)
      expect(config.desksCount).toBe(6)
      expect(Object.keys(config.buzzers.keymap)).toHaveLength(4)
    })

    it('ignore les positions de lyre des pupitres retirés pour les lumières actives', () => {
      const config = parseRoomHardwareConfig({
        desksCount: 4,
        lighting: {
          fixtures: [
            {
              id: 'lyre',
              name: 'Lyre',
              profileId: 'moving-head-8',
              address: 1,
              deskPositions: { 1: { pan: 1, tilt: 2 }, 5: { pan: 3, tilt: 4 } },
            },
          ],
        },
      }).config

      expect(activeLightingConfig(config).fixtures[0]?.deskPositions).toEqual({
        1: { pan: 1, tilt: 2 },
      })
      expect(config.lighting.fixtures[0]?.deskPositions).toHaveProperty('5')
    })

    it('enregistre les buzzers réappris en gardant la réserve, sans doublon de touche', () => {
      const four = withDesksCount(sixDeskConfig(), 4)

      // La touche KeyT (réserve du pupitre 5) est réapprise sur le pupitre 2 : plus de doublon.
      const saved = withLearnedKeymap(four, {
        KeyA: { desk: 1, button: 'A' },
        KeyT: { desk: 2, button: 'C' },
      })

      expect(saved.buzzers.keymap).toEqual({
        KeyY: { desk: 6, button: 'B' },
        KeyA: { desk: 1, button: 'A' },
        KeyT: { desk: 2, button: 'C' },
      })
      // Au remontage, la touche n'a qu'un propriétaire : le pupitre 2.
      const sixAgain = activeKeymap(withDesksCount(saved, 6))
      expect(sixAgain.KeyT).toEqual({ desk: 2, button: 'C' })
      expect(Object.keys(sixAgain)).toHaveLength(3)
    })

    it('est conservé tel quel par une seconde relecture', () => {
      const once = parseRoomHardwareConfig({ desksCount: 6 }).config
      expect(parseRoomHardwareConfig(once).config).toEqual(once)
    })
  })
})

describe('configuration matérielle : garde-fou relais de la fumée', () => {
  const smokeRoom = (profileId: string, smoke: Record<string, unknown>) => ({
    version: 1,
    desksCount: 2,
    buzzers: { keymap: { KeyA: { desk: 1, button: 'A' } } },
    lighting: {
      driver: 'usbpro',
      fixtures: [
        { id: 'par', name: 'PAR', profileId: 'par-rgb', address: 1 },
        { id: 'fumee', name: 'Fumée', profileId, address: 30 },
      ],
      smoke,
    },
  })

  it('relit une ancienne salle à fumée DMX sans relais ni case : sans erreur, fumée désactivée', () => {
    const parsed = parseRoomHardwareConfig(
      smokeRoom('smoke-dmx', {
        enabled: true,
        maxDurationMs: 4000,
        cooldownMs: 45_000,
        maxLevel: 200,
      })
    )
    expect(parsed.smokeDisabledReason).toBe('relay_required')
    expect(parsed.problems.some((problem) => problem.startsWith('Fumée désactivée'))).toBe(true)
    // Seule l'activation est retirée : tous les autres réglages et le reste de la salle sont gardés.
    expect(parsed.config.lighting.smoke).toEqual({
      enabled: false,
      maxDurationMs: 4000,
      cooldownMs: 45_000,
      maxLevel: 200,
      requireConfirmation: true,
    })
    expect(parsed.config.desksCount).toBe(2)
    expect(parsed.config.buzzers.keymap).toEqual({ KeyA: { desk: 1, button: 'A' } })
    expect(parsed.config.lighting.fixtures.map((fixture) => fixture.id)).toEqual(['par', 'fumee'])
    expect(parsed.fixtures).toHaveLength(2)
  })

  it('garde la fumée activée avec un profil à relais', () => {
    const parsed = parseRoomHardwareConfig(smokeRoom('smoke-relay', { enabled: true }))
    expect(parsed.smokeDisabledReason).toBeNull()
    expect(parsed.config.lighting.smoke.enabled).toBe(true)
    expect(parsed.problems).toEqual([])
    expect(parsed.config.lighting.smoke).not.toHaveProperty('cutsOnSignalLoss')
  })

  it('garde la fumée DMX activée quand la case « coupe sur perte de signal » est cochée', () => {
    const parsed = parseRoomHardwareConfig(
      smokeRoom('smoke-dmx', { enabled: true, cutsOnSignalLoss: true })
    )
    expect(parsed.smokeDisabledReason).toBeNull()
    expect(parsed.config.lighting.smoke).toMatchObject({ enabled: true, cutsOnSignalLoss: true })
    // Roundtrip : la config normalisée se relit à l'identique.
    expect(parseRoomHardwareConfig(parsed.config).config).toEqual(parsed.config)
  })

  it('ne retient la case que si elle vaut exactement vrai (absente ou autre = faux)', () => {
    for (const value of [undefined, false, 'true', 1, null]) {
      const parsed = parseRoomHardwareConfig(
        smokeRoom('smoke-dmx', { enabled: true, cutsOnSignalLoss: value })
      )
      expect(parsed.config.lighting.smoke.enabled).toBe(false)
      expect(parsed.config.lighting.smoke).not.toHaveProperty('cutsOnSignalLoss')
    }
  })

  it('un profil sur mesure compte comme relais si son canal fumée est « binary »', () => {
    const custom = (binary: boolean) => ({
      ...smokeRoom('ma-fumee', { enabled: true }),
      lighting: {
        ...smokeRoom('ma-fumee', { enabled: true }).lighting,
        customProfiles: [
          {
            id: 'ma-fumee',
            name: 'Ma fumée',
            kind: 'smoke',
            channels: [{ role: 'smoke', ...(binary ? { binary: true } : {}) }],
          },
        ],
      },
    })
    expect(parseRoomHardwareConfig(custom(true)).config.lighting.smoke.enabled).toBe(true)
    expect(parseRoomHardwareConfig(custom(false)).config.lighting.smoke.enabled).toBe(false)
  })

  it('juge le relais sur les canaux, pas sur le kind : un profil « par » à canal fumée progressif est sans relais', () => {
    const room = (kind: string, channels: Record<string, unknown>[], smoke: object = {}) => ({
      ...smokeRoom('ma-fumee', { enabled: true, ...smoke }),
      lighting: {
        ...smokeRoom('ma-fumee', {}).lighting,
        smoke: { enabled: true, ...smoke },
        customProfiles: [{ id: 'ma-fumee', name: 'Ma fumée', kind, channels }],
      },
    })
    // kind « par » avec un canal fumée progressif : désactivée sans la case.
    const par = parseRoomHardwareConfig(room('par', [{ role: 'smoke' }]))
    expect(par.smokeDisabledReason).toBe('relay_required')
    expect(par.config.lighting.smoke.enabled).toBe(false)
    expect(
      parseRoomHardwareConfig(room('par', [{ role: 'smoke' }], { cutsOnSignalLoss: true })).config
        .lighting.smoke.enabled
    ).toBe(true)

    // kind « smoke » avec un canal binary ET un canal progressif : sans relais.
    const mixed = parseRoomHardwareConfig(
      room('smoke', [{ role: 'smoke', binary: true }, { role: 'smoke' }])
    )
    expect(mixed.smokeDisabledReason).toBe('relay_required')
    expect(mixed.config.lighting.smoke.enabled).toBe(false)
    // Tous les canaux fumée binary : relais.
    const relay = parseRoomHardwareConfig(
      room('smoke', [
        { role: 'smoke', binary: true },
        { role: 'smoke', binary: true },
      ])
    )
    expect(relay.config.lighting.smoke.enabled).toBe(true)
  })
})

describe('disposition des buzzers (`buzzers.layout`)', () => {
  const layoutOf = (layout: unknown) => parseRoomHardwareConfig({ buzzers: { layout } })

  it('donne le défaut sans disposition, avec la grille A B / C D', () => {
    const { config, problems } = layoutOf(undefined)
    expect(config.buzzers.layout).toEqual(DEFAULT_BUZZER_LAYOUT)
    expect(problems).toEqual([])
    expect(buttonsByCorner(config.buzzers.layout)).toEqual({ tl: 'A', tr: 'B', bl: 'C', br: 'D' })
  })

  it('garde une disposition valide', () => {
    const layout = {
      A: { color: 'red', corner: 'br' },
      B: { color: 'white', corner: 'bl' },
      C: { color: 'pink', corner: 'tr' },
      D: { color: 'orange', corner: 'tl' },
    }
    const { config, problems } = layoutOf(layout)
    expect(config.buzzers.layout).toEqual(layout)
    expect(problems).toEqual([])
    expect(buttonsByCorner(config.buzzers.layout).tl).toBe('D')
  })

  it('reprend la couleur par défaut d’un buzzer hors palette ou absent', () => {
    const { config, problems } = layoutOf({
      A: { color: 'cyan', corner: 'tl' },
      B: { corner: 'tr' },
      C: { color: 'red', corner: 'bl' },
      D: { color: 3, corner: 'br' },
    })
    expect(config.buzzers.layout.A.color).toBe('blue')
    expect(config.buzzers.layout.B.color).toBe('purple')
    expect(config.buzzers.layout.C.color).toBe('red')
    expect(config.buzzers.layout.D.color).toBe('yellow')
    expect(problems).toHaveLength(2)
  })

  it('reprend les coins par défaut quand deux buzzers partagent un coin', () => {
    const { config, problems } = layoutOf({
      A: { color: 'red', corner: 'tl' },
      B: { color: 'green', corner: 'tl' },
      C: { color: 'blue', corner: 'bl' },
      D: { color: 'white', corner: 'br' },
    })
    expect(config.buzzers.layout.A).toEqual({ color: 'red', corner: 'tl' })
    expect(config.buzzers.layout.B).toEqual({ color: 'green', corner: 'tr' })
    expect(config.buzzers.layout.C.corner).toBe('bl')
    expect(problems).toEqual([
      'Disposition des buzzers invalide (quatre places distinctes attendues)',
    ])
  })

  it('reprend les coins par défaut pour un coin inconnu ou incomplet', () => {
    for (const layout of [
      { A: { corner: 'middle' } },
      { A: { corner: 'br' } },
      'x',
      [],
      { A: 1, B: null },
    ]) {
      expect(layoutOf(layout).config.buzzers.layout).toEqual(DEFAULT_BUZZER_LAYOUT)
    }
  })

  it('moveBuzzerToCorner échange avec l’occupant du coin', () => {
    const moved = moveBuzzerToCorner(DEFAULT_BUZZER_LAYOUT, 'A', 'br')
    expect(buttonsByCorner(moved)).toEqual({ tl: 'D', tr: 'B', bl: 'C', br: 'A' })
    expect(moved.A.color).toBe('blue')
    // Même coin : rien ne change.
    expect(moveBuzzerToCorner(DEFAULT_BUZZER_LAYOUT, 'B', 'tr')).toEqual(DEFAULT_BUZZER_LAYOUT)
  })

  it('reprend les couleurs par défaut quand deux buzzers ont la même couleur', () => {
    const { config, problems } = layoutOf({
      A: { color: 'red', corner: 'br' },
      B: { color: 'red', corner: 'tr' },
      C: { color: 'blue', corner: 'bl' },
      D: { color: 'white', corner: 'tl' },
    })
    expect(Object.values(config.buzzers.layout).map((style) => style.color)).toEqual([
      'blue',
      'purple',
      'green',
      'yellow',
    ])
    // Les places valides sont conservées.
    expect(buttonsByCorner(config.buzzers.layout)).toEqual({ tl: 'D', tr: 'B', bl: 'C', br: 'A' })
    expect(problems).toEqual([
      'Couleurs des buzzers en double (quatre couleurs distinctes attendues)',
    ])
  })

  it('setBuzzerColor échange avec le buzzer qui avait la couleur', () => {
    const swapped = setBuzzerColor(DEFAULT_BUZZER_LAYOUT, 'A', 'green')
    expect(swapped.A.color).toBe('green')
    expect(swapped.C.color).toBe('blue')
    expect(new Set(Object.values(swapped).map((style) => style.color)).size).toBe(4)
    // Couleur libre : simple changement. Même couleur : rien ne change.
    expect(setBuzzerColor(DEFAULT_BUZZER_LAYOUT, 'A', 'red').A.color).toBe('red')
    expect(setBuzzerColor(DEFAULT_BUZZER_LAYOUT, 'A', 'blue')).toEqual(DEFAULT_BUZZER_LAYOUT)
    expect(DEFAULT_BUZZER_LAYOUT.A.color).toBe('blue')
  })

  it('withBuzzerLayout enregistre une copie', () => {
    const config = withBuzzerLayout(defaultRoomHardwareConfig(), {
      ...DEFAULT_BUZZER_LAYOUT,
      A: { color: 'red', corner: 'tl' },
    })
    expect(config.buzzers.layout.A.color).toBe('red')
    expect(DEFAULT_BUZZER_LAYOUT.A.color).toBe('blue')
  })
})

describe('plan de salle (`config.plan`)', () => {
  const room = (plan: unknown, extra: Record<string, unknown> = {}) =>
    parseRoomHardwareConfig({
      desksCount: 3,
      lighting: {
        fixtures: [
          { id: 'par', name: 'PAR', profileId: 'par-rgb', address: 1 },
          { id: 'par2', name: 'PAR 2', profileId: 'par-rgb', address: 10 },
        ],
      },
      plan,
      ...extra,
    })

  it('une ancienne config sans plan reste valide, avec les défauts', () => {
    const { config, problems } = room(undefined)
    expect(config.plan).toEqual({ screen: { x: 0.5, y: 0.08 }, desks: {}, fixtures: {} })
    expect(problems).toEqual([])
    const resolved = resolveRoomPlan(config.plan, 3, [{ id: 'par' }, { id: 'par2' }])
    expect(resolved.screen).toEqual({ x: 0.5, y: 0.08 })
    // Pupitres en rangée face à l'écran, appareils répartis en haut.
    expect(Object.values(resolved.desks).map((point) => point.x)).toEqual([0.25, 0.5, 0.75])
    expect(new Set(Object.values(resolved.desks).map((point) => point.y)).size).toBe(1)
    expect(Object.keys(resolved.fixtures)).toEqual(['par', 'par2'])
    expect(resolved.fixtures.par?.y).toBeLessThan(resolved.desks[1]?.y ?? 0)
  })

  it('ramène x et y dans [0,1] et écarte les valeurs invalides', () => {
    const { config } = room({
      screen: { x: 2, y: -1 },
      desks: { 1: { x: 0.2, y: 0.9 }, 2: { x: 'a', y: 0.5 }, 3: { x: Number.NaN, y: 0 } },
      fixtures: { par: { x: -0.5, y: 3 }, par2: 'x' },
    })
    expect(config.plan.screen).toEqual({ x: 1, y: 0 })
    expect(config.plan.desks).toEqual({ 1: { x: 0.2, y: 0.9 } })
    expect(config.plan.fixtures).toEqual({ par: { x: 0, y: 1 } })
  })

  it('retire les appareils inconnus et garde en réserve les pupitres au-delà de desksCount', () => {
    const plan = {
      desks: {
        1: { x: 0.1, y: 0.1 },
        4: { x: 0.4, y: 0.4 },
        6: { x: 0.6, y: 0.6 },
        7: { x: 0, y: 0 },
      },
      fixtures: { par: { x: 0.3, y: 0.3 }, gone: { x: 0.5, y: 0.5 } },
    }
    const { config } = room(plan)
    expect(Object.keys(config.plan.desks)).toEqual(['1', '4', '6'])
    expect(Object.keys(config.plan.fixtures)).toEqual(['par'])
    // Affichage : seuls les 3 pupitres existants ; les positions en réserve ne reviennent que si
    // desksCount remonte.
    const fixtures = [{ id: 'par' }, { id: 'par2' }]
    expect(Object.keys(resolveRoomPlan(config.plan, 3, fixtures).desks)).toEqual(['1', '2', '3'])
    const more = resolveRoomPlan(config.plan, 6, fixtures)
    expect(more.desks[4]).toEqual({ x: 0.4, y: 0.4 })
    expect(more.desks[6]).toEqual({ x: 0.6, y: 0.6 })
    // Ré-enregistrer avec 3 pupitres ne perd pas la réserve.
    const again = parseRoomHardwareConfig({ ...config, desksCount: 3 }).config
    expect(again.plan.desks[4]).toEqual({ x: 0.4, y: 0.4 })
  })

  it('place un appareil rattaché au-dessus de son pupitre, les autres en rangée en haut', () => {
    const { config } = room(undefined)
    const resolved = resolveRoomPlan(config.plan, 3, [
      { id: 'a', desk: 2 },
      { id: 'b', desk: 2 },
      { id: 'c' },
      { id: 'd', desk: 5 },
    ])
    const desk = resolved.desks[2]!
    expect(resolved.fixtures.a!.y).toBeLessThan(desk.y)
    expect(resolved.fixtures.a!.x).toBeLessThan(desk.x)
    expect(resolved.fixtures.b!.x).toBeGreaterThan(desk.x)
    expect(resolved.fixtures.a!.y).toBe(resolved.fixtures.b!.y)
    // Non rattaché, ou rattaché à un pupitre qui n'existe pas : rangée du haut.
    expect(resolved.fixtures.c!.y).toBe(0.28)
    expect(resolved.fixtures.d!.y).toBe(0.28)
    expect(resolved.fixtures.c!.x).not.toBe(resolved.fixtures.d!.x)
  })

  it('répartit les appareils non rattachés sur deux rangées au-delà de six', () => {
    const { config } = room(undefined)
    const ids = Array.from({ length: 8 }, (_item, index) => ({ id: `f${index}` }))
    const resolved = resolveRoomPlan(config.plan, 6, ids)
    const rows = new Set(Object.values(resolved.fixtures).map((point) => point.y))
    expect(rows.size).toBe(2)
    expect(Math.max(...rows)).toBeLessThan(resolved.desks[1]!.y)
    const points = Object.values(resolved.fixtures).map((point) => `${point.x}/${point.y}`)
    expect(new Set(points).size).toBe(8)
  })

  it('withPlanPoint déplace un élément, borné', () => {
    let config = defaultRoomHardwareConfig()
    config = withPlanPoint(config, { kind: 'desk', id: 2 }, { x: 1.5, y: 0.4 })
    config = withPlanPoint(config, { kind: 'screen' }, { x: 0.1, y: 0.2 })
    config = withPlanPoint(config, { kind: 'fixture', id: 'par' }, { x: 0.3, y: -2 })
    expect(config.plan).toEqual({
      screen: { x: 0.1, y: 0.2 },
      desks: { 2: { x: 1, y: 0.4 } },
      fixtures: { par: { x: 0.3, y: 0 } },
    })
  })
})

describe('parcours de configuration (`setupDone`)', () => {
  it('reste absent par défaut et ne vaut vrai que pour true', () => {
    expect(parseRoomHardwareConfig({}).config.setupDone).toBeUndefined()
    expect(parseRoomHardwareConfig({ setupDone: 'yes' }).config.setupDone).toBeUndefined()
    expect(parseRoomHardwareConfig({ setupDone: true }).config.setupDone).toBe(true)
  })
})
