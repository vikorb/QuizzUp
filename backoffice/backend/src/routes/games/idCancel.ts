import type { FastifyPluginAsync } from 'fastify'

import { GAME_STATE_CANCELLED, GAME_STATE_SCHEDULED } from '@quizzup/shared'
import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { gameParamsSchema } from './_schemas'
import { cancelScheduledGames, findGameInCompany, findStaffGame } from './_shared'

/** Annule une session programmée : le créneau est libéré, les emails de ses joueurs effacés. */
const gamesIdCancelRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/games/:gameId/cancel',
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

      const game = await findGameInCompany(companyId, gameId)

      if (!game) {
        return reply.code(404).send({ error: 'not_found' })
      }

      // Déjà annulée : l'appel est idempotent.
      if (game.state === GAME_STATE_CANCELLED) {
        return { game: await findStaffGame(req, companyId, gameId) }
      }

      if (game.state !== GAME_STATE_SCHEDULED) {
        return reply.code(409).send({ error: 'game_not_scheduled' })
      }

      // L'annulation et l'effacement des emails passent ensemble ou pas du tout.
      const cancelled = await db.transaction((trx) => cancelScheduledGames(trx, { id: gameId }))

      // Changée entre la lecture et l'écriture : annulée par un appel simultané (idempotent), sinon
      // ouverte, donc plus programmée.
      if (cancelled === 0) {
        const current = await findGameInCompany(companyId, gameId)

        if (current?.state !== GAME_STATE_CANCELLED) {
          return reply.code(409).send({ error: 'game_not_scheduled' })
        }
      }

      app.liveHub.gameUpdated(companyId, game.roomId, gameId)

      return { game: await findStaffGame(req, companyId, gameId) }
    }
  )
}

export default gamesIdCancelRoutes
