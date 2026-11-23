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
  const list = new BlockList()

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

    list.addSubnet(
      address,
      prefix === undefined ? maxPrefix : Number(prefix),
      version === 4 ? 'ipv4' : 'ipv6'
    )
  }

  return {
    ranges,
    allows: (ip) => {
      const address = unmapIpv4(ip.split('%')[0])
      const version = isIP(address)

      return version !== 0 && list.check(address, version === 4 ? 'ipv4' : 'ipv6')
    },
  }
}

/** `::ffff:192.0.2.1` (socket double pile) redevient `192.0.2.1` ; toute autre valeur reste telle quelle. */
function unmapIpv4(address: string): string {
  if (isIP(address) !== 6) return address

  const groups = ipv6Groups(address)
  if (!groups.slice(0, 5).every((group) => group === 0) || groups[5] !== 0xffff) return address

  const [high, low] = groups.slice(6)

  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}
