import type { Desk, Rgbw } from '../types'
import { clampByte, DESKS, isDesk } from '../types'
import type { ChannelSpec, FixtureProfile } from './profiles'
import { CHANNEL_ROLES, findProfile, FIXTURE_KINDS } from './profiles'
import { DMX_CHANNELS } from './universe'

/** Position d'une lyre : pan et tilt sur 16 bits (0-65535). */
export type PanTilt = { pan: number; tilt: number }

/** Un appareil installé dans la salle. */
export type FixtureConfig = {
  id: string
  name: string
  profileId: string
  /** Adresse DMX de départ, 1 à 512. */
  address: number
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
 * Construit l'univers DMX complet à partir de l'état des appareils. Le niveau de fumée vient
 * **uniquement** du contrôleur de fumée sécurisé, jamais directement des scènes.
 */
export function renderUniverse(
  fixtures: readonly ResolvedFixture[],
  states: ReadonlyMap<string, FixtureState>,
  smokeLevel: number
): Uint8Array {
  const universe = new Uint8Array(DMX_CHANNELS)
  for (const fixture of fixtures) {
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

export type RigParseResult = {
  fixtures: ResolvedFixture[]
  customProfiles: FixtureProfile[]
  problems: string[]
}

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
 * adresse valide, pas de dépassement de l'univers, pas de chevauchement d'adresses.
 */
export function parseRig(fixturesInput: unknown, customProfilesInput: unknown): RigParseResult {
  const problems: string[] = []
  const customProfiles = parseCustomProfiles(customProfilesInput, problems)
  const fixtures: ResolvedFixture[] = []
  const usedChannels = new Map<number, string>()
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
    const last = address + profile.channels.length - 1
    if (last > DMX_CHANNELS) {
      problems.push(`Appareil « ${label} » : canaux ${address}-${last} hors de l'univers (max 512)`)
      continue
    }
    const conflict = profile.channels
      .map((_channel, offset) => address + offset)
      .find((channel) => usedChannels.has(channel))
    if (conflict !== undefined) {
      problems.push(
        `Appareil « ${label} » : canal ${conflict} déjà utilisé par « ${usedChannels.get(conflict)} »`
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
    profile.channels.forEach((_channel, offset) => usedChannels.set(address + offset, label))
    fixtures.push({
      id: raw.id,
      name: label,
      profileId: profile.id,
      address,
      profile,
      ...(isDesk(raw.desk) ? { desk: raw.desk } : {}),
      ...(Object.keys(deskPositions).length > 0 ? { deskPositions } : {}),
      ...(homePosition ? { homePosition } : {}),
    })
  }

  return { fixtures, customProfiles, problems }
}
