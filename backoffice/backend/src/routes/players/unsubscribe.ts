import type { FastifyPluginAsync } from 'fastify'

import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { withdrawMarketingConsent } from './_queries'
import { playerEmailSchema, playersParamsSchema } from './_schemas'

/**
 * Désinscription des offres : le consentement est retiré partout dans la compagnie. La réponse est
 * la même que l'adresse soit connue ou non, pour ne pas servir à tester l'existence d'un joueur.
 */
const playersUnsubscribeRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/players/unsubscribe',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.PLAYER, API_ACTION.UPDATE)

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

      await withdrawMarketingConsent(companyId, parsedBody.data.email)

      return { ok: true }
    }
  )
}

export default playersUnsubscribeRoutes
