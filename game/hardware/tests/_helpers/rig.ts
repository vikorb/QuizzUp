import type { LightingConfig } from '@hardware/config'
import { defaultRoomHardwareConfig } from '@hardware/config'
import type { FixtureConfig } from '@hardware/dmx/fixtures'

/** Salle type : un PAR par pupitre, une lyre, un PAR d'ambiance et une machine à fumée. */
export const RIG: FixtureConfig[] = [
  { id: 'par1', name: 'PAR pupitre 1', profileId: 'par-rgb', address: 1, desk: 1 },
  { id: 'par2', name: 'PAR pupitre 2', profileId: 'par-rgb', address: 4, desk: 2 },
  {
    id: 'head',
    name: 'Lyre',
    profileId: 'moving-head-8',
    address: 10,
    deskPositions: { 1: { pan: 1_000, tilt: 2_000 }, 2: { pan: 30_000, tilt: 40_000 } },
  },
  { id: 'wash', name: 'Ambiance', profileId: 'par-drgb', address: 20 },
  { id: 'smoke', name: 'Fumée', profileId: 'smoke-dmx', address: 30 },
]

export function lightingConfig(overrides: Partial<LightingConfig> = {}): LightingConfig {
  return {
    ...defaultRoomHardwareConfig().lighting,
    fixtures: RIG,
    smoke: {
      enabled: true,
      maxDurationMs: 3_000,
      cooldownMs: 30_000,
      maxLevel: 180,
      requireConfirmation: true,
    },
    ...overrides,
  }
}
