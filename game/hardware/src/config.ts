import type { BuzzerKeymap } from './buzzers/keymap'
import { parseKeymap } from './buzzers/keymap'
import type { FixtureConfig, ResolvedFixture } from './dmx/fixtures'
import { parseRig } from './dmx/fixtures'
import type { DmxDriver } from './dmx/output'
import { DMX_DRIVERS } from './dmx/output'
import type { FixtureProfile } from './dmx/profiles'
import { DEFAULT_DESK_COLORS } from './lighting/scenes'
import type { SmokeSafetyConfig } from './lighting/smoke'
import { DEFAULT_SMOKE_SAFETY, normalizeSmokeSafety } from './lighting/smoke'
import type { Desk, Rgb } from './types'
import { clampByte, DESKS } from './types'

export const ROOM_HARDWARE_CONFIG_VERSION = 1

/** Fréquence d'envoi des trames DMX : bornée pour rester dans la norme (max ~44 Hz). */
export const DMX_REFRESH_LIMITS = { min: 10, max: 40, default: 30 } as const

export type LightingConfig = {
  driver: DmxDriver
  refreshHz: number
  fixtures: FixtureConfig[]
  customProfiles: FixtureProfile[]
  deskColors: Record<Desk, Rgb>
  /** Surcharges événement → scène (`null` = aucune scène pour cet événement). */
  bindings: Record<string, string | null>
  smoke: SmokeSafetyConfig
}

/** Configuration matérielle d'une salle, stockée dans `rooms.config` (JSONB). */
export type RoomHardwareConfig = {
  version: number
  buzzers: { keymap: BuzzerKeymap }
  lighting: LightingConfig
}

export type ParsedRoomHardwareConfig = {
  config: RoomHardwareConfig
  /** Appareils validés, profil résolu, prêts pour le contrôleur. */
  fixtures: ResolvedFixture[]
  /** Problèmes à afficher dans l'écran de configuration (rien n'est bloquant). */
  problems: string[]
}

/** Salle neuve : rien d'associé, simulation, fumée désactivée. */
export function defaultRoomHardwareConfig(): RoomHardwareConfig {
  return {
    version: ROOM_HARDWARE_CONFIG_VERSION,
    buzzers: { keymap: {} },
    lighting: {
      driver: 'simulation',
      refreshHz: DMX_REFRESH_LIMITS.default,
      fixtures: [],
      customProfiles: [],
      deskColors: { ...DEFAULT_DESK_COLORS },
      bindings: {},
      smoke: { ...DEFAULT_SMOKE_SAFETY },
    },
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

function parseDeskColors(input: unknown): Record<Desk, Rgb> {
  const raw = asRecord(input)
  const colors = { ...DEFAULT_DESK_COLORS }
  for (const desk of DESKS) {
    const color = asRecord(raw[String(desk)])
    if (typeof color.r === 'number' && typeof color.g === 'number' && typeof color.b === 'number') {
      colors[desk] = { r: clampByte(color.r), g: clampByte(color.g), b: clampByte(color.b) }
    }
  }
  return colors
}

function parseBindings(input: unknown): Record<string, string | null> {
  const bindings: Record<string, string | null> = {}
  for (const [event, scene] of Object.entries(asRecord(input))) {
    if (typeof scene === 'string' || scene === null) {
      bindings[event] = scene
    }
  }
  return bindings
}

/**
 * Relit `rooms.config` de façon tolérante : une config vide, ancienne ou partiellement invalide
 * donne toujours une config utilisable (valeurs par défaut) et la liste des problèmes trouvés.
 */
export function parseRoomHardwareConfig(input: unknown): ParsedRoomHardwareConfig {
  const raw = asRecord(input)
  const buzzers = asRecord(raw.buzzers)
  const lighting = asRecord(raw.lighting)
  const problems: string[] = []

  const { keymap, problems: keymapProblems } = parseKeymap(buzzers.keymap)
  problems.push(...keymapProblems)

  const rig = parseRig(lighting.fixtures, lighting.customProfiles)
  problems.push(...rig.problems)

  let driver: DmxDriver = 'simulation'
  if (lighting.driver !== undefined) {
    if ((DMX_DRIVERS as readonly unknown[]).includes(lighting.driver)) {
      driver = lighting.driver as DmxDriver
    } else {
      problems.push(`Sortie DMX inconnue : ${String(lighting.driver)} (simulation utilisée)`)
    }
  }

  const refreshHz =
    typeof lighting.refreshHz === 'number' && Number.isFinite(lighting.refreshHz)
      ? Math.min(DMX_REFRESH_LIMITS.max, Math.max(DMX_REFRESH_LIMITS.min, lighting.refreshHz))
      : DMX_REFRESH_LIMITS.default

  const config: RoomHardwareConfig = {
    version: ROOM_HARDWARE_CONFIG_VERSION,
    buzzers: { keymap },
    lighting: {
      driver,
      refreshHz,
      fixtures: rig.fixtures.map(({ profile: _profile, ...fixture }) => fixture),
      customProfiles: rig.customProfiles,
      deskColors: parseDeskColors(lighting.deskColors),
      bindings: parseBindings(lighting.bindings),
      smoke: normalizeSmokeSafety(asRecord(lighting.smoke) as Partial<SmokeSafetyConfig>),
    },
  }

  return { config, fixtures: rig.fixtures, problems }
}
