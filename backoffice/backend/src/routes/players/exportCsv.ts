import type { FastifyPluginAsync } from 'fastify'

import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { listMarketingPlayers } from './_queries'
import { playersParamsSchema } from './_schemas'
import { buildPlayersCsv } from './_shared'

/** Export CSV des joueurs qui ont accepté les offres du centre (Q12), pour l'admin. */
const playersExportRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/players/export.csv',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.PLAYER, API_ACTION.READ)

      if (!hasPermission) {
        return
      }

      const parsedParams = playersParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const players = await listMarketingPlayers(companyId)

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="joueurs-offres.csv"')
        .header('Cache-Control', 'no-store')
        .send(buildPlayersCsv(players))
    }
  )
}

export default playersExportRoutes
