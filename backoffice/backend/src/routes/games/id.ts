import type { FastifyPluginAsync } from 'fastify'

import { GAME_STATE_ABORTED, GAME_STATE_PENDING, GAME_STATE_RUNNING } from '@quizzup/shared'
import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { gameParamsSchema } from './_schemas'
import { findGameInCompany } from './_shared'

const gamesIdRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/games/:gameId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.READ)

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

      return { game }
    }
  )

  // L'opérateur peut arrêter une partie en attente ou en cours (salle libérée).
  app.post(
    '/companies/:companyId/games/:gameId/abort',
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

      if (game.state !== GAME_STATE_PENDING && game.state !== GAME_STATE_RUNNING) {
        return reply.code(409).send({ error: 'game_already_over' })
      }

      await db('games').where('id', gameId).update({
        state: GAME_STATE_ABORTED,
        finished_at: db.fn.now(),
        updated_at: db.fn.now(),
      })

      return { game: await findGameInCompany(companyId, gameId) }
    }
  )
}

export default gamesIdRoutes
