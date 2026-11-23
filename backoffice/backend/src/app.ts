import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import path from 'node:path'
import fs from 'node:fs'

import routes from './routes'
import { PUBLIC_API_PREFIX } from './routes/public/_shared'
import authPlugin from './plugins/auth'
import { parseCorsOrigin, parseOriginList } from './utils/cors'
import { parseTrustProxy } from './utils/trustProxy'

import type { FastifyStaticSwaggerOptions } from '@fastify/swagger'

function resolveOpenApiPath() {
  if (process.env.OPENAPI_PATH) {
    return path.resolve(process.env.OPENAPI_PATH)
  }

  const candidates = [
    path.resolve(process.cwd(), 'docs/api/openapi.yaml'),
    path.resolve(process.cwd(), '../docs/api/openapi.yaml'),
    path.resolve(process.cwd(), 'docs/db/openapi.yaml'),
    path.resolve(process.cwd(), '../docs/db/openapi.yaml'),
  ]

  const openApiPath = candidates.find((candidate) => fs.existsSync(candidate))

  if (!openApiPath) {
    throw new Error(`openapi.yaml not found. Tried: ${candidates.join(', ')}`)
  }

  return openApiPath
}

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

  // API publique : sans cookie ni jeton, ouverte aux seuls sites listés dans VITRINE_ORIGINS
  // (aucune origine si la variable est vide, comme pour un appel de serveur à serveur).
  const vitrineOrigins = parseOriginList(process.env.VITRINE_ORIGINS)
  const publicCors = {
    origin: vitrineOrigins.length > 0 ? vitrineOrigins : false,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Retry-After'],
  }

  app.register(cors, {
    delegator: (req, callback) => {
      const path = req.url.split('?')[0]
      const isPublic = path === PUBLIC_API_PREFIX || path.startsWith(`${PUBLIC_API_PREFIX}/`)

      callback(null, isPublic ? publicCors : backofficeCors)
    },
  })

  const openApiPath = resolveOpenApiPath()
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
  app.register(routes)

  return app
}
