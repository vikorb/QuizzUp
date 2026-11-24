import { GAME_STATE_PENDING } from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { isUniqueViolation } from '../_shared/dbErrors'
import { gameParamsSchema, participantParamsSchema, participantSchema } from './_schemas'
import {
  findGameState,
  getGameDesksCount,
  insertParticipants,
  maskEmails,
  type ParticipantDbRow,
  toParticipant,
} from './_shared'

/**
 * Participants d'une partie en attente (lot 2) : le personnel ajoute un joueur au comptoir ou
 * en retire un, tant que la partie n'est pas lancée.
 */
const gamesParticipantsRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/games/:gameId/participants',
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

      const parsedBody = participantSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, gameId } = parsedParams.data
      const participant = parsedBody.data

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

      // Une salle de 4 pupitres n'a pas de pupitre 5 : le nombre vient de `rooms.config`.
      const desksCount = await getGameDesksCount(companyId, game.roomId)

      if (participant.podium > desksCount) {
        return reply.code(400).send({ error: 'podium_not_in_room', desksCount })
      }

      try {
        // Verrou de la partie : un lancement simultané ne laisse pas entrer un joueur en cours de
        // partie. Le pupitre déjà pris est refusé par l'index unique (partie, pupitre).
        // Le participant est lu par l'INSERT lui-même : une relecture après le commit pourrait
        // tomber sur un retrait simultané.
        const created = await db.transaction(async (trx): Promise<ParticipantDbRow | null> => {
          const locked = await trx('games')
            .where('id', gameId)
            .forUpdate()
            .first(['state', 'kids_mode as kidsMode'])

          if (locked?.state !== GAME_STATE_PENDING) {
            return null
          }

          const [row] = await insertParticipants(
            trx,
            gameId,
            [participant],
            Boolean(locked.kidsMode)
          )

          return row!
        })

        if (!created) {
          return reply.code(409).send({ error: 'game_not_pending' })
        }

        app.liveHub.gameUpdated(companyId, game.roomId, gameId)

        return reply.code(201).send({ participant: maskEmails(toParticipant(created), req) })
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: 'podium_taken' })
        }

        throw error
      }
    }
  )

  app.delete(
    '/companies/:companyId/games/:gameId/participants/:participantId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.UPDATE)

      if (!hasPermission) {
        return
      }

      const parsedParams = participantParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, gameId, participantId } = parsedParams.data

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

      // Même verrou : un joueur ne disparaît pas d'une partie qui vient d'être lancée.
      const deleted = await db.transaction(async (trx): Promise<number | null> => {
        const locked = await trx('games').where('id', gameId).forUpdate().first('state')

        if (locked?.state !== GAME_STATE_PENDING) {
          return null
        }

        return trx('game_participants').where('id', participantId).where('game_id', gameId).delete()
      })

      if (deleted === null) {
        return reply.code(409).send({ error: 'game_not_pending' })
      }

      if (deleted === 0) {
        return reply.code(404).send({ error: 'participant_not_found' })
      }

      app.liveHub.gameUpdated(companyId, game.roomId, gameId)

      return reply.code(204).send()
    }
  )
}

export default gamesParticipantsRoutes
