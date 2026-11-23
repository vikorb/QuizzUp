import type { FastifyPluginAsync } from 'fastify'

import { ROOM_STATUS_DELETED, type RoomLog } from '@quizzup/shared'
import db from '../../../db'
import { isSuperadmin } from '../../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import { canReadRoomsContext } from '../../../security/roomsPolicy'

import { roomLogsQuerySchema, roomParamsSchema } from './_schemas'
import { findRoomInCompany, roomLogSelect } from './_shared'

/** Journaux d'erreurs d'une salle (lot 7e), pour l'admin de la compagnie et le superadmin. */
const companyRoomLogsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/rooms/:roomId/logs',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ROOM_LOG, API_ACTION.LIST)

      if (!hasPermission) {
        return
      }

      const parsedParams = roomParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedQuery = roomLogsQuerySchema.safeParse(req.query)

      if (!parsedQuery.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_query', details: parsedQuery.error.flatten() })
      }

      const { companyId, roomId } = parsedParams.data
      const { level, before, limit } = parsedQuery.data

      if (!canReadRoomsContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const room = await findRoomInCompany(companyId, roomId)

      // Comme pour la liste des salles, une salle supprimée n'est visible que du superadmin.
      if (!room || (room.status === ROOM_STATUS_DELETED && !isSuperadmin(req))) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const query = db('room_logs').where('company_id', companyId).where('room_id', roomId)

      if (level) {
        query.where('level', level)
      }

      if (before) {
        query.where('id', '<', before)
      }

      const logs = await query.orderBy('id', 'desc').limit(limit).select(roomLogSelect)

      return { logs: logs as RoomLog[] }
    }
  )
}

export default companyRoomLogsRoutes
