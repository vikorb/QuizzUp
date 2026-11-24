import type { FastifyPluginAsync } from 'fastify'

import { GAME_STATE_PENDING } from '@quizzup/shared'
import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { gameParamsSchema } from './_schemas'
import { findGameState, generateJoinToken, getJoinExpiry, toGameJoin } from './_shared'

/**
 * Lien d'inscription d'une partie en attente (lot 2) : le personnel l'ouvre, le régénère (l'ancien
 * QR code cesse de marcher) ou le ferme. Un seul lien par partie.
 */
const gamesJoinRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/games/:gameId/join',
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

      const game = await findGameState(companyId, gameId)

      if (!game) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (game.state !== GAME_STATE_PENDING) {
        return reply.code(409).send({ error: 'game_not_pending' })
      }

      const token = generateJoinToken()
      const expiresAt = getJoinExpiry()
      const updated = await db('games')
        .where('id', gameId)
        .where('state', GAME_STATE_PENDING)
        .update({
          join_token: token,
          join_expires_at: expiresAt.toISOString(),
          updated_at: db.fn.now(),
        })

      // Lancée ou arrêtée entre la lecture et l'écriture : plus de lien à ouvrir.
      if (updated === 0) {
        return reply.code(409).send({ error: 'game_not_pending' })
      }

      app.liveHub.gameUpdated(companyId, game.roomId, gameId)

      return { join: toGameJoin(token, expiresAt) }
    }
  )

  // Idempotent : fermer un lien déjà fermé répond 204.
  app.delete(
    '/companies/:companyId/games/:gameId/join',
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

      const game = await findGameState(companyId, gameId)

      if (!game) {
        return reply.code(404).send({ error: 'not_found' })
      }

      await db('games')
        .where('id', gameId)
        .update({ join_token: null, join_expires_at: null, updated_at: db.fn.now() })
      app.liveHub.gameUpdated(companyId, game.roomId, gameId)

      return reply.code(204).send()
    }
  )
}

export default gamesJoinRoutes
