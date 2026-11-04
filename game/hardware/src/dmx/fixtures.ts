import type { Desk, Rgbw } from '../types'
import { clampByte, DESKS, isDesk } from '../types'
import type { DmxDriver } from './output'
import { DMX_DRIVER_UNIVERSES } from './output'
import type { ChannelSpec, FixtureProfile } from './profiles'
import { CHANNEL_ROLES, findProfile, FIXTURE_KINDS } from './profiles'
import { DMX_CHANNELS, MAX_UNIVERSES } from './universe'

/** Position d'une lyre : pan et tilt sur 16 bits (0-65535). */
export type PanTilt = { pan: number; tilt: number }

/** Un appareil installé dans la salle. */
export type FixtureConfig = {
  id: string
  name: string
  profileId: string
  /** Adresse DMX de départ, 1 à 512 (dans l'univers de l'appareil). */
  address: number
  /** Univers DMX 0 à 15 ; absent = univers 0 (config d'avant les univers multiples, relue telle quelle). */
  universe?: number
  /** Appareil dédié à un pupitre (PAR au-dessus du pupitre 3…) : s'allume pour ce joueur. */
  desk?: Desk
  /** Lyres : position enregistrée pour chaque pupitre (« spot sur le pupitre qui a buzzé »). */
  deskPositions?: Partial<Record<Desk, PanTilt>>
  /** Lyres : position de repos. */
  homePosition?: PanTilt
}

/** Appareil prêt à être rendu : config + profil résolu. */
export type ResolvedFixture = FixtureConfig & { profile: FixtureProfile }

/** État d'un appareil lumière à un instant donné (calculé par les scènes). */
export type FixtureState = {
  color: Rgbw
  /** Intensité globale 0-1. */
  intensity: number
  /** Position pour les lyres ; `null` = position de repos. */
  position: PanTilt | null
  /** Vitesse du strobe 0-255 (0 = pas de strobe). */
  strobe: number
}

export const BLACK: Rgbw = { r: 0, g: 0, b: 0, w: 0 }

export function darkState(): FixtureState {
  return { color: { ...BLACK }, intensity: 0, position: null, strobe: 0 }
}

/** Univers d'un appareil (0 si non précisé). */
export const fixtureUniverse = (fixture: Pick<FixtureConfig, 'universe'>): number =>
  fixture.universe ?? 0

export function fixtureFootprint(fixture: ResolvedFixture): number {
  return fixture.profile.channels.length
}

export function isLightFixture(fixture: ResolvedFixture): boolean {
  return fixture.profile.kind !== 'smoke'
}

const clampWord = (value: number) => Math.min(65_535, Math.max(0, Math.round(value)))

function channelValue(
  spec: ChannelSpec,
  fixture: ResolvedFixture,
  state: FixtureState,
  smokeLevel: number
): number {
  const hasDimmer = fixture.profile.channels.some((channel) => channel.role === 'dimmer')
  // Sans canal gradateur, l'intensité est appliquée directement aux couleurs.
  const scale = hasDimmer ? 1 : state.intensity
  const position = state.position ?? fixture.homePosition ?? { pan: 32_768, tilt: 32_768 }

  switch (spec.role) {
    case 'dimmer':
      return clampByte(state.intensity * 255)
    case 'red':
      return clampByte(state.color.r * scale)
    case 'green':
      return clampByte(state.color.g * scale)
    case 'blue':
      return clampByte(state.color.b * scale)
    case 'white':
      return clampByte((state.color.w ?? 0) * scale)
    case 'strobe':
      return clampByte(state.strobe)
    case 'pan':
      return clampWord(position.pan) >> 8
    case 'panFine':
      return clampWord(position.pan) & 0xff
    case 'tilt':
      return clampWord(position.tilt) >> 8
    case 'tiltFine':
      return clampWord(position.tilt) & 0xff
    case 'smoke':
      if (smokeLevel <= 0) {
        return 0
      }
      return spec.binary ? 255 : clampByte(smokeLevel)
    case 'fixed':
      return clampByte(spec.value ?? 0)
    default:
      // amber, uv : non pilotés par les scènes génériques.
      return clampByte(spec.value ?? 0)
  }
}

/**
 * Construit un univers DMX complet (512 canaux) à partir de l'état des appareils placés sur cet
 * univers (0 par défaut). Le niveau de fumée vient **uniquement** du contrôleur de fumée sécurisé,
 * jamais directement des scènes.
 */
export function renderUniverse(
  fixtures: readonly ResolvedFixture[],
  states: ReadonlyMap<string, FixtureState>,
  smokeLevel: number,
  universeNumber = 0
): Uint8Array {
  const universe = new Uint8Array(DMX_CHANNELS)
  for (const fixture of fixtures) {
    if (fixtureUniverse(fixture) !== universeNumber) {
      continue
    }
    const state = states.get(fixture.id) ?? darkState()
    fixture.profile.channels.forEach((spec, offset) => {
      const index = fixture.address - 1 + offset
      if (index >= 0 && index < DMX_CHANNELS) {
        universe[index] = channelValue(spec, fixture, state, smokeLevel)
      }
    })
  }
  return universe
}

/** Numéros d'univers utilisés, triés ; le 0 y est toujours (il part même sans appareil). */
export function usedUniverses(fixtures: readonly Pick<FixtureConfig, 'universe'>[]): number[] {
  return [...new Set([0, ...fixtures.map(fixtureUniverse)])].sort((first, second) => first - second)
}

/** Tous les univers utilisés, rendus d'un coup (clé = numéro d'univers, 0 d'abord). */
export function renderUniverses(
  fixtures: readonly ResolvedFixture[],
  states: ReadonlyMap<string, FixtureState>,
  smokeLevel: number
): Map<number, Uint8Array> {
  return new Map(
    usedUniverses(fixtures).map((number) => [
      number,
      renderUniverse(fixtures, states, smokeLevel, number),
    ])
  )
}

/**
 * Appareils placés sur un univers que la sortie ne sait pas émettre (USB : univers 0 seulement).
 * Ils ne reçoivent aucun signal : à signaler à l'opérateur plutôt qu'à ignorer.
 */
export function unsupportedUniverseProblems(
  fixtures: readonly Pick<FixtureConfig, 'name' | 'universe'>[],
  driver: DmxDriver
): string[] {
  const count = DMX_DRIVER_UNIVERSES[driver]
  const range = count === 1 ? 'univers 0 seulement' : `univers 0 à ${count - 1}`
  return fixtures
    .filter((fixture) => fixtureUniverse(fixture) >= count)
    .map(
      (fixture) =>
        `Appareil « ${fixture.name} » : univers ${fixtureUniverse(fixture)} non pris en charge ` +
        `par la sortie ${driver} (${range})`
    )
}

export type RigParseResult = {
  fixtures: ResolvedFixture[]
  customProfiles: FixtureProfile[]
  problems: string[]
}

/** Clé d'un canal DMX : une même adresse sur deux univers = deux canaux distincts. */
const channelKey = (universe: number | undefined, channel: number) => `${universe ?? 0}:${channel}`

function parsePanTilt(input: unknown): PanTilt | null {
  const value = input as Partial<Record<'pan' | 'tilt', unknown>> | null
  if (
    !value ||
    typeof value.pan !== 'number' ||
    typeof value.tilt !== 'number' ||
    !Number.isFinite(value.pan) ||
    !Number.isFinite(value.tilt)
  ) {
    return null
  }
  return { pan: clampWord(value.pan), tilt: clampWord(value.tilt) }
}

function parseCustomProfiles(input: unknown, problems: string[]): FixtureProfile[] {
  if (!Array.isArray(input)) {
    return []
  }
  const profiles: FixtureProfile[] = []
  for (const raw of input as Record<string, unknown>[]) {
    const kind = raw?.kind
    const channels = raw?.channels
    if (
      typeof raw?.id !== 'string' ||
      !raw.id ||
      typeof raw.name !== 'string' ||
      !(FIXTURE_KINDS as readonly unknown[]).includes(kind) ||
      !Array.isArray(channels) ||
      channels.length === 0 ||
      channels.length > DMX_CHANNELS
    ) {
      problems.push(`Profil sur mesure invalide : ${String(raw?.id ?? '?')}`)
      continue
    }
    const specs: ChannelSpec[] = []
    let valid = true
    for (const channel of channels as Record<string, unknown>[]) {
      if (!(CHANNEL_ROLES as readonly unknown[]).includes(channel?.role)) {
        valid = false
        break
      }
      specs.push({
        role: channel.role as ChannelSpec['role'],
        ...(typeof channel.value === 'number' ? { value: clampByte(channel.value) } : {}),
        ...(channel.binary === true ? { binary: true } : {}),
      })
    }
    if (!valid) {
      problems.push(`Profil sur mesure ${raw.id} : rôle de canal inconnu`)
      continue
    }
    profiles.push({
      id: raw.id,
      name: raw.name,
      kind: kind as FixtureProfile['kind'],
      channels: specs,
    })
  }
  return profiles
}

/**
 * Relit la liste des appareils de la config de salle et vérifie la cohérence : profil connu,
 * adresse et univers valides, pas de dépassement de l'univers, pas de chevauchement d'adresses
 * (univers par univers).
 */
export function parseRig(fixturesInput: unknown, customProfilesInput: unknown): RigParseResult {
  const problems: string[] = []
  const customProfiles = parseCustomProfiles(customProfilesInput, problems)
  const fixtures: ResolvedFixture[] = []
  const usedChannels = new Map<string, string>()
  const ids = new Set<string>()

  if (fixturesInput !== undefined && !Array.isArray(fixturesInput)) {
    problems.push('lighting.fixtures doit être une liste')
  }
  const list = Array.isArray(fixturesInput) ? (fixturesInput as Record<string, unknown>[]) : []

  for (const raw of list) {
    const label = typeof raw?.name === 'string' && raw.name ? raw.name : String(raw?.id ?? '?')
    if (typeof raw?.id !== 'string' || !raw.id || ids.has(raw.id)) {
      problems.push(`Appareil « ${label} » : identifiant manquant ou en double`)
      continue
    }
    const profile =
      typeof raw.profileId === 'string' ? findProfile(raw.profileId, customProfiles) : null
    if (!profile) {
      problems.push(`Appareil « ${label} » : profil inconnu`)
      continue
    }
    const address = raw.address
    if (typeof address !== 'number' || !Number.isInteger(address) || address < 1) {
      problems.push(`Appareil « ${label} » : adresse DMX invalide`)
      continue
    }
    const universe = raw.universe
    if (
      universe !== undefined &&
      (typeof universe !== 'number' ||
        !Number.isInteger(universe) ||
        universe < 0 ||
        universe >= MAX_UNIVERSES)
    ) {
      problems.push(`Appareil « ${label} » : univers invalide (entier de 0 à ${MAX_UNIVERSES - 1})`)
      continue
    }
    const last = address + profile.channels.length - 1
    if (last > DMX_CHANNELS) {
      problems.push(`Appareil « ${label} » : canaux ${address}-${last} hors de l'univers (max 512)`)
      continue
    }
    // Les chevauchements se cherchent univers par univers : même adresse, autre univers = libre.
    const conflict = profile.channels
      .map((_channel, offset) => address + offset)
      .find((channel) => usedChannels.has(channelKey(universe, channel)))
    if (conflict !== undefined) {
      problems.push(
        `Appareil « ${label} » : canal ${conflict} déjà utilisé par « ${usedChannels.get(channelKey(universe, conflict))} »` +
          (universe ? ` (univers ${universe})` : '')
      )
      continue
    }

    const deskPositions: Partial<Record<Desk, PanTilt>> = {}
    const rawPositions = raw.deskPositions as Record<string, unknown> | undefined
    for (const desk of DESKS) {
      const position = parsePanTilt(rawPositions?.[String(desk)])
      if (position) {
        deskPositions[desk] = position
      }
    }
    const homePosition = parsePanTilt(raw.homePosition)

    ids.add(raw.id)
    profile.channels.forEach((_channel, offset) =>
      usedChannels.set(channelKey(universe, address + offset), label)
    )
    fixtures.push({
      id: raw.id,
      name: label,
      profileId: profile.id,
      address,
      ...(universe === undefined ? {} : { universe }),
      profile,
      ...(isDesk(raw.desk) ? { desk: raw.desk } : {}),
      ...(Object.keys(deskPositions).length > 0 ? { deskPositions } : {}),
      ...(homePosition ? { homePosition } : {}),
    })
  }

  return { fixtures, customProfiles, problems }
}
