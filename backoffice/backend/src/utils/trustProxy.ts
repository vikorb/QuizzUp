import { isIP } from 'node:net'

/**
 * `TRUST_PROXY` : liste, séparée par des virgules, des adresses ou plages CIDR des proxys dont on
 * croit l'en-tête `X-Forwarded-For` (ex. le sous-réseau Docker de Caddy). Variable absente ou
 * vide : `false`, on garde l'adresse du socket (développement local, appel direct de l'API).
 *
 * Une valeur qui ferait confiance à tout le monde (`true`, `*`, `0.0.0.0/0`, `::/0`) est refusée :
 * le client pourrait alors choisir lui-même son adresse en forgeant l'en-tête, et contourner le
 * limiteur de débit. Les mots-clés et nombres de sauts de Fastify sont refusés pour la même raison.
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

function describeProblem(entry: string): string | null {
  const [address, prefix, ...rest] = entry.split('/')
  const version = isIP(address)

  if (version === 0 || rest.length > 0) return 'ni adresse IP ni plage CIDR'
  if (prefix === undefined) return null

  const maxPrefix = version === 4 ? 32 : 128

  if (!/^\d{1,3}$/.test(prefix) || Number(prefix) > maxPrefix) return 'préfixe CIDR hors limites'
  if (Number(prefix) === 0) return 'cette plage ferait confiance à tout le monde'

  return null
}
