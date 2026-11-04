import type { BuzzerKeymap } from './buzzers/keymap'
import { parseKeymap } from './buzzers/keymap'
import { parseBridgeUrl } from './dmx/bridgeOutput'
import type { FixtureConfig, ResolvedFixture } from './dmx/fixtures'
import { parseRig, unsupportedUniverseProblems } from './dmx/fixtures'
import type { DmxDriver } from './dmx/output'
import { DMX_DRIVERS } from './dmx/output'
import type { FixtureProfile } from './dmx/profiles'
import { DEFAULT_DESK_COLORS } from './lighting/scenes'
import type { SmokeSafetyConfig } from './lighting/smoke'
import { DEFAULT_SMOKE_SAFETY, normalizeSmokeSafety } from './lighting/smoke'
import type { Desk, Rgb } from './types'
import { clampByte, clampDeskCount, DEFAULT_DESK_COUNT, DESKS } from './types'

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
  /**
   * Nombre de pupitres de la salle (1 à 6, 4 par défaut). Lu aussi par le backoffice, qui ne
   * propose que ces pupitres au lancement d'une partie : le champ reste à la racine de la config.
   */
  desksCount: number
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
    desksCount: DEFAULT_DESK_COUNT,
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

/**
 * Change le nombre de pupitres de la salle, sans rien effacer : les buzzers appris et l'affectation
 * des lumières des pupitres au-delà restent « en réserve » dans la config. Ils sont ignorés à
 * l'usage (`activeKeymap`, `activeLightingConfig`) et reviennent tels quels si on remonte le nombre.
 */
export function withDesksCount(config: RoomHardwareConfig, count: number): RoomHardwareConfig {
  return { ...config, desksCount: clampDeskCount(count) }
}

/** Buzzers des pupitres de la salle : ceux des pupitres au-delà de `desksCount` (réserve) sont ignorés. */
export function activeKeymap(config: RoomHardwareConfig): BuzzerKeymap {
  return Object.fromEntries(
    Object.entries(config.buzzers.keymap).filter(([, slot]) => slot.desk <= config.desksCount)
  )
}

/**
 * Enregistre les buzzers appris sur les pupitres de la salle. La réserve (pupitres retirés) est
 * gardée, sauf une touche réapprise sur un pupitre actif : son doublon de réserve disparaît, sinon
 * deux pupitres se disputeraient la touche au remontage du nombre de pupitres.
 */
export function withLearnedKeymap(
  config: RoomHardwareConfig,
  learned: BuzzerKeymap
): RoomHardwareConfig {
  const reserve = Object.entries(config.buzzers.keymap).filter(
    ([code, slot]) => slot.desk > config.desksCount && !Object.hasOwn(learned, code)
  )
  return {
    ...config,
    buzzers: { ...config.buzzers, keymap: { ...Object.fromEntries(reserve), ...learned } },
  }
}

/**
 * Config lumières vue par le contrôleur : un appareil affecté à un pupitre retiré est détaché de ce
 * pupitre (`desk` et positions de lyre au-delà ignorés), sans toucher à la config enregistrée.
 */
export function activeLightingConfig(config: RoomHardwareConfig): LightingConfig {
  const { desksCount } = config
  const fixtures = config.lighting.fixtures.map((fixture) => {
    const { desk, deskPositions, ...rest } = fixture
    const kept = Object.fromEntries(
      Object.entries(deskPositions ?? {}).filter(([key]) => Number(key) <= desksCount)
    ) as FixtureConfig['deskPositions']
    return {
      ...rest,
      ...(desk !== undefined && desk <= desksCount ? { desk } : {}),
      ...(kept && Object.keys(kept).length > 0 ? { deskPositions: kept } : {}),
    }
  })
  return { ...config.lighting, fixtures }
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

  let desksCount = clampDeskCount(raw.desksCount)
  if (raw.desksCount === undefined) {
    // Salle équipée avant le réglage du nombre de pupitres : sans le champ, on élargit au plus
    // haut pupitre déjà appris ou équipé (jamais quand le champ est présent, même à 4).
    const highestDesk = Math.max(
      ...Object.values(keymap).map((slot) => slot.desk),
      ...rig.fixtures.map((fixture) => fixture.desk ?? 0)
    )
    desksCount = clampDeskCount(Math.max(desksCount, highestDesk))
  } else if (raw.desksCount !== desksCount) {
    problems.push(
      `Nombre de pupitres invalide : ${String(raw.desksCount)} (${desksCount} utilisé, de 1 à ${DESKS.length})`
    )
  }

  let driver: DmxDriver = 'simulation'
  if (lighting.driver !== undefined) {
    if ((DMX_DRIVERS as readonly unknown[]).includes(lighting.driver)) {
      driver = lighting.driver as DmxDriver
    } else {
      problems.push(`Sortie DMX inconnue : ${String(lighting.driver)} (simulation utilisée)`)
    }
  }

  problems.push(...unsupportedUniverseProblems(rig.fixtures, driver))

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
    desksCount,
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
