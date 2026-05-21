import type { FastifyPluginAsync } from 'fastify'
import healthRoute from './health'
import authRoutes from './auth'
import meRoutes from './me'
import companiesRoutes from './companies'
import themesRoutes from './themes'
import questionsRoutes from './questions'

const routes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoute)
  await app.register(authRoutes)
  await app.register(meRoutes)
  await app.register(companiesRoutes)
  await app.register(themesRoutes)
  await app.register(questionsRoutes)
}

export default routes
