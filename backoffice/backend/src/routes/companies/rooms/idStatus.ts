import type { FastifyPluginAsync } from 'fastify'

import { ROOM_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import { canManageRoomsContext } from '../../../security/roomsPolicy'
import type { RoomRow } from '../../../types/room'

import { roomParamsSchema, updateRoomStatusSchema } from './_schemas'
import { findRoomInCompany, isRoomNameTaken, roomSelect } from './_shared'

const companyRoomIdStatusRoutes: FastifyPluginAsync = async (app) => {
  app.patch(
    '/companies/:companyId/rooms/:roomId/status',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.ROOM,
        API_ACTION.UPDATE_STATUS
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = roomParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateRoomStatusSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, roomId } = parsedParams.data
      const { status } = parsedBody.data

      if (!canManageRoomsContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const room = await findRoomInCompany(companyId, roomId)

      if (!room) {
        return reply.code(404).send({ error: 'not_found' })
      }

      // Restaurer une salle supprimée ne doit pas créer de doublon de nom.
      if (
        room.status === ROOM_STATUS_DELETED &&
        status !== ROOM_STATUS_DELETED &&
        (await isRoomNameTaken(companyId, room.name, roomId))
      ) {
        return reply.code(409).send({ error: 'room_name_already_exists' })
      }

      const updated = await db('rooms')
        .where('id', roomId)
        .update({
          status,
          updated_at: db.fn.now(),
          deleted_at: status === ROOM_STATUS_DELETED ? db.fn.now() : null,
        })
        .returning(roomSelect)

      const updatedRoom = Array.isArray(updated) ? updated[0] : updated

      return { room: updatedRoom as RoomRow }
    }
  )
}

export default companyRoomIdStatusRoutes
