import { isIP } from 'node:net'

import type { FastifyReply } from 'fastify'

import { ipv6Groups } from '../utils/ipv6'

/** Code d'erreur stable d'une requête refusée par le limiteur (traduit par les clients). */
export const TOO_MANY_REQUESTS_ERROR = 'too_many_requests'

/** Nombre maximal de clés suivies ; au-delà, les plus anciennes sont évincées. */
export const RATE_LIMIT_MAX_KEYS = 100_000

export type RateLimiterOptions = {
  /** Nombre de passages acceptés par clé et par fenêtre. */
  max: number
  windowMs: number
  /** Horloge en millisecondes, injectable pour les tests. */
  now?: () => number
}

export type RateLimitResult = {
  allowed: boolean
  /** Secondes avant la fin de la fenêtre en cours, au moins 1 (valeur de `Retry-After`). */
  retryAfterSeconds: number
  /** Passages encore acceptés dans la fenêtre en cours, après celui-ci (valeur de `RateLimit-Remaining`). */
  remaining: number
}

export type RateLimiter = {
  /** Compte un passage pour cette adresse (et ce suffixe) et dit s'il est accepté. */
  hit: (ip: string, suffix?: string) => RateLimitResult
  /** Rend un passage compté par `hit` (ex. connexion réussie : seuls les échecs comptent). */
  refund: (ip: string, suffix?: string) => void
  /** Nombre de clés suivies, pour vérifier que le ménage vide bien la mémoire. */
  size: () => number
}

type Entry = { count: number; resetAt: number }

/**
 * Clé d'une adresse : une IPv6 est ramenée à son /64 (un client en reçoit au moins un et change
 * d'adresse à volonté, sinon il contournerait la limite) ; une IPv6 mappée (`::ffff:a.b.c.d`)
 * redevient l'IPv4. Autre valeur : telle quelle.
 */
function addressKey(ip: string): string {
  if (isIP(ip) !== 6) return ip

  const groups = ipv6Groups(ip)
  const [g6, g7] = groups.slice(6)

  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return `${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`
  }

  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`
}

/**
 * Limiteur de débit en mémoire, à fenêtre fixe. La clé est l'adresse du client (`req.ip`), plus un
 * suffixe choisi par l'appelant pour séparer plusieurs limites d'une même adresse.
 *
 * ponytail: état dans le processus, donc une seule instance du backend (comme le hub SSE) ; passer à
 * un magasin partagé le jour où il y en a deux. Fenêtre fixe : au changement de fenêtre un client
 * peut enchaîner jusqu'à 2 × max passages. La table est bornée à `RATE_LIMIT_MAX_KEYS` : au-delà,
 * la clé la plus ancienne est évincée (elle repart d'un compteur vide), donc une rafale d'adresses
 * toutes différentes peut faire oublier des compteurs mais pas saturer la mémoire.
 */
export function createRateLimiter({
  max,
  windowMs,
  now = () => Date.now(),
}: RateLimiterOptions): RateLimiter {
  // Ordre d'insertion = ordre de fin de fenêtre (même durée pour toutes les clés) : les entrées
  // terminées sont donc toujours en tête de table.
  const entries = new Map<string, Entry>()

  const keyOf = (ip: string, suffix?: string) =>
    suffix ? `${addressKey(ip)}|${suffix}` : addressKey(ip)

  // Ménage des fenêtres terminées, sinon une adresse vue une seule fois resterait en mémoire.
  // S'arrête à la première fenêtre encore ouverte : jamais un parcours complet de la table.
  function sweep(at: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt > at) break

      entries.delete(key)
    }
  }

  return {
    hit(ip, suffix) {
      const at = now()
      sweep(at)

      const key = keyOf(ip, suffix)
      let entry = entries.get(key)

      // Une fenêtre terminée a déjà été retirée par `sweep` : absente de la table = fenêtre neuve.
      if (!entry) {
        if (entries.size >= RATE_LIMIT_MAX_KEYS) {
          entries.delete(entries.keys().next().value as string)
        }

        entry = { count: 0, resetAt: at + windowMs }
        entries.set(key, entry)
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - at) / 1000))

      // Un passage refusé n'est pas compté : le compteur reste borné par `max`, et `refund`
      // ne peut pas faire descendre sous la réalité.
      if (entry.count >= max) return { allowed: false, retryAfterSeconds, remaining: 0 }

      entry.count += 1
      return { allowed: true, retryAfterSeconds, remaining: max - entry.count }
    },

    refund(ip, suffix) {
      const entry = entries.get(keyOf(ip, suffix))

      if (entry && entry.resetAt > now() && entry.count > 0) entry.count -= 1
    },

    size: () => entries.size,
  }
}

/** Réponse 429 commune : code stable `too_many_requests` et délai d'attente en `Retry-After`. */
export function replyTooManyRequests(reply: FastifyReply, retryAfterSeconds: number) {
  return reply
    .code(429)
    .header('Retry-After', String(retryAfterSeconds))
    .send({ error: TOO_MANY_REQUESTS_ERROR })
}
