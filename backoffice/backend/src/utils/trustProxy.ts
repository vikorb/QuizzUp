import { isIP } from 'node:net'

import { ipv6Groups } from './ipv6'

/**
 * `TRUST_PROXY` : liste, séparée par des virgules, des adresses ou plages CIDR des proxys dont on
 * croit l'en-tête `X-Forwarded-For` (ex. le sous-réseau Docker de Caddy). Variable absente ou
 * vide : `false`, on garde l'adresse du socket (développement local, appel direct de l'API).
 *
 * Une valeur qui ferait confiance à tout le monde (`true`, `*`, `0.0.0.0/0`, `::/0`) est refusée :
 * le client pourrait alors choisir lui-même son adresse en forgeant l'en-tête, et contourner le
 * limiteur de débit. Les mots-clés et nombres de sauts de Fastify sont refusés pour la même raison,
 * ainsi que les plages trop larges pour être un réseau de proxys (au-dessus de /8 en IPv4, de /16
 * en IPv6, ou qui contiennent les adresses IPv4 mappées `::ffff:0:0/96`) et les adresses à zone
 * (`fe80::1%eth0`), que la résolution des proxys de Fastify ne sait pas comparer.
 */
export function parseTrustProxy(value: string | undefined): string[] | false {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (entries.length === 0) return false

  for (const entry of entries) {
    const problem = describeProblem(entry)

    if (problem) {
      throw new Error(
        `TRUST_PROXY invalide (« ${entry} ») : ${problem}. ` +
          'Attendu : adresses ou plages CIDR des proxys de confiance séparées par des virgules ' +
          '(ex. 172.18.0.0/16), jamais « true » ni une plage qui couvre tout internet.'
      )
    }
  }

  return entries
}

// Plus petits préfixes acceptés : une plage plus large couvre une part de l'internet public.
const MIN_PREFIX_IPV4 = 8
const MIN_PREFIX_IPV6 = 16

// `::ffff:0:0`, le début de la plage des IPv4 mappées, sur 128 bits.
const MAPPED_RANGE_START = 0xffffn << 32n
const ALL_BITS = (1n << 128n) - 1n

function describeProblem(entry: string): string | null {
  const [address, prefix, ...rest] = entry.split('/')
  const version = isIP(address)

  if (version === 0 || rest.length > 0) return 'ni adresse IP ni plage CIDR'
  if (address.includes('%')) return 'adresse avec zone (%) non acceptée'
  if (prefix === undefined) return null

  const maxPrefix = version === 4 ? 32 : 128

  if (!/^\d{1,3}$/.test(prefix) || Number(prefix) > maxPrefix) return 'préfixe CIDR hors limites'
  if (Number(prefix) === 0) return 'cette plage ferait confiance à tout le monde'
  const minPrefix = version === 4 ? MIN_PREFIX_IPV4 : MIN_PREFIX_IPV6

  if (Number(prefix) < minPrefix) {
    return `plage trop large (au moins /${minPrefix} en IPv${version})`
  }
  if (version === 6 && coversMappedIpv4(address, Number(prefix))) {
    return 'cette plage contient toutes les adresses IPv4 (::ffff:0:0/96)'
  }

  return null
}

function coversMappedIpv4(address: string, prefix: number): boolean {
  if (prefix > 96) return false

  const mask = (ALL_BITS << BigInt(128 - prefix)) & ALL_BITS
  const bits = ipv6Groups(address).reduce((acc, group) => (acc << 16n) | BigInt(group), 0n)

  return (bits & mask) === (MAPPED_RANGE_START & mask)
}
