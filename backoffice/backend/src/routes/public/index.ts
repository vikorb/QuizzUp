import type { FastifyPluginAsync } from 'fastify'

import { applyPublicDefaults } from './_shared'

// Préfixe `/public/v1` posé à l'enregistrement (routes/index.ts). Une ressource par dossier,
// enregistrée ici pour hériter des conventions de `applyPublicDefaults`. Aucune route pour l'instant.
const publicRoutes: FastifyPluginAsync = async (app) => {
  applyPublicDefaults(app)
}

export default publicRoutes
