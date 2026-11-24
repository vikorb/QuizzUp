import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { demoRequestSelect } from './_shared'
import demoRequestsIdRoutes from './id'

// Demandes de démonstration de la vitrine, vues par l'éditeur seulement (console).
const demoRequestsRoutes: FastifyPluginAsync = async (app) => {
  app.register(demoRequestsIdRoutes)

  app.get('/demo-requests', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!requireApiPermission(req, reply, API_RESOURCE.DEMO_REQUEST, API_ACTION.LIST)) {
      return
    }

    // Volume faible : pas de pagination. Les plus récentes d'abord.
    const demoRequests = await db('demo_requests')
      .select(demoRequestSelect)
      .orderBy('created_at', 'desc')

    const [pending] = await db('demo_requests').whereNull('processed_at').count('* as count')

    return { demoRequests, pendingCount: Number(pending?.count ?? 0) }
  })
}

export default demoRequestsRoutes
