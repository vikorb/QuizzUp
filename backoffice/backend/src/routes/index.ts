import type { FastifyPluginAsync } from 'fastify'

import authRoutes from './auth'
import companiesRoutes from './companies'
import demoRequestsRoutes from './demoRequests'
import gamesRoutes from './games'
import healthRoute from './health'
import liveRoutes from './live'
import loginRoutes from './login'
import meRoutes from './me'
import mediaCatalogRoutes from './mediaCatalog'
import playersRoutes from './players'
import publicRoutes from './public'
import { PUBLIC_API_PREFIX } from './public/_shared'
import questionsRoutes from './questions'
import roomRoutes from './room'
import roomLogsRoutes from './room/logs'
import statsRoutes from './stats'
import themesRoutes from './themes'
import vouchersRoutes from './vouchers'

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
  await app.register(vouchersRoutes)
  await app.register(statsRoutes)
  await app.register(playersRoutes)
  await app.register(demoRequestsRoutes)
  await app.register(liveRoutes)
  await app.register(publicRoutes, { prefix: PUBLIC_API_PREFIX })
}

export default routes
