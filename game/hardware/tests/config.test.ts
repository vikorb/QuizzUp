import {
  activeKeymap,
  activeLightingConfig,
  defaultRoomHardwareConfig,
  DMX_REFRESH_LIMITS,
  parseRoomHardwareConfig,
  withDesksCount,
  withLearnedKeymap,
} from '@hardware/config'
import { DEFAULT_DESK_COLORS } from '@hardware/lighting/scenes'
import { DEFAULT_SMOKE_SAFETY } from '@hardware/lighting/smoke'

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
