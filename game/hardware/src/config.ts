import type { BuzzerKeymap } from './buzzers/keymap'
import { parseKeymap } from './buzzers/keymap'
import { parseBridgeUrl } from './dmx/bridgeOutput'
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
  /**
   * Adresse du pont Art-Net local (pilote `artnet-bridge`) : `ws://127.0.0.1:<port>` ou
   * `ws://localhost:<port>`. Absente = `DEFAULT_BRIDGE_URL`.
   */
  bridgeUrl?: string
  refreshHz: number
  fixtures: FixtureConfig[]
  customProfiles: FixtureProfile[]
  deskColors: Record<Desk, Rgb>
  /** Surcharges événement → scène (`null` = aucune scène pour cet événement). */
  bindings: Record<string, string | null>
  smoke: SmokeSafetyConfig
}

/**
 * Origine des buzzers : clavier (boîtier qui émule un clavier) ou carte d'entrées USB vue comme
 * une manette. `match` est un morceau du nom de la carte, pour la retrouver quand plusieurs
 * manettes sont branchées.
 */
export type BuzzerSource = { kind: 'keyboard' } | { kind: 'gamepad'; match?: string }

/** Configuration matérielle d'une salle, stockée dans `rooms.config` (JSONB). */
export type RoomHardwareConfig = {
  version: number
  buzzers: { keymap: BuzzerKeymap; source?: BuzzerSource }
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

function parseBuzzerSource(input: unknown): BuzzerSource | undefined {
  const raw = asRecord(input)
  if (raw.kind === 'keyboard') {
    return { kind: 'keyboard' }
  }
  if (raw.kind === 'gamepad') {
    return typeof raw.match === 'string' && raw.match.trim()
      ? { kind: 'gamepad', match: raw.match.trim() }
      : { kind: 'gamepad' }
  }
  return undefined
}

/** Filtre `match` de `createGamepadBuzzerInput` correspondant à la source enregistrée. */
export function gamepadMatcher(
  source: BuzzerSource | undefined
): ((id: string) => boolean) | undefined {
  if (source?.kind !== 'gamepad' || !source.match) {
    return undefined
  }
  const needle = source.match.toLowerCase()
  return (id) => id.toLowerCase().includes(needle)
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

  const source = parseBuzzerSource(buzzers.source)
  if (buzzers.source !== undefined && !source) {
    problems.push('Origine des buzzers inconnue (clavier utilisé)')
  }

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

  let bridgeUrl: string | null = null
  if (lighting.bridgeUrl !== undefined) {
    bridgeUrl = parseBridgeUrl(lighting.bridgeUrl)
    if (!bridgeUrl) {
      problems.push(
        `Adresse du pont Art-Net refusée : ${String(lighting.bridgeUrl)} ` +
          '(ws://127.0.0.1:<port> ou ws://localhost:<port> uniquement)'
      )
    }
  }

  const refreshHz =
    typeof lighting.refreshHz === 'number' && Number.isFinite(lighting.refreshHz)
      ? Math.min(DMX_REFRESH_LIMITS.max, Math.max(DMX_REFRESH_LIMITS.min, lighting.refreshHz))
      : DMX_REFRESH_LIMITS.default

  const config: RoomHardwareConfig = {
    version: ROOM_HARDWARE_CONFIG_VERSION,
    buzzers: { keymap, ...(source ? { source } : {}) },
    lighting: {
      driver,
      ...(bridgeUrl ? { bridgeUrl } : {}),
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
