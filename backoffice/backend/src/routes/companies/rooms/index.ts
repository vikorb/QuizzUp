import type { FastifyPluginAsync } from 'fastify'

import { COMPANY_STATUS_DELETED, ROOM_STATUS_ACTIVE, ROOM_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { isSuperadmin } from '../../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import { canManageRoomsContext, canReadRoomsContext } from '../../../security/roomsPolicy'
import type { RoomRow } from '../../../types/room'

import { isUniqueViolation } from '../../_shared/dbErrors'
import { findCompanyById } from '../_shared'
import { createRoomSchema, roomsParamsSchema } from './_schemas'
import { isRoomNameTaken, roomSelect } from './_shared'

const companyRoomsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/companies/:companyId/rooms', { preHandler: [app.authenticate] }, async (req, reply) => {
    const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ROOM, API_ACTION.LIST)

    if (!hasPermission) {
      return
    }

    const parsedParams = roomsParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const { companyId } = parsedParams.data

    if (!canReadRoomsContext(req, companyId)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const company = await findCompanyById(companyId)

    if (!company) {
      return reply.code(404).send({ error: 'not_found' })
    }

    const query = db('rooms').where('company_id', companyId)

    // Comme pour les thèmes, seules les salles supprimées sont réservées au superadmin.
    if (!isSuperadmin(req)) {
      query.whereNot('status', ROOM_STATUS_DELETED)
    }

    const rooms = await query.select(roomSelect).orderBy('id', 'asc')

    return { rooms: rooms as RoomRow[] }
  })

  app.post(
    '/companies/:companyId/rooms',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ROOM, API_ACTION.CREATE)

      if (!hasPermission) {
        return
      }

      const parsedParams = roomsParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = createRoomSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId } = parsedParams.data
      const { name, config } = parsedBody.data

      if (!canManageRoomsContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const company = await findCompanyById(companyId)

      if (!company) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (Number(company.status) === COMPANY_STATUS_DELETED) {
        return reply.code(409).send({ error: 'company_deleted' })
      }

      if (await isRoomNameTaken(companyId, name)) {
        return reply.code(409).send({ error: 'room_name_already_exists' })
      }

      let inserted

      try {
        inserted = await db('rooms')
          .insert({
            company_id: companyId,
            name,
            config: config ?? {},
            status: ROOM_STATUS_ACTIVE,
            deleted_at: null,
          })
          .returning(roomSelect)
      } catch (error) {
        // Deux créations simultanées du même nom : l'index unique tranche.
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: 'room_name_already_exists' })
        }

        throw error
      }

      const room = Array.isArray(inserted) ? inserted[0] : inserted

      return reply.code(201).send({ room: room as RoomRow })
    }
  )
}

export default companyRoomsRoutes
