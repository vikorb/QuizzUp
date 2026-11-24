import type { FastifyPluginAsync } from 'fastify'

import { applyPublicDefaults } from './_shared'
import publicJoinRoutes from './join'
import publicLogoRoutes from './logos'
import demoRequestsPublicRoutes from './demoRequests'
import publicVoucherRoutes from './vouchers'

// Préfixe `/public/v1` posé à l'enregistrement (routes/index.ts). Une ressource par dossier,
// enregistrée ici pour hériter des conventions de `applyPublicDefaults`.
const publicRoutes: FastifyPluginAsync = async (app) => {
  applyPublicDefaults(app)

  await app.register(publicLogoRoutes)
  await app.register(demoRequestsPublicRoutes)
  await app.register(publicVoucherRoutes)
  await app.register(publicJoinRoutes)
}

export default publicRoutes
