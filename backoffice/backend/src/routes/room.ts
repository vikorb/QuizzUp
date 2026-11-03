import type { FastifyPluginAsync } from 'fastify'

import type { FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  ADMIN_ROLE_ROOM,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATUS_DELETED,
  ROOM_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../db'
import type { RoomRow } from '../types/room'
import { roomSelect } from './companies/rooms/_shared'
import { findGameInCompany } from './games/_shared'

const roomGameParamsSchema = z.object({
  gameId: z.coerce.number().int().positive(),
})

function isRoomAccount(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_ROOM && Boolean(req.user.room_id)
}

/** Partie en attente ou en cours de la salle. Les emails restent côté backoffice. */
async function findCurrentRoomGame(req: FastifyRequest) {
  const current = await db('games')
    .where('room_id', req.user.room_id)
    .where('company_id', req.user.company_id)
    .whereIn('state', [GAME_STATE_PENDING, GAME_STATE_RUNNING])
    .whereNot('status', GAME_STATUS_DELETED)
    .first('id')

  if (!current) {
    return null
  }

  const game = await findGameInCompany(req.user.company_id, Number(current.id))

  if (!game) {
    return null
  }

  return {
    ...game,
    participants: (game.participants ?? []).map(({ id, podium, displayName, score }) => ({
      id,
      podium,
      displayName,
      score,
    })),
  }
}

/**
 * Routes du PC de la salle (US-ROOM-02). Elles ne servent qu'aux comptes de
 * rôle `room`, qui n'ont accès à aucune autre route du backoffice.
 */
const roomRoutes: FastifyPluginAsync = async (app) => {
  app.get('/room/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const room = (await db('rooms')
      .where('id', req.user.room_id)
      .where('company_id', req.user.company_id)
      .first(roomSelect)) as RoomRow | undefined

    if (!room || room.status === ROOM_STATUS_DELETED) {
      return reply.code(404).send({ error: 'not_found' })
    }

    const company = await db('companies').where('id', room.companyId).first('id', 'name')

    return { room, company: company ?? null }
  })

  // US-GAME-08 : la salle récupère la partie lancée par l'opérateur…
  app.get('/room/games/current', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    return { game: await findCurrentRoomGame(req) }
  })

  // … puis accuse réception en la démarrant (idempotent si elle tourne déjà).
  app.post('/room/games/:gameId/start', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!isRoomAccount(req)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedParams = roomGameParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const current = await findCurrentRoomGame(req)

    if (!current || Number(current.id) !== parsedParams.data.gameId) {
      return reply.code(404).send({ error: 'game_not_found' })
    }

    if (current.state === GAME_STATE_PENDING) {
      await db('games')
        .where('id', current.id)
        .where('state', GAME_STATE_PENDING)
        .update({ state: GAME_STATE_RUNNING, started_at: db.fn.now(), updated_at: db.fn.now() })
    }

    return { game: await findCurrentRoomGame(req) }
  })
}

export default roomRoutes
