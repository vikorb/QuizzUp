import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import {
  API_KEY_STATUS_ACTIVE,
  API_KEY_TOKEN_PATTERN,
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../db'
import { sendPublicError } from '../routes/public/_shared'
import { hashApiKey } from '../security/apiKeys'
import { createRateLimiter, replyTooManyRequests } from '../security/rateLimit'

/** Appels acceptés par minute et par clé (`PUBLIC_API_RATE_LIMIT_PER_MINUTE`). */
export const PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE = 120

/** Échecs d'authentification acceptés par minute et par adresse (`PUBLIC_API_AUTH_FAILURES_PER_MINUTE`). */
export const PUBLIC_API_DEFAULT_AUTH_FAILURES_PER_MINUTE = 20

const WINDOW_MS = 60_000

/** `last_used_at` est rafraîchi au plus une fois par minute : pas une écriture par appel. */
const LAST_USED_REFRESH_MS = 60_000

/** Colonnes `api_request_logs.route` et `error_code`. */
const LOG_ROUTE_MAX_LENGTH = 120
const LOG_ERROR_CODE_MAX_LENGTH = 80

/** Clé d'API qui a ouvert la requête ; `null` hors d'une route authentifiée. */
export type PublicApiKey = { id: number; companyId: number }

/** Entier ≥ 1, sinon la valeur par défaut (une variable vide ou absurde ne doit pas ouvrir les vannes). */
function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value?.trim())

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback
}

/**
 * Authentification par clé d'API des routes de réservation de `/public/v1`, journal des appels et
 * limite de débit par clé. À enregistrer dans un contexte qui ne contient que les routes à clé :
 * il hérite des conventions de `applyPublicDefaults` (format d'erreur, limite par adresse).
 *
 * - `Authorization: Bearer qzk_…` ; un jeton du backoffice n'ouvre rien ici. La clé est relue en
 *   base à chaque appel : une révocation est immédiate.
 * - 401 `api_key_missing` (en-tête absent ou autre schéma) et 401 `api_key_invalid` (format faux,
 *   clé inconnue ou révoquée, compagnie supprimée : même réponse). Chaque 401 compte dans la limite
 *   d'échecs par adresse ; un appel authentifié rend son passage.
 * - 403 `company_inactive` : clé valide, compagnie inactive.
 * - Une ligne de `api_request_logs` par appel authentifié : méthode, motif de route, statut, code
 *   d'erreur. Jamais l'adresse, le corps, l'URL ni les paramètres. Les 429 par clé n'y sont pas
 *   écrits : une écriture par appel refusé annulerait l'effet de la limite.
 *
 * ponytail: limites en mémoire, une seule instance du backend (comme le hub du direct).
 */
const publicApiPlugin: FastifyPluginAsync = async (app) => {
  const rateLimitPerMinute = positiveInt(
    process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE,
    PUBLIC_API_DEFAULT_RATE_LIMIT_PER_MINUTE
  )
  const keyLimiter = createRateLimiter({ max: rateLimitPerMinute, windowMs: WINDOW_MS })
  const failureLimiter = createRateLimiter({
    max: positiveInt(
      process.env.PUBLIC_API_AUTH_FAILURES_PER_MINUTE,
      PUBLIC_API_DEFAULT_AUTH_FAILURES_PER_MINUTE
    ),
    windowMs: WINDOW_MS,
  })
  // Code d'erreur de la réponse, lu à l'envoi pour le journal (le corps de la requête n'y est pas).
  const errorCodes = new WeakMap<object, string>()

  app.decorateRequest('apiKey', null)

  app.addHook('onRequest', async (req, reply) => {
    // On compte d'abord, on rend le passage une fois la clé reconnue : seuls les échecs restent.
    const failures = failureLimiter.hit(req.ip)

    if (!failures.allowed) return replyTooManyRequests(reply, failures.retryAfterSeconds)

    const token = /^Bearer (qzk_\S*)$/.exec(req.headers.authorization ?? '')?.[1]

    if (!token) return sendPublicError(reply, 401, 'api_key_missing')
    if (!API_KEY_TOKEN_PATTERN.test(token)) return sendPublicError(reply, 401, 'api_key_invalid')

    const key = await db('api_keys')
      .where('key_hash', hashApiKey(token))
      .first('id', 'company_id', 'status', 'last_used_at')

    if (!key || key.status !== API_KEY_STATUS_ACTIVE) {
      return sendPublicError(reply, 401, 'api_key_invalid')
    }

    const company = await db('companies').where('id', key.company_id).first('status')

    // Une compagnie supprimée répond comme une clé inconnue : pas de 403 qui confirmerait la clé.
    if (!company || company.status === COMPANY_STATUS_DELETED) {
      return sendPublicError(reply, 401, 'api_key_invalid')
    }

    failureLimiter.refund(req.ip)

    const limit = keyLimiter.hit(`key:${key.id}`)

    reply
      .header('RateLimit-Limit', String(rateLimitPerMinute))
      .header('RateLimit-Remaining', String(limit.remaining))

    if (!limit.allowed) return replyTooManyRequests(reply, limit.retryAfterSeconds)

    req.apiKey = { id: Number(key.id), companyId: Number(key.company_id) }

    if (company.status !== COMPANY_STATUS_ACTIVE) {
      return sendPublicError(reply, 403, 'company_inactive')
    }

    const lastUsedAt = key.last_used_at ? new Date(key.last_used_at).getTime() : 0

    if (Date.now() - lastUsedAt >= LAST_USED_REFRESH_MS) {
      await db('api_keys').where('id', key.id).update({ last_used_at: new Date() })
    }
  })

  app.addHook('onSend', async (req, reply, payload) => {
    if (req.apiKey && reply.statusCode >= 400 && typeof payload === 'string') {
      try {
        const { error } = JSON.parse(payload) as { error?: unknown }

        if (typeof error === 'string') errorCodes.set(req, error)
      } catch {
        // Corps qui n'est pas du JSON : pas de code d'erreur à journaliser.
      }
    }

    return payload
  })

  app.addHook('onResponse', async (req, reply) => {
    if (!req.apiKey) return

    try {
      await db('api_request_logs').insert({
        company_id: req.apiKey.companyId,
        api_key_id: req.apiKey.id,
        method: req.method,
        route: (req.routeOptions.url ?? '').slice(0, LOG_ROUTE_MAX_LENGTH),
        status_code: reply.statusCode,
        error_code: errorCodes.get(req)?.slice(0, LOG_ERROR_CODE_MAX_LENGTH) ?? null,
        duration_ms: Math.round(reply.elapsedTime),
      })
    } catch (err) {
      // La réponse est déjà partie : un journal en panne ne doit pas faire échouer l'appel.
      req.log.error({ err }, 'public API request log failed')
    }
  })
}

declare module 'fastify' {
  interface FastifyRequest {
    apiKey: PublicApiKey | null
  }
}

export default fp(publicApiPlugin)
