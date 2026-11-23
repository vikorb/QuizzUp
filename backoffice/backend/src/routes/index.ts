import type { FastifyPluginAsync } from 'fastify'
import healthRoute from './health'
import authRoutes from './auth'
import meRoutes from './me'
import companiesRoutes from './companies'
import themesRoutes from './themes'
import questionsRoutes from './questions'
import roomRoutes from './room'
import gamesRoutes from './games'
import demoRequestsRoutes from './demoRequests'
import liveRoutes from './live'
import publicRoutes from './public'
import { PUBLIC_API_PREFIX } from './public/_shared'

const routes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoute)
  await app.register(authRoutes)
  await app.register(meRoutes)
  await app.register(companiesRoutes)
  await app.register(themesRoutes)
  await app.register(questionsRoutes)
  await app.register(roomRoutes)
  await app.register(gamesRoutes)
  await app.register(demoRequestsRoutes)
  await app.register(liveRoutes)
  await app.register(publicRoutes, { prefix: PUBLIC_API_PREFIX })
}

export default routes
