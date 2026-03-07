import Fastify from 'fastify'
import cors from '@fastify/cors'
import routes from './routes'
import authPlugin from './plugins/auth'

export function buildApp() {
  const app = Fastify({ logger: true })

  app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  app.register(authPlugin)
  app.register(routes)

  return app
}
