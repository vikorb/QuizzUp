import type { FastifyPluginAsync } from 'fastify'

import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { erasePlayer } from './_queries'
import { playerEmailSchema, playersParamsSchema } from './_schemas'

/** Droit à l'effacement d'un joueur : adresse, consentements et nom effacés, scores gardés. */
const playersEraseRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/players/erase',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.PLAYER, API_ACTION.DELETE)

      if (!hasPermission) {
        return
      }

      const parsedParams = playersParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = playerEmailSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const erased = await erasePlayer(companyId, parsedBody.data.email)

      if (erased === 0) {
        return reply.code(404).send({ error: 'player_not_found' })
      }

      return { erased }
    }
  )
}

export default playersEraseRoutes
