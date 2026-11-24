import type { FastifyPluginAsync } from 'fastify'

import { GAME_STATE_PENDING, GAME_STATUS_DELETED } from '@quizzup/shared'
import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { isUniqueViolation } from '../_shared/dbErrors'
import { acceptRegistrationSchema, gameParamsSchema, registrationParamsSchema } from './_schemas'
import {
  findGameState,
  getGameDesksCount,
  maskEmails,
  participantSelect,
  type ParticipantDbRow,
  registrationSelect,
  toParticipant,
  toRegistration,
} from './_shared'

type AcceptOutcome =
  { participant: ParticipantDbRow } | { status: number; body: Record<string, unknown> }

/**
 * Demandes d'inscription faites depuis les téléphones (lot 2). Le personnel les valide (la ligne
 * devient un participant, au pupitre choisi) ou les refuse (la ligne est supprimée). Rien n'est
 * joué sans cette validation.
 */
const gamesRegistrationsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/games/:gameId/registrations',
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

      if (!(await findGameState(companyId, gameId))) {
        return reply.code(404).send({ error: 'not_found' })
      }

      // Les plus anciennes d'abord : le personnel les traite dans l'ordre d'arrivée.
      const rows = await db('game_registrations')
        .where('game_id', gameId)
        .select(registrationSelect)
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')

      return { registrations: rows.map((row) => maskEmails(toRegistration(row), req)) }
    }
  )

  app.post(
    '/companies/:companyId/games/:gameId/registrations/:registrationId/accept',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.UPDATE)

      if (!hasPermission) {
        return
      }

      const parsedParams = registrationParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = acceptRegistrationSchema.safeParse(req.body ?? {})

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, gameId, registrationId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const known = await findGameState(companyId, gameId)

      if (!known) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const desksCount = await getGameDesksCount(companyId, known.roomId)
      const requestedPodium = parsedBody.data.podium

      if (requestedPodium && requestedPodium > desksCount) {
        return reply.code(400).send({ error: 'podium_not_in_room', desksCount })
      }

      try {
        const outcome = await db.transaction(async (trx): Promise<AcceptOutcome> => {
          // Verrou de la partie : deux validations simultanées passent l'une après l'autre, donc
          // « le plus petit pupitre libre » ne peut pas être pris deux fois.
          const game = await trx('games')
            .where('id', gameId)
            .where('company_id', companyId)
            .whereNot('status', GAME_STATUS_DELETED)
            .forUpdate()
            .first('state')

          if (!game) {
            return { status: 404, body: { error: 'not_found' } }
          }

          if (game.state !== GAME_STATE_PENDING) {
            return { status: 409, body: { error: 'game_not_pending' } }
          }

          const registration = await trx('game_registrations')
            .where('id', registrationId)
            .where('game_id', gameId)
            .first()

          if (!registration) {
            return { status: 404, body: { error: 'registration_not_found' } }
          }

          const rows = await trx('game_participants').where('game_id', gameId).select('podium')
          const taken = new Set(rows.map((row) => Number(row.podium)))
          let podium = requestedPodium

          if (podium === undefined) {
            const desks = Array.from({ length: desksCount }, (_, index) => index + 1)

            podium = desks.find((desk) => !taken.has(desk))

            if (podium === undefined) {
              return { status: 409, body: { error: 'room_full' } }
            }
          } else if (taken.has(podium)) {
            return { status: 409, body: { error: 'podium_taken' } }
          }

          // Le participant est lu par l'INSERT lui-même : une relecture après le commit pourrait
          // tomber sur un retrait simultané.
          const [participant] = (await trx('game_participants')
            .insert({
              game_id: gameId,
              podium,
              display_name: registration.display_name,
              email: registration.email,
              consent_at: registration.consent_at,
              marketing_consent_at: registration.marketing_consent_at,
              second_display_name: registration.second_display_name,
              second_email: registration.second_email,
              second_consent_at: registration.second_consent_at,
              second_marketing_consent_at: registration.second_marketing_consent_at,
            })
            .returning(participantSelect)) as ParticipantDbRow[]
          await trx('game_registrations').where('id', registrationId).delete()

          return { participant: participant! }
        })

        if ('status' in outcome) {
          return reply.code(outcome.status).send(outcome.body)
        }

        return reply
          .code(201)
          .send({ participant: maskEmails(toParticipant(outcome.participant), req) })
      } catch (error) {
        // Le verrou rend ce cas rare ; l'index unique reste le dernier arbitre du pupitre.
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: 'podium_taken' })
        }

        throw error
      }
    }
  )

  app.delete(
    '/companies/:companyId/games/:gameId/registrations/:registrationId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.UPDATE)

      if (!hasPermission) {
        return
      }

      const parsedParams = registrationParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, gameId, registrationId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      if (!(await findGameState(companyId, gameId))) {
        return reply.code(404).send({ error: 'not_found' })
      }

      // Refus : suppression définitive, aucune trace de la demande ne reste.
      const deleted = await db('game_registrations')
        .where('id', registrationId)
        .where('game_id', gameId)
        .delete()

      if (deleted === 0) {
        return reply.code(404).send({ error: 'registration_not_found' })
      }

      return reply.code(204).send()
    }
  )
}

export default gamesRegistrationsRoutes
