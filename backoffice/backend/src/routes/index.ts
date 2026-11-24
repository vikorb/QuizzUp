import type { FastifyPluginAsync } from 'fastify'
import healthRoute from './health'
import authRoutes from './auth'
import loginRoutes from './login'
import meRoutes from './me'
import companiesRoutes from './companies'
import themesRoutes from './themes'
import questionsRoutes from './questions'
import mediaCatalogRoutes from './mediaCatalog'
import roomRoutes from './room'
import roomLogsRoutes from './room/logs'
import gamesRoutes from './games'
import statsRoutes from './stats'
import demoRequestsRoutes from './demoRequests'
import liveRoutes from './live'
import publicRoutes from './public'
import { PUBLIC_API_PREFIX } from './public/_shared'

const routes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoute)
  await app.register(authRoutes)
  await app.register(loginRoutes)
  await app.register(meRoutes)
  await app.register(companiesRoutes)
  await app.register(themesRoutes)
  await app.register(questionsRoutes)
  await app.register(mediaCatalogRoutes)
  await app.register(roomRoutes)
  await app.register(roomLogsRoutes)
  await app.register(gamesRoutes)
  await app.register(statsRoutes)
  await app.register(demoRequestsRoutes)
  await app.register(liveRoutes)
  await app.register(publicRoutes, { prefix: PUBLIC_API_PREFIX })
}

export default routes
