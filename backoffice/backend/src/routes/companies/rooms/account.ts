import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'

import { ADMIN_ROLE_ROOM, ADMIN_STATUS_ACTIVE, ROOM_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import { canManageRoomsContext } from '../../../security/roomsPolicy'
import { isUniqueViolation } from '../../_shared/dbErrors'

import {
  buildRoomAccountEmail,
  deleteRoomAccount,
  findRoomAccount,
  roomAccountSelect,
  type RoomAccountRow,
} from './_account'
import { createRoomAccountSchema, roomParamsSchema } from './_schemas'
import { findRoomInCompany, isRoomCompanyDeleted } from './_shared'

const ROOM_ACCOUNT_URL = '/companies/:companyId/rooms/:roomId/account'

const companyRoomAccountRoutes: FastifyPluginAsync = async (app) => {
  app.get(ROOM_ACCOUNT_URL, { preHandler: [app.authenticate] }, async (req, reply) => {
    const hasPermission = requireApiPermission(
      req,
      reply,
      API_RESOURCE.ROOM_ACCOUNT,
      API_ACTION.READ
    )

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

    if (!room) {
      return reply.code(404).send({ error: 'not_found' })
    }

    const account = await findRoomAccount(roomId)

    return { account: account ?? null }
  })

  app.post(ROOM_ACCOUNT_URL, { preHandler: [app.authenticate] }, async (req, reply) => {
    const hasPermission = requireApiPermission(
      req,
      reply,
      API_RESOURCE.ROOM_ACCOUNT,
      API_ACTION.CREATE
    )

    if (!hasPermission) {
      return
    }

    const parsedParams = roomParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const parsedBody = createRoomAccountSchema.safeParse(req.body)

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        details: parsedBody.error.flatten(),
      })
    }

    const { companyId, roomId } = parsedParams.data
    const { username, password } = parsedBody.data

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

    if (await findRoomAccount(roomId)) {
      return reply.code(409).send({ error: 'room_account_already_exists' })
    }

    // L'index `admins_username_unique_ci` porte aussi sur les comptes supprimés.
    const existingUsername = await db('admins')
      .whereRaw('LOWER(username) = ?', [username.toLowerCase()])
      .first('id')

    if (existingUsername) {
      return reply.code(409).send({ error: 'username_already_exists' })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    let inserted

    try {
      inserted = await db('admins')
        .insert({
          company_id: companyId,
          room_id: roomId,
          role: ADMIN_ROLE_ROOM,
          firstname: null,
          lastname: null,
          username,
          email: buildRoomAccountEmail(),
          mdp_hash: passwordHash,
          status: ADMIN_STATUS_ACTIVE,
          deleted_at: null,
        })
        .returning(roomAccountSelect)
    } catch (error) {
      // Créations simultanées : `admins_room_id_unique` ou `admins_username_unique_ci` tranche.
      if (isUniqueViolation(error)) {
        const constraint = String((error as { constraint?: string }).constraint ?? '')

        return reply.code(409).send({
          error: constraint.includes('username')
            ? 'username_already_exists'
            : 'room_account_already_exists',
        })
      }

      throw error
    }

    const account = Array.isArray(inserted) ? inserted[0] : inserted

    return reply.code(201).send({ account: account as RoomAccountRow })
  })

  app.delete(ROOM_ACCOUNT_URL, { preHandler: [app.authenticate] }, async (req, reply) => {
    const hasPermission = requireApiPermission(
      req,
      reply,
      API_RESOURCE.ROOM_ACCOUNT,
      API_ACTION.DELETE
    )

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

    if (!room) {
      return reply.code(404).send({ error: 'not_found' })
    }

    const deletedAccountId = await deleteRoomAccount(roomId)

    if (deletedAccountId === null) {
      return reply.code(404).send({ error: 'room_account_not_found' })
    }

    return { ok: true }
  })
}

export default companyRoomAccountRoutes
