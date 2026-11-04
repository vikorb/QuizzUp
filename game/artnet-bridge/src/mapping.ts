import type { PortAddress } from './artnet.js'
import {
  DMX_CHANNELS,
  formatPortAddress,
  parsePortAddress,
  PORT_ADDRESS_MAX,
  portAddressFromNumber,
  portAddressToNumber,
} from './artnet.js'
import { isInternalUniverse, MAX_INTERNAL_UNIVERSES } from './protocol.js'

/**
 * Mappage déclaratif : une plage de canaux d'un univers **interne** (celui que l'écran de salle
 * envoie, canaux 1-512) recopiée dans un univers Art-Net de sortie, à partir d'un canal donné.
 * L'écran de salle numérote ses univers de 0 à 15 ; sans préfixe, c'est l'univers interne 0.
 *
 * Exemples : `128-148:0.0.2@1` = canaux internes 128 à 148 → univers Art-Net 0.0.2, canaux 1 à 21 ;
 * `1/1-512:0.0.5` = univers interne 1, canaux 1 à 512 → univers Art-Net 0.0.5.
 */
export type ChannelMapping = {
  /** Univers interne source, 0-15 (0 si absent). */
  universe?: number
  /** Premier canal interne (1-512). */
  from: number
  /** Dernier canal interne, inclus (≥ `from`). */
  to: number
  output: PortAddress
  /** Canal de départ dans l'univers de sortie (1-512). */
  start: number
}

/**
 * Univers de sortie : adresse, univers interne qui l'alimente (un seul), et pour chaque plage,
 * où lire et où écrire (index 0-511).
 */
export type OutputUniverse = {
  address: PortAddress
  key: number
  /** Univers interne source (0-15). */
  source: number
  /** Créé par la recopie automatique (`fanOutBase`) : non listé un à un au démarrage. */
  auto?: boolean
  segments: { source: number; target: number; length: number }[]
}

export type OutputPlan = { outputs: OutputUniverse[] }

export class MappingError extends Error {}

/** Au-delà, une erreur de configuration est plus probable qu'une vraie salle. */
export const MAX_MAPPINGS = 64

const isChannel = (value: number) => Number.isInteger(value) && value >= 1 && value <= DMX_CHANNELS

const sourceOf = (mapping: ChannelMapping) => mapping.universe ?? 0

const describe = (mapping: ChannelMapping) =>
  `${sourceOf(mapping) === 0 ? '' : `${sourceOf(mapping)}/`}${mapping.from}-${mapping.to}:` +
  `${formatPortAddress(mapping.output)}@${mapping.start}`

/** Sans `--map` : l'univers interne est recopié tel quel dans un seul univers Art-Net. */
export function defaultMappings(output: PortAddress = portAddressFromNumber(0)): ChannelMapping[] {
  return [{ from: 1, to: DMX_CHANNELS, output, start: 1 }]
}

/**
 * Lit `[UNIVERS/]DEBUT-FIN:NET.SUB.UNI@DEPART` (ou `CANAL:…` pour un seul canal). `UNIVERS/` (0-15,
 * l'univers interne de l'écran de salle) et `@DEPART` sont facultatifs : sans eux, c'est l'univers
 * interne 0 et la plage garde les mêmes numéros de canaux dans l'univers de sortie.
 */
export function parseMappingSpec(spec: string): ChannelMapping {
  const match = /^\s*(?:(\d+)\/)?(\d+)(?:-(\d+))?:([\d.]+)(?:@(\d+))?\s*$/.exec(spec)
  if (!match) {
    throw new MappingError(
      `Mappage illisible : « ${spec} » (attendu [UNIVERS/]DEBUT-FIN:NET.SUB.UNI@DEPART, ex. 1-72:0.0.1@1)`
    )
  }
  const universe = match[1] === undefined ? undefined : Number(match[1])
  const from = Number(match[2])
  const to = match[3] === undefined ? from : Number(match[3])
  const output = parsePortAddress(match[4]!)
  if (!output) {
    throw new MappingError(
      `Mappage « ${spec} » : univers Art-Net invalide « ${match[4]} » (net 0-127, sub 0-15, univers 0-15)`
    )
  }
  const start = match[5] === undefined ? from : Number(match[5])
  return { ...(universe === undefined ? {} : { universe }), from, to, output, start }
}

/**
 * Lit un mappage du fichier de configuration : chaîne (`"1-72:0.0.1@1"`) ou objet
 * `{ "from": 1, "to": 72, "output": "0.0.1", "start": 1, "universe": 0 }` (`universe` : univers
 * interne source, 0 par défaut).
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
  const { universe } = raw
  if (universe !== undefined && (typeof universe !== 'number' || !isInternalUniverse(universe))) {
    throw new MappingError(
      `Mappage invalide : ${JSON.stringify(entry)} (« universe » : entier de 0 à ${MAX_INTERNAL_UNIVERSES - 1})`
    )
  }
  const to = typeof raw.to === 'number' ? raw.to : raw.from
  const start = typeof raw.start === 'number' ? raw.start : raw.from
  return {
    ...(universe === undefined ? {} : { universe }),
    from: raw.from,
    to,
    output,
    start,
  }
}

/**
 * Vérifie les mappages et prépare le plan d'envoi : un univers de sortie par adresse Art-Net,
 * dans l'ordre de première apparition. Refuse les plages hors 1-512, les univers internes hors 0-15,
 * deux plages qui écriraient sur les mêmes canaux d'un même univers de sortie (le résultat serait
 * ambigu) et un univers de sortie alimenté par deux univers internes. Une même plage interne peut
 * en revanche être recopiée vers plusieurs sorties.
 *
 * `fanOutBase` (cas sans `--map`) : les univers internes 1 à 15 sont recopiés tels quels vers
 * `fanOutBase + univers interne`, quand cette adresse n'est pas déjà prise.
 */
export function buildOutputPlan(
  mappings: readonly ChannelMapping[],
  fanOutBase?: PortAddress
): OutputPlan {
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
    if (
      !Number.isInteger(sourceOf(mapping)) ||
      sourceOf(mapping) < 0 ||
      sourceOf(mapping) >= MAX_INTERNAL_UNIVERSES
    ) {
      throw new MappingError(
        `Mappage ${describe(mapping)} : univers interne invalide (0 à ${MAX_INTERNAL_UNIVERSES - 1})`
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
    const feeder = outputs.get(key)
    if (feeder && feeder.source !== sourceOf(mapping)) {
      throw new MappingError(
        `Mappage ${describe(mapping)} : l'univers ${formatPortAddress(mapping.output)} est déjà alimenté par l'univers interne ${feeder.source}`
      )
    }
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

    const output = feeder ?? {
      address: mapping.output,
      key,
      source: sourceOf(mapping),
      segments: [],
    }
    output.segments.push({ source: mapping.from - 1, target: mapping.start - 1, length })
    outputs.set(key, output)
  }

  if (fanOutBase) {
    const base = portAddressToNumber(fanOutBase)
    for (let universe = 1; universe < MAX_INTERNAL_UNIVERSES; universe += 1) {
      const key = base + universe
      if (key > PORT_ADDRESS_MAX || outputs.has(key)) {
        continue
      }
      outputs.set(key, {
        address: portAddressFromNumber(key),
        key,
        source: universe,
        auto: true,
        segments: [{ source: 0, target: 0, length: DMX_CHANNELS }],
      })
    }
  }

  return { outputs: [...outputs.values()] }
}

/** Univers de sortie calculé à partir de son univers interne (canaux non mappés à zéro). */
export function renderOutput(output: OutputUniverse, internal: Uint8Array): Uint8Array {
  const data = new Uint8Array(DMX_CHANNELS)
  for (const segment of output.segments) {
    data.set(internal.subarray(segment.source, segment.source + segment.length), segment.target)
  }
  return data
}

/** Univers de sortie alimentés par l'univers interne `universe` (0 par défaut), dans l'ordre du plan. */
export function renderOutputs(plan: OutputPlan, internal: Uint8Array, universe = 0): Uint8Array[] {
  return plan.outputs
    .filter((output) => output.source === universe)
    .map((output) => renderOutput(output, internal))
}

/** Résumé lisible, affiché au démarrage du pont. */
export function describePlan(plan: OutputPlan): string[] {
  const lines = plan.outputs
    .filter((output) => !output.auto)
    .flatMap((output) =>
      output.segments.map(
        (segment) =>
          `${output.source === 0 ? '' : `univers interne ${output.source} : `}canaux internes ` +
          `${segment.source + 1}-${segment.source + segment.length} → ` +
          `Art-Net ${formatPortAddress(output.address)} canaux ${segment.target + 1}-${segment.target + segment.length}`
      )
    )
  const auto = plan.outputs.filter((output) => output.auto)
  if (auto.length > 0) {
    lines.push(
      `univers internes 1-${auto.at(-1)!.source} → Art-Net ${formatPortAddress(auto[0]!.address)} ` +
        `à ${formatPortAddress(auto.at(-1)!.address)} (recopie, selon les univers reçus)`
    )
  }
  return lines
}
