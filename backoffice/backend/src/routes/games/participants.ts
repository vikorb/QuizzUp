import type { FastifyPluginAsync } from 'fastify'

import { GAME_STATE_PENDING } from '@quizzup/shared'
import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { isUniqueViolation } from '../_shared/dbErrors'
import { gameParamsSchema, participantParamsSchema, participantSchema } from './_schemas'
import {
  findGameState,
  findParticipantByPodium,
  getGameDesksCount,
  insertParticipants,
  maskEmails,
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
        const isAdded = await db.transaction(async (trx): Promise<boolean> => {
          const locked = await trx('games').where('id', gameId).forUpdate().first('state')

          if (locked?.state !== GAME_STATE_PENDING) {
            return false
          }

          await insertParticipants(trx, gameId, [participant])

          return true
        })

        if (!isAdded) {
          return reply.code(409).send({ error: 'game_not_pending' })
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: 'podium_taken' })
        }

        throw error
      }

      const created = await findParticipantByPodium(db, gameId, participant.podium)

      return reply.code(201).send({ participant: maskEmails(created, req) })
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

      return reply.code(204).send()
    }
  )
}

export default gamesParticipantsRoutes
