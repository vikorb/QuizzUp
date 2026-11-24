import type { FastifyPluginAsync } from 'fastify'

import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { canReadPlayerEmails } from '../games/_shared'
import { countAnonymousPlayers, listPlayers } from './_queries'
import { playersListQuerySchema, playersParamsSchema } from './_schemas'
import playersEraseRoutes from './erase'
import playersExportRoutes from './exportCsv'
import playersUnsubscribeRoutes from './unsubscribe'

/**
 * Joueurs d'une compagnie (US-PLAYER-01) : liste, export des adresses qui acceptent les offres,
 * désinscription des offres et effacement (RGPD). Pas de table : les joueurs se déduisent des
 * pupitres des parties (cf. `_queries.ts`).
 */
const playersRoutes: FastifyPluginAsync = async (app) => {
  app.register(playersExportRoutes)
  app.register(playersUnsubscribeRoutes)
  app.register(playersEraseRoutes)

  app.get(
    '/companies/:companyId/players',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.PLAYER, API_ACTION.LIST)

      if (!hasPermission) {
        return
      }

      const parsedParams = playersParamsSchema.safeParse(req.params)
      const parsedQuery = playersListQuerySchema.safeParse(req.query)

      if (!parsedParams.success || !parsedQuery.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const [{ players, total }, anonymousPlayers] = await Promise.all([
        listPlayers({ companyId, ...parsedQuery.data }),
        countAnonymousPlayers(companyId),
      ])
      const showEmails = canReadPlayerEmails(req)

      return {
        players: players.map((player) => ({
          ...player,
          email: showEmails ? player.email : null,
        })),
        total,
        anonymousPlayers,
      }
    }
  )
}

export default playersRoutes
