import type { FastifyPluginAsync } from 'fastify'

import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATUS_ACTIVE,
  GAME_STATUS_DELETED,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import db from '../db'
import { canAccessCompanyContext } from '../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../security/permissions'
import { requireApiPermission } from '../security/requireApiPermission'
import { getCurrentAdminId } from './_shared/adminContext'
import { isUniqueViolation } from './_shared/dbErrors'
import { findCompanyById } from './companies/_shared'
import { findRoomInCompany } from './companies/rooms/_shared'
import { createGameSchema, gamesParamsSchema } from './games/_schemas'
import { drawGameSeed, findStaffGame, gameSelect, toGameRow } from './games/_shared'
import gamesIdRoutes from './games/id'

/** Parties d'une compagnie, lancées par l'opérateur depuis le backoffice (US-GAME-08). */
const gamesRoutes: FastifyPluginAsync = async (app) => {
  app.register(gamesIdRoutes)

  app.get('/companies/:companyId/games', { preHandler: [app.authenticate] }, async (req, reply) => {
    const hasPermission = requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.LIST)

    if (!hasPermission) {
      return
    }

    const parsedParams = gamesParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const { companyId } = parsedParams.data

    if (!canAccessCompanyContext(req, companyId)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const games = await db('games')
      .join('rooms', 'rooms.id', 'games.room_id')
      .where('games.company_id', companyId)
      .whereNot('games.status', GAME_STATUS_DELETED)
      .select([
        ...gameSelect,
        db.raw(
          '(SELECT COUNT(*)::int FROM game_participants WHERE game_participants.game_id = games.id) as "participantsCount"'
        ),
      ])
      .orderBy('games.id', 'desc')

    return { games: games.map((game) => toGameRow(game)) }
  })

  app.post(
    '/companies/:companyId/games',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.GAME, API_ACTION.CREATE)

      if (!hasPermission) {
        return
      }

      const parsedParams = gamesParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = createGameSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId } = parsedParams.data
      const { roomId, roundsCount, questionsPerRound, participants, miniGames } = parsedBody.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const company = await findCompanyById(companyId)

      if (!company) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (Number(company.status) === COMPANY_STATUS_DELETED) {
        return reply.code(409).send({ error: 'company_deleted' })
      }

      // Le PC d'une salle d'une compagnie inactive est déconnecté : la partie resterait en attente.
      if (Number(company.status) !== COMPANY_STATUS_ACTIVE) {
        return reply.code(409).send({ error: 'company_inactive' })
      }

      const room = await findRoomInCompany(companyId, roomId)

      if (!room) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      if (room.status !== ROOM_STATUS_ACTIVE) {
        return reply.code(409).send({ error: 'room_inactive' })
      }

      const busyGame = await db('games')
        .where('room_id', roomId)
        .whereIn('state', [GAME_STATE_PENDING, GAME_STATE_RUNNING])
        .whereNot('status', GAME_STATUS_DELETED)
        .first('id')

      if (busyGame) {
        return reply.code(409).send({ error: 'room_busy' })
      }

      let gameId: number

      try {
        // La partie et ses participants sont créés ensemble : rien en base si l'un échoue.
        gameId = await db.transaction(async (trx) => {
          const inserted = await trx('games')
            .insert({
              company_id: companyId,
              room_id: roomId,
              admin_id: getCurrentAdminId(req),
              rounds_count: roundsCount,
              questions_per_round: questionsPerRound,
              mini_games: miniGames ? JSON.stringify(miniGames) : null,
              seed: drawGameSeed(),
              state: GAME_STATE_PENDING,
              status: GAME_STATUS_ACTIVE,
              deleted_at: null,
            })
            .returning(['id'])
          const createdId = Number((Array.isArray(inserted) ? inserted[0] : inserted)?.id)

          await trx('game_participants').insert(
            participants.map((participant) => {
              const email = participant.email ?? null
              const second = participant.secondPlayer ?? null
              const secondEmail = second?.email ?? null

              return {
                game_id: createdId,
                podium: participant.podium,
                display_name: participant.displayName,
                email,
                consent_at: email ? db.fn.now() : null,
                second_display_name: second?.displayName ?? null,
                second_email: secondEmail,
                second_consent_at: secondEmail ? db.fn.now() : null,
              }
            })
          )

          return createdId
        })
      } catch (error) {
        // Deux lancements simultanés dans la même salle : l'index unique tranche.
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: 'room_busy' })
        }

        throw error
      }

      const game = await findStaffGame(req, companyId, gameId)

      return reply.code(201).send({ game })
    }
  )
}

export default gamesRoutes
