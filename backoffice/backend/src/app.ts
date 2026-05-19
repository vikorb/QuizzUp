import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import path from 'node:path'
import fs from 'node:fs'

import routes from './routes'
import authPlugin from './plugins/auth'

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
  const app = Fastify({ logger: true })

  app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
