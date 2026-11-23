import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { getCurrentAdminId } from '../_shared/adminContext'

import { paramsSchema, updateDemoRequestSchema } from './_schemas'
import { demoRequestSelect } from './_shared'

const demoRequestsIdRoutes: FastifyPluginAsync = async (app) => {
  app.patch('/demo-requests/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!requireApiPermission(req, reply, API_RESOURCE.DEMO_REQUEST, API_ACTION.UPDATE)) {
      return
    }

    const parsedParams = paramsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const parsedBody = updateDemoRequestSchema.safeParse(req.body)

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        details: parsedBody.error.flatten(),
      })
    }

    const { processed } = parsedBody.data

    const query = db('demo_requests').where('id', parsedParams.data.id)

    // Deux comptes qui traitent la même demande : le premier garde l'auteur et la date.
    if (processed) query.whereNull('processed_at')

    let [demoRequest] = await query
      .update({
        processed_at: processed ? db.fn.now() : null,
        processed_by: processed ? getCurrentAdminId(req) : null,
        updated_at: db.fn.now(),
      })
      .returning(demoRequestSelect)

    // Aucune ligne modifiée : déjà traitée (on la renvoie telle quelle) ou inexistante.
    if (!demoRequest && processed) {
      demoRequest = await db('demo_requests')
        .where('id', parsedParams.data.id)
        .first(demoRequestSelect)
    }

    if (!demoRequest) {
      return reply.code(404).send({ error: 'not_found' })
    }

    return { demoRequest }
  })

  // Suppression définitive (droit à l'effacement) : pas de suppression logique ici.
  app.delete('/demo-requests/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!requireApiPermission(req, reply, API_RESOURCE.DEMO_REQUEST, API_ACTION.DELETE)) {
      return
    }

    const parsed = paramsSchema.safeParse(req.params)

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const deleted = await db('demo_requests').where('id', parsed.data.id).delete()

    if (deleted === 0) {
      return reply.code(404).send({ error: 'not_found' })
    }

    return reply.code(204).send()
  })
}

export default demoRequestsIdRoutes
