import type { FastifyPluginAsync } from 'fastify'
import healthRoute from './health'
import authRoutes from './auth'
import meRoutes from './me'
import companiesRoutes from './companies'

const routes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoute)
  await app.register(authRoutes)
  await app.register(meRoutes)
  await app.register(companiesRoutes)
}

export default routes
