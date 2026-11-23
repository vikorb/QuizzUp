import type { FastifyPluginAsync } from 'fastify'

import { applyPublicDefaults } from './_shared'
import publicLogoRoutes from './logos'
import demoRequestsPublicRoutes from './demoRequests'

// Préfixe `/public/v1` posé à l'enregistrement (routes/index.ts). Une ressource par dossier,
// enregistrée ici pour hériter des conventions de `applyPublicDefaults`.
const publicRoutes: FastifyPluginAsync = async (app) => {
  applyPublicDefaults(app)

  await app.register(publicLogoRoutes)
  await app.register(demoRequestsPublicRoutes)
}

export default publicRoutes
