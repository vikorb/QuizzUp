import type { FastifyPluginAsync } from 'fastify'

import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { gameParamsSchema } from './_schemas'
import { findStaffGame, openScheduledGame } from './_shared'

/** Le personnel ouvre une session programmée (`scheduled` → `pending`), comme le ferait la salle. */
const gamesIdOpenRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/games/:gameId/open',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.UPDATE)

      if (!hasPermission) {
        return
      }

      const parsedParams = gameParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, gameId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const error = await openScheduledGame(companyId, gameId)

      if (error) {
        return reply.code(error === 'not_found' ? 404 : 409).send({ error })
      }

      const game = await findStaffGame(req, companyId, gameId)

      if (game) {
        app.liveHub.gameUpdated(companyId, game.roomId, gameId)
        app.liveHub.scheduleChanged(companyId, game.roomId)
      }

      return { game }
    }
  )
}

export default gamesIdOpenRoutes
