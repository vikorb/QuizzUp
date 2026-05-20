import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import bcrypt from 'bcryptjs'

import { ADMIN_STATUS_ACTIVE, ADMIN_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import {
  canCreateCompanyAccountContext,
  canListCompanyAccountsContext,
} from '../../../security/companiesPolicy'
import type { AdminRow } from '../../../types/admin'

import { companyAdminParamsSchema, createAdminSchema } from '../_schemas'
import {
  adminSelect,
  findCompanyById,
  getAdminRow,
  normalizeNullableString,
} from '../_shared'

const companyAdminsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/admins',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY_ACCOUNT,
        API_ACTION.LIST,
      )

      if (!hasPermission) {
        return
      }

      const parsed = companyAdminParamsSchema.safeParse(req.params)

      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId } = parsed.data

      if (!canListCompanyAccountsContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const company = await findCompanyById(companyId)

      if (!company) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const accounts = await db('admins')
        .where('company_id', companyId)
        .select(adminSelect)
        .orderBy('id', 'asc')

      return {
        accounts: accounts as AdminRow[],
      }
    },
  )

  app.post(
    '/companies/:companyId/admins',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY_ACCOUNT,
        API_ACTION.CREATE,
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = companyAdminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = createAdminSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId } = parsedParams.data
      const { role, firstname, lastname, username, email, password } = parsedBody.data

      if (!canCreateCompanyAccountContext(req, companyId, role)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const existingAdminByEmail = await db('admins')
        .whereRaw('LOWER(email) = ?', [email])
        .whereNot('status', ADMIN_STATUS_DELETED)
        .first('id')

      if (existingAdminByEmail) {
        return reply.code(409).send({ error: 'email_already_exists' })
      }

      const existingAdminByUsername = await db('admins')
        .whereRaw('LOWER(username) = ?', [username.toLowerCase()])
        .whereNot('status', ADMIN_STATUS_DELETED)
        .first('id')

      if (existingAdminByUsername) {
        return reply.code(409).send({ error: 'username_already_exists' })
      }

      const passwordHash = await bcrypt.hash(password, 12)

      const inserted = await db('admins')
        .insert({
          company_id: companyId,
          role,
          firstname: normalizeNullableString(firstname),
          lastname: normalizeNullableString(lastname),
          username,
          email,
          mdp_hash: passwordHash,
          status: ADMIN_STATUS_ACTIVE,
          deleted_at: null,
        })
        .returning('id')

      const insertedAdmin = Array.isArray(inserted) ? inserted[0] : inserted
      const adminId = Number(typeof insertedAdmin === 'object' ? insertedAdmin.id : insertedAdmin)

      const account = await getAdminRow(companyId, adminId)

      return reply.code(201).send({
        account,
      })
    },
  )
}

export default companyAdminsRoutes
