import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import bcrypt from 'bcryptjs'

import { ADMIN_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import {
  canDeleteCompanyAccountContext,
  canReadCompanyAccountContext,
  canUpdateCompanyAccountContext,
} from '../../../security/companiesPolicy'

import { adminParamsSchema, updateAdminSchema } from '../_schemas'
import {
  findAdminInCompany,
  findCompanyById,
  getAdminRow,
  normalizeNullableString,
} from '../_shared'

const companyAdminIdRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/admins/:adminId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY_ACCOUNT,
        API_ACTION.READ,
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = adminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, adminId } = parsedParams.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (!canReadCompanyAccountContext(req, companyId, adminId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const account = await getAdminRow(companyId, adminId)

      if (!account) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return reply.code(200).send({
        account,
      })
    },
  )

  app.patch(
    '/companies/:companyId/admins/:adminId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY_ACCOUNT,
        API_ACTION.UPDATE,
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = adminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateAdminSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, adminId } = parsedParams.data
      const { role, firstname, lastname, username, email, password, status } = parsedBody.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const existingAdmin = await findAdminInCompany(companyId, adminId)

      if (!existingAdmin) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (
        !canUpdateCompanyAccountContext(req, companyId, adminId, existingAdmin, {
          role,
          status,
        })
      ) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      if (email) {
        const existingAdminByEmail = await db('admins')
          .whereRaw('LOWER(email) = ?', [email])
          .whereNot('id', adminId)
          .whereNot('status', ADMIN_STATUS_DELETED)
          .first('id')

        if (existingAdminByEmail) {
          return reply.code(409).send({ error: 'email_already_exists' })
        }
      }

      if (username) {
        const existingAdminByUsername = await db('admins')
          .whereRaw('LOWER(username) = ?', [username.toLowerCase()])
          .whereNot('id', adminId)
          .whereNot('status', ADMIN_STATUS_DELETED)
          .first('id')

        if (existingAdminByUsername) {
          return reply.code(409).send({ error: 'username_already_exists' })
        }
      }

      const updatePayload: Record<string, unknown> = {
        updated_at: db.fn.now(),
      }

      if (role !== undefined) {
        updatePayload.role = role
      }

      if (firstname !== undefined) {
        updatePayload.firstname = normalizeNullableString(firstname)
      }

      if (lastname !== undefined) {
        updatePayload.lastname = normalizeNullableString(lastname)
      }

      if (username !== undefined) {
        updatePayload.username = username
      }

      if (email !== undefined) {
        updatePayload.email = email
      }

      if (password !== undefined) {
        updatePayload.mdp_hash = await bcrypt.hash(password, 12)
      }

      if (status !== undefined) {
        updatePayload.status = status
        updatePayload.deleted_at = status === ADMIN_STATUS_DELETED ? db.fn.now() : null
      }

      await db('admins')
        .where('company_id', companyId)
        .where('id', adminId)
        .update(updatePayload)

      const account = await getAdminRow(companyId, adminId)

      return reply.code(200).send({
        account,
      })
    },
  )

  app.delete(
    '/companies/:companyId/admins/:adminId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY_ACCOUNT,
        API_ACTION.DELETE,
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = adminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, adminId } = parsedParams.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const existingAdmin = await findAdminInCompany(companyId, adminId)

      if (!existingAdmin) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (!canDeleteCompanyAccountContext(req, companyId, existingAdmin)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      await db('admins')
        .where('company_id', companyId)
        .where('id', adminId)
        .update({
          status: ADMIN_STATUS_DELETED,
          updated_at: db.fn.now(),
          deleted_at: db.fn.now(),
        })

      const account = await getAdminRow(companyId, adminId)

      return reply.code(200).send({
        account,
      })
    },
  )
}

export default companyAdminIdRoutes
