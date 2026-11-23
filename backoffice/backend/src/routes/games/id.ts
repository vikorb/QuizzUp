import type { FastifyPluginAsync } from 'fastify'

import {
  GAME_STATE_ABORTED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  getRoomDesksCount,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { isExclusionViolation } from '../_shared/dbErrors'
import { findRoomInCompany } from '../companies/rooms/_shared'
import { gameParamsSchema, updateGameSchema } from './_schemas'
import {
  addMinutes,
  findGameInCompany,
  findStaffGame,
  getSessionWindowError,
  insertParticipants,
  MINUTE_MS,
} from './_shared'

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

      const game = await findStaffGame(req, companyId, gameId)

      if (!game) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return { game }
    }
  )

  // Seule une session `scheduled` se modifie ; les champs absents sont gardés.
  app.patch(
    '/companies/:companyId/games/:gameId',
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

      const parsedBody = updateGameSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, gameId } = parsedParams.data
      const body = parsedBody.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const game = await findGameInCompany(companyId, gameId)

      if (!game) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (game.state !== GAME_STATE_SCHEDULED) {
        return reply.code(409).send({ error: 'game_not_scheduled' })
      }

      const isRoomChanged = body.roomId !== undefined && body.roomId !== game.roomId

      if (isRoomChanged || body.participants) {
        const room = await findRoomInCompany(companyId, body.roomId ?? game.roomId)

        if (!room) {
          return reply.code(404).send({ error: 'room_not_found' })
        }

        if (isRoomChanged && room.status !== ROOM_STATUS_ACTIVE) {
          return reply.code(409).send({ error: 'room_inactive' })
        }

        // Une salle de 4 pupitres n'a pas de pupitre 5 : le nombre vient de `rooms.config`.
        const desksCount = getRoomDesksCount(room.config)
        const podiums = (body.participants ?? game.participants ?? []).map((item) => item.podium)

        if (podiums.some((podium) => podium > desksCount)) {
          return reply.code(400).send({ error: 'podium_not_in_room', desksCount })
        }
      }

      // Début ou durée absents : on garde ceux de la session.
      const currentStart = new Date(game.scheduledAt as string)
      const currentMinutes = Math.round(
        (new Date(game.scheduledEndAt as string).getTime() - currentStart.getTime()) / MINUTE_MS
      )
      const startsAt = body.scheduledAt ? new Date(body.scheduledAt) : currentStart
      const endsAt = addMinutes(startsAt, body.durationMinutes ?? currentMinutes)

      if (body.scheduledAt || body.durationMinutes) {
        const windowError = getSessionWindowError(startsAt, endsAt)

        if (windowError) {
          return reply.code(400).send({ error: windowError })
        }
      }

      const changes = {
        room_id: body.roomId,
        scheduled_at: startsAt.toISOString(),
        scheduled_end_at: endsAt.toISOString(),
        rounds_count: body.roundsCount,
        questions_per_round: body.questionsPerRound,
        mini_games: body.miniGames ? JSON.stringify(body.miniGames) : body.miniGames,
        players_count: body.playersCount,
        external_ref: body.externalRef,
        locale: body.locale,
        updated_at: db.fn.now(),
      }

      try {
        const isUpdated = await db.transaction(async (trx) => {
          const updated = await trx('games')
            .where('id', gameId)
            .where('state', GAME_STATE_SCHEDULED)
            .update(
              Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
            )

          // Ouverte ou annulée entre la lecture et l'écriture : rien ne change.
          if (updated === 0) {
            return false
          }

          if (body.participants) {
            await trx('game_participants').where('game_id', gameId).delete()
            await insertParticipants(trx, gameId, body.participants)
          }

          return true
        })

        if (!isUpdated) {
          return reply.code(409).send({ error: 'game_not_scheduled' })
        }
      } catch (error) {
        // Une autre session de la salle occupe déjà ce créneau : la contrainte d'exclusion tranche.
        if (isExclusionViolation(error)) {
          return reply.code(409).send({ error: 'slot_taken' })
        }

        throw error
      }

      return { game: await findStaffGame(req, companyId, gameId) }
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

      await db('games')
        .where('id', gameId)
        .whereIn('state', [GAME_STATE_PENDING, GAME_STATE_RUNNING])
        .update({
          state: GAME_STATE_ABORTED,
          finished_at: db.fn.now(),
          updated_at: db.fn.now(),
        })

      return { game: await findStaffGame(req, companyId, gameId) }
    }
  )
}

export default gamesIdRoutes
