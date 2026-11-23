import { BlockList, isIP } from 'node:net'

import { ipv6Groups } from '../utils/ipv6'

export type ConsoleNetwork = {
  /** Plages autorisées, telles que lues dans `CONSOLE_ALLOWED_CIDRS` (vide : console fermée). */
  ranges: string[]
  /** `true` si cette adresse (`req.ip`) fait partie des plages autorisées. */
  allows: (ip: string) => boolean
}

/**
 * `CONSOLE_ALLOWED_CIDRS` : adresses ou plages CIDR (IPv4 et IPv6) d'où le compte superadmin peut
 * se connecter et appeler l'API. Séparées par des espaces (format de Caddy, qui lit la même
 * variable) ; les virgules sont acceptées aussi. Variable absente ou vide : aucune adresse n'est
 * autorisée, la console est fermée. Une entrée invalide lève une erreur (démarrage refusé).
 *
 * On ne décide jamais d'après `X-Forwarded-For` : l'appelant passe `req.ip`, que Fastify calcule
 * avec `TRUST_PROXY` (cf. utils/trustProxy.ts).
 */
export function createConsoleNetwork(value: string | undefined): ConsoleNetwork {
  const ranges = (value ?? '').split(/[\s,]+/).filter(Boolean)
  // Deux listes : une plage IPv6 n'autorise jamais une adresse IPv4 (`net.BlockList` laisserait
  // `::/0` couvrir les IPv4 mappées, alors que Caddy, qui lit la même variable, ne le fait pas).
  const ipv4List = new BlockList()
  const ipv6List = new BlockList()

  for (const range of ranges) {
    const [address, prefix, ...rest] = range.split('/')
    const version = isIP(address)
    const maxPrefix = version === 4 ? 32 : 128

    if (
      version === 0 ||
      rest.length > 0 ||
      address.includes('%') ||
      (prefix !== undefined && (!/^\d{1,3}$/.test(prefix) || Number(prefix) > maxPrefix))
    ) {
      throw new Error(
        `CONSOLE_ALLOWED_CIDRS invalide (« ${range} »). ` +
          'Attendu : adresses IP ou plages CIDR séparées par des espaces (ex. 192.0.2.0/24 2001:db8::/32).'
      )
    }

    const length = prefix === undefined ? maxPrefix : Number(prefix)

    if (version === 4) ipv4List.addSubnet(address, length, 'ipv4')
    else ipv6List.addSubnet(address, length, 'ipv6')
  }

  return {
    ranges,
    allows: (ip) => {
      // Une adresse IPv4 mappée redevient IPv4 : elle n'est comparée qu'aux plages IPv4.
      const address = unmapIpv4(ip.split('%')[0])
      const version = isIP(address)

      if (version === 4) return ipv4List.check(address, 'ipv4')

      return version === 6 && ipv6List.check(address, 'ipv6')
    },
  }
}

type ParsedRange = { version: 4 | 6; bits: bigint; prefix: number }

function parseRange(entry: string): ParsedRange {
  const [address, prefix] = entry.split('/')
  const version = isIP(address) === 4 ? 4 : 6
  const bits =
    version === 4
      ? address.split('.').reduce((acc, octet) => (acc << 8n) | BigInt(octet), 0n)
      : ipv6Groups(address).reduce((acc, group) => (acc << 16n) | BigInt(group), 0n)

  return {
    version,
    bits,
    prefix: prefix === undefined ? (version === 4 ? 32 : 128) : Number(prefix),
  }
}

/** Deux plages de même famille se recoupent quand elles ont le même début sur le plus court des préfixes. */
function overlaps(a: ParsedRange, b: ParsedRange): boolean {
  if (a.version !== b.version) return false

  const shift = BigInt((a.version === 4 ? 32 : 128) - Math.min(a.prefix, b.prefix))

  return a.bits >> shift === b.bits >> shift
}

/**
 * Réglages qui ouvrent la console à tout internet, à signaler au démarrage (la valeur reste
 * acceptée : le compose de démo utilise `0.0.0.0/0 ::/0`, ports liés à localhost) : une plage `/0`,
 * ou une plage qui recoupe une plage de `TRUST_PROXY` (un client pourrait alors passer pour un proxy
 * de confiance). Entrées déjà validées par `createConsoleNetwork` et `parseTrustProxy`.
 */
export function consoleNetworkWarnings(ranges: string[], trustProxy: string[] | false): string[] {
  const warnings: string[] = []

  for (const range of ranges) {
    const parsed = parseRange(range)

    if (parsed.prefix === 0) {
      warnings.push(`CONSOLE_ALLOWED_CIDRS : « ${range} » ouvre la console à tout internet`)
    }

    for (const proxy of trustProxy || []) {
      if (overlaps(parsed, parseRange(proxy))) {
        warnings.push(
          `CONSOLE_ALLOWED_CIDRS : « ${range} » recoupe la plage de TRUST_PROXY « ${proxy} », ` +
            'la console risque d’être ouverte à tout internet'
        )
      }
    }
  }

  return warnings
}

/** `::ffff:192.0.2.1` (socket double pile) redevient `192.0.2.1` ; toute autre valeur reste telle quelle. */
function unmapIpv4(address: string): string {
  if (isIP(address) !== 6) return address

  const groups = ipv6Groups(address)
  if (!groups.slice(0, 5).every((group) => group === 0) || groups[5] !== 0xffff) return address

  const [high, low] = groups.slice(6)

  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}
