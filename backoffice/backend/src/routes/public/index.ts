import type { FastifyPluginAsync } from 'fastify'

import publicApiPlugin from '../../plugins/publicApi'
import { applyPublicDefaults } from './_shared'
import publicAvailabilityRoutes from './availability'
import publicLogoRoutes from './logos'
import demoRequestsPublicRoutes from './demoRequests'
import publicRoomRoutes from './rooms'
import publicVoucherRoutes from './vouchers'

// Préfixe `/public/v1` posé à l'enregistrement (routes/index.ts). Une ressource par dossier,
// enregistrée ici pour hériter des conventions de `applyPublicDefaults`.
const publicRoutes: FastifyPluginAsync = async (app) => {
  applyPublicDefaults(app)

  await app.register(publicLogoRoutes)
  await app.register(demoRequestsPublicRoutes)
  await app.register(publicVoucherRoutes)

  // Routes de réservation : clé d'API obligatoire, hooks d'authentification et de journal limités à
  // ce contexte pour ne pas toucher aux routes sans compte ci-dessus.
  await app.register(async (secured) => {
    await secured.register(publicApiPlugin)
    await secured.register(publicRoomRoutes)
    await secured.register(publicAvailabilityRoutes)
  })
}

export default publicRoutes
