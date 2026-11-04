import {
  defaultRoomHardwareConfig,
  DMX_REFRESH_LIMITS,
  parseRoomHardwareConfig,
  withDesksCount,
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

    it('retire les buzzers et les positions des pupitres en trop quand on réduit le nombre', () => {
      const config = parseRoomHardwareConfig({
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

      const four = withDesksCount(config, 4)

      expect(four.desksCount).toBe(4)
      expect(Object.keys(four.buzzers.keymap).sort()).toEqual(['KeyA', 'KeyB'])
      // L'appareil reste déclaré, détaché du pupitre qui n'existe plus.
      expect(four.lighting.fixtures.map((fixture) => [fixture.id, fixture.desk])).toEqual([
        ['par4', 4],
        ['par6', undefined],
      ])
      // Relue, la config ne remonte pas à 6.
      expect(parseRoomHardwareConfig(four).config).toEqual(four)
      // Ne modifie pas la config reçue ; un nombre absurde est ramené dans 1..6.
      expect(Object.keys(config.buzzers.keymap)).toHaveLength(4)
      expect(withDesksCount(config, 99).buzzers.keymap).toEqual(config.buzzers.keymap)
      expect(withDesksCount(config, 0).desksCount).toBe(1)
    })

    it('est conservé tel quel par une seconde relecture', () => {
      const once = parseRoomHardwareConfig({ desksCount: 6 }).config
      expect(parseRoomHardwareConfig(once).config).toEqual(once)
    })
  })
})
