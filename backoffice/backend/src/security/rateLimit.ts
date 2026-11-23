import type { FastifyReply } from 'fastify'

/** Code d'erreur stable d'une requête refusée par le limiteur (traduit par les clients). */
export const TOO_MANY_REQUESTS_ERROR = 'too_many_requests'

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
 * Limiteur de débit en mémoire, à fenêtre fixe. La clé est l'adresse du client (`req.ip`), plus un
 * suffixe choisi par l'appelant pour séparer plusieurs limites d'une même adresse.
 *
 * ponytail: état dans le processus, donc une seule instance du backend (comme le hub SSE) ; passer à
 * un magasin partagé le jour où il y en a deux. Fenêtre fixe : au changement de fenêtre un client
 * peut enchaîner jusqu'à 2 × max passages. Une rafale d'adresses toutes différentes grossit la
 * table jusqu'au prochain ménage (une fois par fenêtre), pas au-delà.
 */
export function createRateLimiter({
  max,
  windowMs,
  now = () => Date.now(),
}: RateLimiterOptions): RateLimiter {
  const entries = new Map<string, Entry>()
  let nextSweepAt = now() + windowMs

  const keyOf = (ip: string, suffix?: string) => (suffix ? `${ip}|${suffix}` : ip)

  // Ménage des fenêtres terminées, sinon une adresse vue une seule fois resterait en mémoire.
  function sweep(at: number) {
    if (at < nextSweepAt) return

    for (const [key, entry] of entries) {
      if (entry.resetAt <= at) entries.delete(key)
    }

    nextSweepAt = at + windowMs
  }

  return {
    hit(ip, suffix) {
      const at = now()
      sweep(at)

      const key = keyOf(ip, suffix)
      let entry = entries.get(key)

      if (!entry || entry.resetAt <= at) {
        entry = { count: 0, resetAt: at + windowMs }
        entries.set(key, entry)
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - at) / 1000))

      // Un passage refusé n'est pas compté : le compteur reste borné par `max`, et `refund`
      // ne peut pas faire descendre sous la réalité.
      if (entry.count >= max) return { allowed: false, retryAfterSeconds }

      entry.count += 1
      return { allowed: true, retryAfterSeconds }
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
