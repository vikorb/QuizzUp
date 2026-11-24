import path from 'node:path'

import cors from '@fastify/cors'
import type { FastifyStaticSwaggerOptions } from '@fastify/swagger'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify from 'fastify'

import authPlugin from './plugins/auth'
import liveHubPlugin from './plugins/liveHub'
import liveJoinRegistrationsPlugin from './plugins/liveJoinRegistrations'
import routes from './routes'
import { isPublicPath, sendPublicError } from './routes/public/_shared'
import { resolveApiDocPath } from './utils/apiDocPath'
import { parseCorsOrigin, parsePublicOrigins } from './utils/cors'
import { parseTrustProxy } from './utils/trustProxy'

export function buildApp() {
  // Derrière un proxy (Caddy), `req.ip` ne vaut l'adresse du client que si on nomme ce proxy ici ;
  // une valeur trop large est refusée au démarrage (cf. utils/trustProxy.ts).
  const app = Fastify({ logger: true, trustProxy: parseTrustProxy(process.env.TRUST_PROXY) })

  const backofficeCors = {
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }

  // API publique : sans cookie ni jeton, ouverte aux seuls sites listés dans VITRINE_ORIGINS, plus
  // l'origine de PUBLIC_APP_URL qui sert les pages pour téléphone (aucune origine si les deux
  // sont vides, comme pour un appel de serveur à serveur).
  const vitrineOrigins = parsePublicOrigins(process.env.VITRINE_ORIGINS, process.env.PUBLIC_APP_URL)
  const publicCors = {
    origin: vitrineOrigins.length > 0 ? vitrineOrigins : false,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Retry-After'],
  }

  app.register(cors, {
    delegator: (req, callback) => {
      callback(null, isPublicPath(req.url) ? publicCors : backofficeCors)
    },
  })

  // `@fastify/cors` répond aux OPTIONS par un 404 de la racine (hors plugin public) : sous
  // `/public/v1`, il doit avoir le même format et le même `no-store` que les autres 404 publics.
  app.setNotFoundHandler((req, reply) => {
    if (isPublicPath(req.url)) {
      return sendPublicError(reply.header('Cache-Control', 'no-store'), 404, 'not_found')
    }

    return reply.code(404).send({
      message: `Route ${req.method}:${req.url} not found`,
      error: 'Not Found',
      statusCode: 404,
    })
  })

  const openApiPath = resolveApiDocPath()
  const openApiBaseDir = path.dirname(openApiPath)

  const swaggerOptions: FastifyStaticSwaggerOptions = {
    mode: 'static',
    specification: {
      path: openApiPath,
      baseDir: openApiBaseDir,
    },
  }

  app.register(swagger, swaggerOptions)

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })

  app.register(authPlugin)
  app.register(liveHubPlugin)
  app.register(liveJoinRegistrationsPlugin)
  app.register(routes)

  return app
}
