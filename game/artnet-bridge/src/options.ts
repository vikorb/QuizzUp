import { isIPv4 } from 'node:net'
import { parseArgs } from 'node:util'

import type { PortAddress } from './artnet.js'
import { ARTNET_PORT, parsePortAddress } from './artnet.js'
import { BLACKOUT_LIMITS, BLACKOUT_MS, SILENCE_LIMITS, SILENCE_TIMEOUT_MS } from './bridge.js'
import type { ChannelMapping, OutputPlan } from './mapping.js'
import { buildOutputPlan, defaultMappings, parseMappingEntry, parseMappingSpec } from './mapping.js'
import { normalizeOrigin } from './server.js'

export const DEFAULT_PORT = 7654

/** Variable d'environnement : origines autorisées, séparées par des virgules. */
export const ORIGINS_ENV = 'QUIZZUP_BRIDGE_ORIGINS'

export type BridgeOptions = {
  target: string
  port: number
  artnetPort: number
  bind?: string
  origins: string[]
  mappings: ChannelMapping[]
  plan: OutputPlan
  silenceTimeoutMs: number
  blackoutMs: number
}

export type CliCommand =
  { kind: 'help' } | { kind: 'version' } | { kind: 'run'; options: BridgeOptions }

/** Erreur de configuration : affichée telle quelle, suivie d'un renvoi vers `--help`. */
export class OptionsError extends Error {}

export const HELP_TEXT = `quizzup-artnet-bridge — pont local QuizzUp : écran de salle (navigateur) → Art-Net (réseau)

Utilisation :
  quizzup-artnet-bridge --target <ip> --origin <url> [options]

Options :
  --target <ip>        IP du nœud Art-Net (ex. 192.168.1.50) ou de diffusion (ex. 192.168.1.255)
  --origin <url>       origine de l'écran de salle autorisée à se connecter
                       (ex. https://salle.quizzup.fr) ; répétable, ou séparée par des virgules ;
                       à défaut : variable d'environnement ${ORIGINS_ENV}
  --universe <u>       univers Art-Net de sortie quand il n'y a pas de --map :
                       NET.SUB.UNI (ex. 0.0.1) ou adresse 15 bits (ex. 1) ; 0 par défaut.
                       Les univers 1 à 15 de l'écran de salle sortent sur <u> + 1, <u> + 2…
  --map <plage>        mappage [UNIVERS/]DEBUT-FIN:NET.SUB.UNI@DEPART, répétable
                       ex. --map 1-72:0.0.1@1 --map 128-148:0.0.2@1 --map 1/1-512:0.0.5
                       (canaux internes 1 à 72 → univers 0.0.1 à partir du canal 1, etc. ;
                       UNIVERS = univers de l'écran de salle 0-15, 0 par défaut)
  --config <fichier>   fichier JSON (mêmes réglages ; les options de la ligne de commande
                       sont prioritaires)
  --port <n>           port d'écoute WebSocket sur 127.0.0.1 (${DEFAULT_PORT} par défaut)
  --bind <ip>          IP locale d'où partent les paquets (PC à plusieurs cartes réseau)
  --artnet-port <n>    port UDP Art-Net (${ARTNET_PORT} par défaut, à ne changer que pour un test)
  --timeout <ms>       silence du navigateur avant le noir de sécurité (${SILENCE_TIMEOUT_MS} par défaut)
  --blackout <ms>      durée des trames à zéro après une coupure (${BLACKOUT_MS} par défaut)
  -h, --help           affiche cette aide
  -v, --version        affiche la version

Sécurité : le pont n'écoute que sur 127.0.0.1, n'accepte qu'un écran de salle à la fois et
uniquement depuis les origines autorisées. Si le navigateur se tait plus de ${SILENCE_TIMEOUT_MS} ms ou se
déconnecte, le pont envoie du noir (fumée coupée) sur tous les univers.

Exemple :
  quizzup-artnet-bridge --target 192.168.1.50 --universe 0 --port ${DEFAULT_PORT} --origin https://salle.quizzup.fr`

const CLI_OPTIONS = {
  target: { type: 'string' },
  universe: { type: 'string' },
  map: { type: 'string', multiple: true },
  origin: { type: 'string', multiple: true },
  config: { type: 'string' },
  port: { type: 'string' },
  bind: { type: 'string' },
  'artnet-port': { type: 'string' },
  timeout: { type: 'string' },
  blackout: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const

const readArgs = (args: string[]) =>
  parseArgs({ args, options: CLI_OPTIONS, strict: true, allowPositionals: false })

type RawConfig = Record<string, unknown>

const KNOWN_CONFIG_KEYS = new Set([
  'target',
  'universe',
  'maps',
  'origins',
  'port',
  'bind',
  'artnetPort',
  'timeoutMs',
  'blackoutMs',
])

function parseIntegerOption(name: string, value: unknown, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number(String(value).trim())
  if (String(value).trim() === '' || !Number.isInteger(number) || number < min || number > max) {
    throw new OptionsError(
      `${name} : « ${String(value)} » n'est pas un entier entre ${min} et ${max}`
    )
  }
  return number
}

function parseIp(name: string, value: unknown): string {
  if (typeof value !== 'string' || !isIPv4(value.trim())) {
    throw new OptionsError(`${name} : « ${String(value)} » n'est pas une adresse IPv4`)
  }
  return value.trim()
}

function parseOrigins(values: readonly string[]): string[] {
  const origins = new Set<string>()
  for (const value of values.flatMap((entry) => entry.split(','))) {
    if (value.trim() === '') {
      continue
    }
    const origin = normalizeOrigin(value)
    if (!origin) {
      throw new OptionsError(`--origin : « ${value.trim()} » n'est pas une origine http(s) valide`)
    }
    origins.add(origin)
  }
  return [...origins]
}

function parseUniverse(value: unknown): PortAddress {
  const address = parsePortAddress(String(value))
  if (!address) {
    throw new OptionsError(
      `--universe : « ${String(value)} » invalide (NET.SUB.UNI avec net 0-127, sub 0-15, univers 0-15, ou 0-32767)`
    )
  }
  return address
}

function asStringList(name: string, value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value
  }
  throw new OptionsError(`${name} : liste de chaînes attendue`)
}

/** Lit le fichier JSON passé à `--config`. */
export function parseConfigFile(text: string, path: string): RawConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new OptionsError(`--config ${path} : JSON invalide (${(error as Error).message})`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OptionsError(`--config ${path} : un objet JSON est attendu`)
  }
  const unknown = Object.keys(parsed).filter((key) => !KNOWN_CONFIG_KEYS.has(key))
  if (unknown.length > 0) {
    throw new OptionsError(
      `--config ${path} : clé(s) inconnue(s) ${unknown.join(', ')} (connues : ${[...KNOWN_CONFIG_KEYS].join(', ')})`
    )
  }
  return parsed as RawConfig
}

export type ParseDeps = {
  env?: Record<string, string | undefined>
  readFile?: (path: string) => string
}

/** Analyse la ligne de commande (sans `node` ni le script), le fichier `--config` et l'environnement. */
export function parseCliArgs(argv: readonly string[], deps: ParseDeps = {}): CliCommand {
  const env = deps.env ?? {}
  let parsed: ReturnType<typeof readArgs>
  try {
    parsed = readArgs([...argv])
  } catch (error) {
    throw new OptionsError(translateParseError((error as Error).message))
  }
  const values = parsed.values
  if (values.help) {
    return { kind: 'help' }
  }
  if (values.version) {
    return { kind: 'version' }
  }

  let file: RawConfig = {}
  if (values.config !== undefined) {
    if (!deps.readFile) {
      throw new OptionsError('--config : lecture de fichier indisponible')
    }
    let text: string
    try {
      text = deps.readFile(values.config)
    } catch (error) {
      throw new OptionsError(
        `--config ${values.config} : lecture impossible (${(error as Error).message})`
      )
    }
    file = parseConfigFile(text, values.config)
  }

  const targetValue = values.target ?? file.target
  if (targetValue === undefined) {
    throw new OptionsError('--target est obligatoire : IP du nœud Art-Net (ex. 192.168.1.50)')
  }
  const target = parseIp('--target', targetValue)

  const originValues =
    values.origin && values.origin.length > 0
      ? values.origin
      : env[ORIGINS_ENV]
        ? [env[ORIGINS_ENV]]
        : file.origins !== undefined
          ? asStringList('origins', file.origins)
          : []
  const origins = parseOrigins(originValues)
  if (origins.length === 0) {
    throw new OptionsError(
      `--origin est obligatoire : adresse de l'écran de salle (ex. https://salle.quizzup.fr), ou ${ORIGINS_ENV}`
    )
  }

  const mapValues =
    values.map && values.map.length > 0
      ? values.map
      : file.maps !== undefined
        ? file.maps
        : undefined
  const universeValue = values.universe ?? file.universe
  let mappings: ChannelMapping[]
  try {
    if (mapValues !== undefined) {
      if (values.universe !== undefined) {
        throw new OptionsError(
          '--universe et --map sont incompatibles : avec --map, chaque plage indique son univers'
        )
      }
      if (!Array.isArray(mapValues)) {
        throw new OptionsError('maps : liste de mappages attendue')
      }
      mappings = mapValues.map((entry: unknown) =>
        typeof entry === 'string' ? parseMappingSpec(entry) : parseMappingEntry(entry)
      )
    } else {
      mappings = defaultMappings(
        universeValue === undefined ? undefined : parseUniverse(universeValue)
      )
    }
    // Sans --map, les univers internes 1 à 15 suivent l'univers de sortie (--universe + n).
    const plan = buildOutputPlan(
      mappings,
      mapValues === undefined ? mappings[0]!.output : undefined
    )

    return {
      kind: 'run',
      options: {
        target,
        port: parseIntegerOption('--port', values.port ?? file.port ?? DEFAULT_PORT, 1, 65_535),
        artnetPort: parseIntegerOption(
          '--artnet-port',
          values['artnet-port'] ?? file.artnetPort ?? ARTNET_PORT,
          1,
          65_535
        ),
        ...((values.bind ?? file.bind)
          ? { bind: parseIp('--bind', values.bind ?? file.bind) }
          : {}),
        origins,
        mappings,
        plan,
        silenceTimeoutMs: parseIntegerOption(
          '--timeout',
          values.timeout ?? file.timeoutMs ?? SILENCE_TIMEOUT_MS,
          SILENCE_LIMITS.min,
          SILENCE_LIMITS.max
        ),
        blackoutMs: parseIntegerOption(
          '--blackout',
          values.blackout ?? file.blackoutMs ?? BLACKOUT_MS,
          BLACKOUT_LIMITS.min,
          BLACKOUT_LIMITS.max
        ),
      },
    }
  } catch (error) {
    if (error instanceof OptionsError) {
      throw error
    }
    throw new OptionsError((error as Error).message)
  }
}

function translateParseError(message: string): string {
  const unknown = /Unknown option '([^']+)'/.exec(message)
  if (unknown) {
    return `Option inconnue : ${unknown[1]}`
  }
  const missing = /Option '([^']+?)(?: <value>)?' argument missing/.exec(message)
  if (missing) {
    return `Valeur manquante pour ${missing[1]!.replace(/^-\w, /, '')}`
  }
  const positional = /Unexpected argument '([^']+)'/.exec(message)
  if (positional) {
    return `Argument inattendu : ${positional[1]} (les options s'écrivent --nom valeur)`
  }
  return `Ligne de commande invalide : ${message}`
}
