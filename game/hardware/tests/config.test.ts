import {
  defaultRoomHardwareConfig,
  DMX_REFRESH_LIMITS,
  parseRoomHardwareConfig,
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

    it('est conservé tel quel par une seconde relecture', () => {
      const once = parseRoomHardwareConfig({ desksCount: 6 }).config
      expect(parseRoomHardwareConfig(once).config).toEqual(once)
    })
  })
})
