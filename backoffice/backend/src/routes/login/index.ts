import type { FastifyPluginAsync } from 'fastify'

import { createRateLimiter, replyTooManyRequests } from '../../security/rateLimit'
import enrollRoutes from './enroll'
import totpRoutes from './totp'

/** Routes du deuxième facteur : 10 appels par minute et par adresse. */
const LOGIN_TOTP_RATE_LIMIT_MAX = 10
const LOGIN_TOTP_RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Routes de défi du deuxième facteur du superadmin (`/login/totp*`). Sans `authenticate` (aucune
 * session n'existe encore) : la garde réseau de la console et la limite par adresse sont donc posées
 * ici, avant tout traitement, pour toutes les routes du dossier.
 */
const loginRoutes: FastifyPluginAsync = async (app) => {
  // Un limiteur par application : les tests repartent d'un compteur vide.
  const limiter = createRateLimiter({
    max: LOGIN_TOTP_RATE_LIMIT_MAX,
    windowMs: LOGIN_TOTP_RATE_LIMIT_WINDOW_MS,
  })

  app.addHook('onRequest', async (req, reply) => {
    if (!app.consoleNetwork.allows(req.ip)) {
      req.log.warn(
        { route: req.routeOptions.url, ip: req.ip },
        'défi TOTP hors des adresses de la console'
      )
      return reply.code(403).send({ error: 'forbidden' })
    }

    const limit = limiter.hit(req.ip)
    if (!limit.allowed) return replyTooManyRequests(reply, limit.retryAfterSeconds)
  })

  await app.register(totpRoutes)
  await app.register(enrollRoutes)
}

export default loginRoutes
