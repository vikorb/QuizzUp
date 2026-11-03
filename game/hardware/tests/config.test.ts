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
})
