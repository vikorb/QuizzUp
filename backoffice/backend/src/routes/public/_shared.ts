import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify'

import { createRateLimiter, replyTooManyRequests } from '../../security/rateLimit'

/** Préfixe de toute l'API publique (vitrine, réservation) : sans compte, versionnée. */
export const PUBLIC_API_PREFIX = '/public/v1'

/** Limite par défaut de tout le préfixe, par adresse. Large : un centre partage une seule IP. */
export const PUBLIC_RATE_LIMIT_MAX = 120
export const PUBLIC_RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Format d'erreur public : statut HTTP et `{ error: '<code_snake_case>', details? }`, comme le
 * backoffice. `details` ne sert qu'à `invalid_body` (les `fieldErrors` de Zod). Jamais de pile
 * ni de message brut.
 */
export function sendPublicError(
  reply: FastifyReply,
  status: number,
  code: string,
  details?: Record<string, unknown>
) {
  return reply.code(status).send(details ? { error: code, details } : { error: code })
}

// Erreurs d'analyse du corps par Fastify, ramenées à des codes stables.
const PARSING_ERRORS: Record<string, [number, string]> = {
  FST_ERR_CTP_INVALID_JSON_BODY: [400, 'invalid_json'],
  FST_ERR_CTP_EMPTY_JSON_BODY: [400, 'invalid_json'],
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: [400, 'invalid_json'],
  FST_ERR_CTP_INVALID_MEDIA_TYPE: [415, 'unsupported_media_type'],
  FST_ERR_CTP_BODY_TOO_LARGE: [413, 'payload_too_large'],
}

/**
 * Conventions communes de `/public/v1`, posées sur le plugin du préfixe : aucune authentification,
 * réponses jamais mises en cache, limite de débit par adresse, erreurs au format public.
 * Chaque ressource s'enregistre ensuite dans ce plugin pour en hériter.
 */
export function applyPublicDefaults(app: FastifyInstance) {
  const limiter = createRateLimiter({
    max: PUBLIC_RATE_LIMIT_MAX,
    windowMs: PUBLIC_RATE_LIMIT_WINDOW_MS,
  })

  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store')

    const limit = limiter.hit(req.ip)
    if (!limit.allowed) return replyTooManyRequests(reply, limit.retryAfterSeconds)
  })

  app.setNotFoundHandler((_req, reply) => sendPublicError(reply, 404, 'not_found'))

  app.setErrorHandler((error: FastifyError, req, reply) => {
    const known = error.code ? PARSING_ERRORS[error.code] : undefined
    if (known) return sendPublicError(reply, known[0], known[1])

    // Le détail reste dans le journal du serveur (sans corps de requête) ; le client n'en reçoit rien.
    req.log.error({ err: error }, 'public API error')
    return sendPublicError(reply, 500, 'server_error')
  })
}
