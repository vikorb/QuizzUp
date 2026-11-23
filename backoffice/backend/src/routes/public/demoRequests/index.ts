import type { FastifyPluginAsync } from 'fastify'

import db from '../../../db'
import { createRateLimiter, replyTooManyRequests } from '../../../security/rateLimit'
import { sendPublicError } from '../_shared'

import { createDemoRequestSchema } from './_schemas'

/** Corps maximal d'une demande : 16 Ko suffisent largement (message de 2000 caractères au plus). */
export const DEMO_REQUEST_BODY_LIMIT = 16 * 1024

/** Demandes acceptées par heure et par adresse. */
export const DEMO_REQUEST_RATE_LIMIT_MAX = 5
export const DEMO_REQUEST_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

const demoRequestsPublicRoutes: FastifyPluginAsync = async (app) => {
  // Un limiteur par instance du plugin (donc par application), en plus de celui de tout le préfixe.
  const limiter = createRateLimiter({
    max: DEMO_REQUEST_RATE_LIMIT_MAX,
    windowMs: DEMO_REQUEST_RATE_LIMIT_WINDOW_MS,
  })

  app.post(
    '/demo-requests',
    {
      bodyLimit: DEMO_REQUEST_BODY_LIMIT,
      // Compte tout envoi, même invalide ou trop gros : sonder la route ne doit rien coûter de moins.
      onRequest: async (req, reply) => {
        const limit = limiter.hit(req.ip)

        if (!limit.allowed) return replyTooManyRequests(reply, limit.retryAfterSeconds)
      },
    },
    async (req, reply) => {
      // Champ piège rempli : même réponse qu'un succès, rien n'est stocké (un robot ne doit pas
      // pouvoir distinguer les deux).
      const trap = (req.body as { website?: unknown } | null)?.website

      if (typeof trap === 'string' && trap.trim() !== '') {
        return reply.code(202).send({ ok: true })
      }

      // Ni le corps ni les détails de Zod ne vont dans un journal : ce sont des données personnelles.
      const parsed = createDemoRequestSchema.safeParse(req.body)

      if (!parsed.success) {
        return sendPublicError(reply, 400, 'invalid_body', {
          fieldErrors: parsed.error.flatten().fieldErrors,
        })
      }

      const { name, centerName, email, phone, roomsCount, message, locale } = parsed.data

      try {
        await db('demo_requests').insert({
          contact_name: name,
          center_name: centerName,
          email,
          phone: phone ?? null,
          rooms_count: roomsCount,
          message: message || null,
          locale: locale ?? null,
          consent_at: db.fn.now(),
        })
      } catch (error) {
        // Une erreur PostgreSQL embarque la ligne refusée (`detail`) : on ne journalise que son code.
        req.log.error({ pgCode: (error as { code?: string }).code }, 'demo request insert failed')

        return sendPublicError(reply, 500, 'server_error')
      }

      return reply.code(202).send({ ok: true })
    }
  )
}

export default demoRequestsPublicRoutes
