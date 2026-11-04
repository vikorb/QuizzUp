import type { PortAddress } from './artnet.js'
import {
  DMX_CHANNELS,
  formatPortAddress,
  parsePortAddress,
  portAddressFromNumber,
  portAddressToNumber,
} from './artnet.js'

/**
 * Mappage déclaratif : une plage de canaux de l'univers **interne** (celui que l'écran de salle
 * envoie, canaux 1-512) recopiée dans un univers Art-Net de sortie, à partir d'un canal donné.
 *
 * Exemple : `128-148:0.0.2@1` = canaux internes 128 à 148 → univers Art-Net 0.0.2, canaux 1 à 21.
 */
export type ChannelMapping = {
  /** Premier canal interne (1-512). */
  from: number
  /** Dernier canal interne, inclus (≥ `from`). */
  to: number
  output: PortAddress
  /** Canal de départ dans l'univers de sortie (1-512). */
  start: number
}

/** Univers de sortie : adresse, et pour chaque plage, où lire et où écrire (index 0-511). */
export type OutputUniverse = {
  address: PortAddress
  key: number
  segments: { source: number; target: number; length: number }[]
}

export type OutputPlan = { outputs: OutputUniverse[] }

export class MappingError extends Error {}

/** Au-delà, une erreur de configuration est plus probable qu'une vraie salle. */
export const MAX_MAPPINGS = 64

const isChannel = (value: number) => Number.isInteger(value) && value >= 1 && value <= DMX_CHANNELS

const describe = (mapping: ChannelMapping) =>
  `${mapping.from}-${mapping.to}:${formatPortAddress(mapping.output)}@${mapping.start}`

/** Sans `--map` : l'univers interne est recopié tel quel dans un seul univers Art-Net. */
export function defaultMappings(output: PortAddress = portAddressFromNumber(0)): ChannelMapping[] {
  return [{ from: 1, to: DMX_CHANNELS, output, start: 1 }]
}

/**
 * Lit `DEBUT-FIN:NET.SUB.UNI@DEPART` (ou `CANAL:…` pour un seul canal). `@DEPART` est facultatif :
 * sans lui, la plage garde les mêmes numéros de canaux dans l'univers de sortie.
 */
export function parseMappingSpec(spec: string): ChannelMapping {
  const match = /^\s*(\d+)(?:-(\d+))?:([\d.]+)(?:@(\d+))?\s*$/.exec(spec)
  if (!match) {
    throw new MappingError(
      `Mappage illisible : « ${spec} » (attendu DEBUT-FIN:NET.SUB.UNI@DEPART, ex. 1-72:0.0.1@1)`
    )
  }
  const from = Number(match[1])
  const to = match[2] === undefined ? from : Number(match[2])
  const output = parsePortAddress(match[3]!)
  if (!output) {
    throw new MappingError(
      `Mappage « ${spec} » : univers Art-Net invalide « ${match[3]} » (net 0-127, sub 0-15, univers 0-15)`
    )
  }
  const start = match[4] === undefined ? from : Number(match[4])
  return { from, to, output, start }
}

/**
 * Lit un mappage du fichier de configuration : chaîne (`"1-72:0.0.1@1"`) ou objet
 * `{ "from": 1, "to": 72, "output": "0.0.1", "start": 1 }`.
 */
export function parseMappingEntry(entry: unknown): ChannelMapping {
  if (typeof entry === 'string') {
    return parseMappingSpec(entry)
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new MappingError(`Mappage invalide : ${JSON.stringify(entry)}`)
  }
  const raw = entry as Record<string, unknown>
  const output =
    typeof raw.output === 'string' || typeof raw.output === 'number'
      ? parsePortAddress(String(raw.output))
      : null
  if (typeof raw.from !== 'number' || !output) {
    throw new MappingError(
      `Mappage invalide : ${JSON.stringify(entry)} (attendu { from, to, output: "0.0.1", start })`
    )
  }
  const to = typeof raw.to === 'number' ? raw.to : raw.from
  const start = typeof raw.start === 'number' ? raw.start : raw.from
  return { from: raw.from, to, output, start }
}

/**
 * Vérifie les mappages et prépare le plan d'envoi : un univers de sortie par adresse Art-Net,
 * dans l'ordre de première apparition. Refuse les plages hors 1-512 et deux plages qui
 * écriraient sur les mêmes canaux d'un même univers de sortie (le résultat serait ambigu).
 * Une même plage interne peut en revanche être recopiée vers plusieurs sorties.
 */
export function buildOutputPlan(mappings: readonly ChannelMapping[]): OutputPlan {
  if (mappings.length === 0) {
    throw new MappingError('Aucun mappage : au moins une plage de canaux est nécessaire')
  }
  if (mappings.length > MAX_MAPPINGS) {
    throw new MappingError(`Trop de mappages (${mappings.length}, maximum ${MAX_MAPPINGS})`)
  }
  const outputs = new Map<number, OutputUniverse>()
  const used = new Map<number, ChannelMapping[]>()

  for (const mapping of mappings) {
    if (!isChannel(mapping.from) || !isChannel(mapping.to) || mapping.to < mapping.from) {
      throw new MappingError(
        `Mappage ${describe(mapping)} : plage interne invalide (canaux 1 à 512, début ≤ fin)`
      )
    }
    const length = mapping.to - mapping.from + 1
    const end = mapping.start + length - 1
    if (!isChannel(mapping.start) || end > DMX_CHANNELS) {
      throw new MappingError(
        `Mappage ${describe(mapping)} : la plage déborde de l'univers de sortie (canaux ${mapping.start} à ${end}, maximum 512)`
      )
    }
    const key = portAddressToNumber(mapping.output)
    const previous = used.get(key) ?? []
    const overlap = previous.find(
      (other) => mapping.start <= other.start + (other.to - other.from) && other.start <= end
    )
    if (overlap) {
      throw new MappingError(
        `Mappages ${describe(overlap)} et ${describe(mapping)} : ils écrivent sur les mêmes canaux de l'univers ${formatPortAddress(mapping.output)}`
      )
    }
    used.set(key, [...previous, mapping])

    const output = outputs.get(key) ?? { address: mapping.output, key, segments: [] }
    output.segments.push({ source: mapping.from - 1, target: mapping.start - 1, length })
    outputs.set(key, output)
  }

  return { outputs: [...outputs.values()] }
}

/** Univers de sortie calculés à partir de l'univers interne (canaux non mappés à zéro). */
export function renderOutputs(plan: OutputPlan, internal: Uint8Array): Uint8Array[] {
  return plan.outputs.map((output) => {
    const data = new Uint8Array(DMX_CHANNELS)
    for (const segment of output.segments) {
      data.set(internal.subarray(segment.source, segment.source + segment.length), segment.target)
    }
    return data
  })
}

/** Résumé lisible, affiché au démarrage du pont. */
export function describePlan(plan: OutputPlan): string[] {
  return plan.outputs.flatMap((output) =>
    output.segments.map(
      (segment) =>
        `canaux internes ${segment.source + 1}-${segment.source + segment.length} → ` +
        `Art-Net ${formatPortAddress(output.address)} canaux ${segment.target + 1}-${segment.target + segment.length}`
    )
  )
}
