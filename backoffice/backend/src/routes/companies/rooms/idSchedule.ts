import type { FastifyPluginAsync } from 'fastify'

import { ROOM_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import { canManageRoomsContext } from '../../../security/roomsPolicy'
import type { RoomRow } from '../../../types/room'

import { roomParamsSchema, updateRoomScheduleSchema } from './_schemas'
import { findRoomInCompany, isRoomCompanyDeleted, roomSelect } from './_shared'

const companyRoomIdScheduleRoutes: FastifyPluginAsync = async (app) => {
  // Réglages de créneaux : propres à l'admin, distincts de `config` (qui appartient au PC de salle).
  app.put(
    '/companies/:companyId/rooms/:roomId/schedule',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ROOM, API_ACTION.UPDATE)

      if (!hasPermission) {
        return
      }

      const parsedParams = roomParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateRoomScheduleSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, roomId } = parsedParams.data

      if (!canManageRoomsContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const room = await findRoomInCompany(companyId, roomId)

      if (!room || room.status === ROOM_STATUS_DELETED) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (await isRoomCompanyDeleted(companyId)) {
        return reply.code(409).send({ error: 'company_deleted' })
      }

      const updated = await db('rooms')
        .where('id', roomId)
        .where('company_id', companyId)
        .whereNot('status', ROOM_STATUS_DELETED)
        .update({ schedule: parsedBody.data.schedule, updated_at: db.fn.now() })
        .returning(roomSelect)
      const updatedRoom = Array.isArray(updated) ? updated[0] : updated

      // Salle supprimée entre la lecture et l'écriture.
      if (!updatedRoom) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return { room: updatedRoom as RoomRow }
    }
  )
}

export default companyRoomIdScheduleRoutes
