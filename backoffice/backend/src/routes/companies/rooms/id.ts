import type { FastifyPluginAsync } from 'fastify'

import { ROOM_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import { canManageRoomsContext, canReadRoomsContext } from '../../../security/roomsPolicy'
import { isSuperadmin } from '../../../security/companiesPolicy'
import type { RoomRow } from '../../../types/room'

import { roomParamsSchema, updateRoomSchema } from './_schemas'
import { findRoomInCompany, isRoomNameTaken, roomSelect } from './_shared'

const companyRoomIdRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/rooms/:roomId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ROOM, API_ACTION.READ)

      if (!hasPermission) {
        return
      }

      const parsedParams = roomParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, roomId } = parsedParams.data

      if (!canReadRoomsContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const room = await findRoomInCompany(companyId, roomId)

      if (!room || (room.status === ROOM_STATUS_DELETED && !isSuperadmin(req))) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return { room }
    }
  )

  app.patch(
    '/companies/:companyId/rooms/:roomId',
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

      const parsedBody = updateRoomSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, roomId } = parsedParams.data
      const { name, config } = parsedBody.data

      if (!canManageRoomsContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const room = await findRoomInCompany(companyId, roomId)

      if (!room || room.status === ROOM_STATUS_DELETED) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (name !== undefined && (await isRoomNameTaken(companyId, name, roomId))) {
        return reply.code(409).send({ error: 'room_name_already_exists' })
      }

      const updated = await db('rooms')
        .where('id', roomId)
        .update({
          ...(name !== undefined ? { name } : {}),
          ...(config !== undefined ? { config } : {}),
          updated_at: db.fn.now(),
        })
        .returning(roomSelect)

      const updatedRoom = Array.isArray(updated) ? updated[0] : updated

      return { room: updatedRoom as RoomRow }
    }
  )

  app.delete(
    '/companies/:companyId/rooms/:roomId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ROOM, API_ACTION.DELETE)

      if (!hasPermission) {
        return
      }

      const parsedParams = roomParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, roomId } = parsedParams.data

      if (!canManageRoomsContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const room = await findRoomInCompany(companyId, roomId)

      if (!room || room.status === ROOM_STATUS_DELETED) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const updated = await db('rooms')
        .where('id', roomId)
        .update({
          status: ROOM_STATUS_DELETED,
          updated_at: db.fn.now(),
          deleted_at: db.fn.now(),
        })
        .returning(roomSelect)

      const deletedRoom = Array.isArray(updated) ? updated[0] : updated

      return { room: deletedRoom as RoomRow }
    }
  )
}

export default companyRoomIdRoutes
