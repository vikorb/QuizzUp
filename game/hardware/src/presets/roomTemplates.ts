import type { ArtnetNode } from '../dmx/bridgeOutput'
import type { FixtureConfig } from '../dmx/fixtures'
import type { FixtureProfile } from '../dmx/profiles'
import { findProfile } from '../dmx/profiles'
import { DMX_CHANNELS, MAX_UNIVERSES } from '../dmx/universe'
import type { Desk } from '../types'
import { createSixDeskRoomRig } from './sixDeskRoom'

/**
 * Appareil d'un modèle. Sans `address`, elle est calculée à la création (consécutive, sans trou, sur
 * l'univers 0). Avec `address` et `universe`, ils sont gardés tels quels : c'est le cas d'une salle
 * de référence dont le câblage est connu.
 */
export type RoomTemplateFixture = {
  id: string
  name: string
  profileId: string
  desk?: Desk
  address?: number
  universe?: number
}

/**
 * Modèle de salle proposé par l'assistant : une liste d'appareils et leurs profils. Adresse et
 * univers dépendent du câblage : calculés, sauf pour un appareil qui porte les siens. L'opérateur
 * confirme ensuite appareil par appareil. Un modèle n'ajoute ni n'active jamais la fumée : elle se
 * déclare à part, avec ses vérifications.
 */
export type RoomTemplate = {
  id: string
  name: string
  desksCount: number
  fixtures: readonly RoomTemplateFixture[]
  /** Profils propres au modèle ; les autres viennent de `GENERIC_PROFILES`. */
  customProfiles: readonly FixtureProfile[]
}

const pupitres = (count: number, profileId: string, label: string): RoomTemplateFixture[] =>
  Array.from({ length: count }, (_item, index) => {
    const desk = (index + 1) as Desk
    return { id: `par-pupitre-${desk}`, name: `${label} pupitre ${desk}`, profileId, desk }
  })

const heads = (count: number): RoomTemplateFixture[] =>
  Array.from({ length: count }, (_item, index) => ({
    id: `lyre-${index + 1}`,
    name: `Lyre ${index + 1}`,
    profileId: 'moving-head-8',
  }))

// Le modèle « 6 pupitres » décrit la salle réelle de référence, un nœud Art-Net à deux sorties : mêmes
// appareils, mêmes profils et mêmes adresses que `createSixDeskRoomRig`, mais les rubans LED passent
// sur l'univers interne 1 (sortie B du nœud, décodeur à l'adresse 128) et les huit lyres restent sur
// l'univers interne 0 (sortie A). `createSixDeskRoomRig` met tout sur un seul univers (USB DMX).
const sixDesk = createSixDeskRoomRig()

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  {
    id: 'six-desks-eight-heads',
    name: '6 pupitres, 8 lyres et rubans LED',
    desksCount: 6,
    fixtures: sixDesk.fixtures.map(({ id, name, profileId, desk, address }) => ({
      id,
      name,
      profileId,
      address,
      universe: id.startsWith('led-') ? 1 : 0,
      ...(desk === undefined ? {} : { desk }),
    })),
    customProfiles: sixDesk.customProfiles,
  },
  {
    id: 'four-desks-four-par-rgbw',
    name: '4 pupitres, 4 PAR RVBW',
    desksCount: 4,
    fixtures: pupitres(4, 'par-rgbw', 'PAR'),
    customProfiles: [],
  },
  {
    id: 'four-desks-four-par-two-heads',
    name: '4 pupitres, 4 PAR + 2 lyres',
    desksCount: 4,
    fixtures: [...pupitres(4, 'par-rgbw', 'PAR'), ...heads(2)],
    customProfiles: [],
  },
  {
    id: 'six-desks-six-par-two-heads',
    name: '6 pupitres, 6 PAR RVB + 2 lyres',
    desksCount: 6,
    fixtures: [...pupitres(6, 'par-rgb', 'PAR'), ...heads(2)],
    customProfiles: [],
  },
]

export type RoomTemplateRig = { fixtures: FixtureConfig[]; customProfiles: FixtureProfile[] }

export type RoomTemplateResult =
  | ({ ok: true } & RoomTemplateRig)
  | {
      ok: false
      reason: 'invalid_start_address' | 'does_not_fit' | 'unknown_profile' | 'smoke_forbidden'
    }

/**
 * Appareils d'un modèle. Ceux qui n'ont pas d'adresse propre sont sur l'univers 0, aux adresses
 * consécutives à partir de `startAddress` (1 par défaut) : aucun chevauchement entre eux ; les autres
 * gardent leur `address` et leur `universe`, `startAddress` ne les décale pas. Refus si l'adresse de
 * départ n'est pas un entier de 1 à 512 ou si les appareils à adresse calculée ne tiennent pas dans
 * l'univers. Un appareil de fumée est refusé, quel que soit le modèle.
 */
export function createRigFromTemplate(
  template: RoomTemplate,
  options: { startAddress?: number } = {}
): RoomTemplateResult {
  const startAddress = options.startAddress ?? 1
  if (!Number.isInteger(startAddress) || startAddress < 1 || startAddress > DMX_CHANNELS) {
    return { ok: false, reason: 'invalid_start_address' }
  }
  const customProfiles = template.customProfiles.map((profile) => structuredClone(profile))
  const fixtures: FixtureConfig[] = []
  let address = startAddress
  for (const entry of template.fixtures) {
    const profile = findProfile(entry.profileId, customProfiles)
    if (!profile) {
      return { ok: false, reason: 'unknown_profile' }
    }
    if (profile.kind === 'smoke' || profile.channels.some((channel) => channel.role === 'smoke')) {
      return { ok: false, reason: 'smoke_forbidden' }
    }
    if (entry.address === undefined) {
      fixtures.push({ ...entry, address })
      address += profile.channels.length
    } else {
      fixtures.push({ ...entry, address: entry.address })
    }
  }
  if (address - 1 > DMX_CHANNELS) {
    return { ok: false, reason: 'does_not_fit' }
  }
  return { ok: true, fixtures, customProfiles }
}

/** Univers à placer sur les appareils : seuls `id` et `universe` comptent. */
export type UniverseAssignment = { fixtureId: string; universe: number }

const ARTNET_OUTPUT = /^0\.0\.(\d{1,2})$/

/**
 * Univers internes que le pont Art-Net envoie par défaut vers les sorties d'un nœud : l'univers
 * interne n part vers `--universe` + n (0 par défaut), donc une sortie `0.0.x` avec x de 0 à 15
 * reçoit l'univers interne x. Les autres sorties (autre net ou sub-net, hors 0..15) ne sont jamais
 * proposées : il faudrait un `--map` du pont. Croissant, sans doublon.
 */
function reachableUniverses(node: Pick<ArtnetNode, 'universes'>): number[] {
  const found = new Set<number>()
  for (const output of node.universes ?? []) {
    const match = ARTNET_OUTPUT.exec(output)
    const universe = match ? Number(match[1]) : -1
    if (universe >= 0 && universe < MAX_UNIVERSES) {
      found.add(universe)
    }
  }
  return [...found].sort((first, second) => first - second)
}

/**
 * Propose les univers des appareils d'après les sorties que le nœud annonce (ArtPoll). Fonction
 * pure : elle ne change rien, l'opérateur confirme avant d'appliquer (« la détection propose »).
 *
 * Les appareils gardent leur regroupement actuel : le plus petit univers qu'ils utilisent passe sur
 * la plus petite sortie, le suivant sur la suivante, et ainsi de suite. `null` quand il n'y a rien
 * à proposer : le nœud n'annonce aucune sortie (ou aucune accessible), il y a moins de sorties que
 * d'univers utilisés, ou les appareils sont déjà placés ainsi. Sinon, seuls les appareils qui
 * changent d'univers sont listés.
 */
export function proposeUniverses(
  node: Pick<ArtnetNode, 'universes'>,
  fixtures: readonly Pick<FixtureConfig, 'id' | 'universe'>[]
): UniverseAssignment[] | null {
  const outputs = reachableUniverses(node)
  const used = [...new Set(fixtures.map((fixture) => fixture.universe ?? 0))].sort(
    (first, second) => first - second
  )
  if (outputs.length === 0 || used.length === 0 || used.length > outputs.length) {
    return null
  }
  const target = new Map(used.map((universe, index) => [universe, outputs[index] as number]))
  const changes = fixtures
    .map((fixture) => ({
      fixtureId: fixture.id,
      universe: target.get(fixture.universe ?? 0) as number,
      current: fixture.universe ?? 0,
    }))
    .filter((change) => change.universe !== change.current)
    .map(({ fixtureId, universe }) => ({ fixtureId, universe }))
  return changes.length > 0 ? changes : null
}
