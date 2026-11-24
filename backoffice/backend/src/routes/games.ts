import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  GAME_STATE_PENDING,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_DELETED,
  getRoomDesksCount,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../db'
import { canAccessCompanyContext } from '../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../security/permissions'
import { requireApiPermission } from '../security/requireApiPermission'
import { getCurrentAdminId } from './_shared/adminContext'
import { isExclusionViolation, isUniqueViolation } from './_shared/dbErrors'
import { findCompanyById } from './companies/_shared'
import { findRoomInCompany } from './companies/rooms/_shared'
import { createGameSchema, gamesListQuerySchema, gamesParamsSchema } from './games/_schemas'
import {
  addGameListFields,
  addMinutes,
  findStaffGameWithJoin,
  GAME_DATE_SQL,
  gameSelect,
  generateJoinToken,
  getJoinExpiry,
  getRoomSlotMinutes,
  getSessionWindowError,
  insertGameWithParticipants,
  toGameRow,
} from './games/_shared'
import gamesIdRoutes from './games/id'
import gamesIdCancelRoutes from './games/idCancel'
import gamesIdOpenRoutes from './games/idOpen'
import gamesJoinRoutes from './games/join'
import gamesParticipantsRoutes from './games/participants'
import gamesRegistrationsRoutes from './games/registrations'

/** Parties d'une compagnie, lancées par l'opérateur depuis le backoffice (US-GAME-08). */
const gamesRoutes: FastifyPluginAsync = async (app) => {
  app.register(gamesIdRoutes)
  app.register(gamesIdOpenRoutes)
  app.register(gamesIdCancelRoutes)
  app.register(gamesJoinRoutes)
  app.register(gamesRegistrationsRoutes)
  app.register(gamesParticipantsRoutes)

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

    const parsedQuery = gamesListQuerySchema.safeParse(req.query)

    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const { state, roomId, from, to, limit, offset } = parsedQuery.data

    // Même filtre pour la page et pour le total : `total` ne dépend pas de la page demandée.
    const filteredGames = () => {
      const query = db('games')
        .join('rooms', 'rooms.id', 'games.room_id')
        .where('games.company_id', companyId)
        .whereNot('games.status', GAME_STATUS_DELETED)

      if (state) {
        query.where('games.state', state)
      }

      if (roomId) {
        query.where('games.room_id', roomId)
      }

      if (from) {
        query.whereRaw(`${GAME_DATE_SQL} >= ?`, [from])
      }

      if (to) {
        // `to` est exclu : intervalle semi-ouvert, deux périodes consécutives ne se recoupent pas.
        query.whereRaw(`${GAME_DATE_SQL} < ?`, [to])
      }

      return query
    }

    const [{ count }] = await filteredGames().count({ count: '*' })
    // Date de la partie, puis id : l'id départage les égalités, donc deux pages ne se chevauchent jamais.
    const rows = await filteredGames()
      .select(gameSelect)
      .orderByRaw(`${GAME_DATE_SQL} desc`)
      .orderBy('games.id', 'desc')
      .limit(limit)
      .offset(offset)

    return {
      games: await addGameListFields(rows.map((game) => toGameRow(game))),
      total: Number(count),
    }
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
      const {
        roomId,
        format,
        roundsCount,
        questionsPerRound,
        participants,
        openJoin,
        miniGames,
        scheduledAt,
        playersCount,
        externalRef,
        locale,
        kidsMode,
      } = parsedBody.data

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

      // Une salle de 4 pupitres n'a pas de pupitre 5 : le nombre vient de `rooms.config`.
      const desksCount = getRoomDesksCount(room.config)

      if (participants.some((participant) => participant.podium > desksCount)) {
        return reply.code(400).send({ error: 'podium_not_in_room', desksCount })
      }

      let schedule: { startsAt: Date; endsAt: Date } | undefined

      if (scheduledAt) {
        const startsAt = new Date(scheduledAt)
        const durationMinutes =
          parsedBody.data.durationMinutes ?? (await getRoomSlotMinutes(roomId))
        const endsAt = addMinutes(startsAt, durationMinutes)
        const windowError = getSessionWindowError(startsAt, endsAt)

        if (windowError) {
          return reply.code(400).send({ error: windowError })
        }

        schedule = { startsAt, endsAt }
      } else {
        // Une session programmée ne prend pas la salle tout de suite : seul `open` contrôle `room_busy`.
        // Seule une partie en attente bloque : une partie en cours n'empêche pas de préparer la suivante.
        const busyGame = await db('games')
          .where('room_id', roomId)
          .where('state', GAME_STATE_PENDING)
          .whereNot('status', GAME_STATUS_DELETED)
          .first('id')

        if (busyGame) {
          return reply.code(409).send({ error: 'room_busy' })
        }
      }

      let gameId: number

      try {
        gameId = await db.transaction((trx) =>
          insertGameWithParticipants(
            trx,
            {
              companyId,
              roomId,
              adminId: getCurrentAdminId(req),
              format,
              roundsCount,
              questionsPerRound,
              miniGames,
              state: schedule ? GAME_STATE_SCHEDULED : GAME_STATE_PENDING,
              schedule,
              playersCount,
              externalRef,
              locale,
              kidsMode,
              join:
                openJoin && !schedule
                  ? { token: generateJoinToken(), expiresAt: getJoinExpiry() }
                  : undefined,
            },
            participants
          )
        )
      } catch (error) {
        // Deux lancements simultanés dans la même salle : l'index unique des parties en attente tranche.
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: 'room_busy' })
        }

        // Deux sessions simultanées sur le même créneau : la contrainte d'exclusion tranche.
        if (isExclusionViolation(error)) {
          return reply.code(409).send({ error: 'slot_taken' })
        }

        throw error
      }

      const game = await findStaffGameWithJoin(req, companyId, gameId)

      app.liveHub.gameUpdated(companyId, roomId, gameId)

      return reply.code(201).send({ game })
    }
  )
}

export default gamesRoutes
