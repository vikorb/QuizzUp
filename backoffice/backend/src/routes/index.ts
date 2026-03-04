// src/routes/index.ts
import type { FastifyPluginAsync } from 'fastify'
import healthRoute from './health'
import authRoutes from './auth'
import meRoutes from './me'

const routes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoute)
  await app.register(authRoutes)
  await app.register(meRoutes)
}

export default routes
