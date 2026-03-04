// src/app.ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import routes from './routes'
import authPlugin from './plugins/auth'

export function buildApp() {
  const app = Fastify({ logger: true })

  app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })

  // auth = jwt + session inactivity
  app.register(authPlugin)

  // routes
  app.register(routes)

  return app
}
