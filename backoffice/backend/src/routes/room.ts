import type { FastifyPluginAsync } from 'fastify'

import { ADMIN_ROLE_ROOM, ROOM_STATUS_DELETED } from '@quizzup/shared'
import db from '../db'
import type { RoomRow } from '../types/room'
import { roomSelect } from './companies/rooms/_shared'

/**
 * Routes du PC de la salle (US-ROOM-02). Elles ne servent qu'aux comptes de
 * rôle `room`, qui n'ont accès à aucune autre route du backoffice.
 */
const roomRoutes: FastifyPluginAsync = async (app) => {
  app.get('/room/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.role !== ADMIN_ROLE_ROOM || !req.user.room_id) {
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
}

export default roomRoutes
