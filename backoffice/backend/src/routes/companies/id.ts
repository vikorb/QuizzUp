import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { ADMIN_STATUS_DELETED, COMPANY_STATUS_DELETED } from '@quizzup/shared'
import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import {
  canAccessCompanyContext,
  canUpdateCompanyContext,
  isSuperadmin,
} from '../../security/companiesPolicy'
import type { CompanyRow, CompanyUpdateBody } from '../../types/company'

import { paramsSchema, updateCompanySchema } from './_schemas'
import { companySelect, findCompanyById, getCompanyAdminsCount } from './_shared'

const companiesIdRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:id',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY,
        API_ACTION.READ,
      )

      if (!hasPermission) {
        return
      }

      const parsed = paramsSchema.safeParse(req.params)

      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { id } = parsed.data

      if (!canAccessCompanyContext(req, id)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const company = await db('companies')
        .leftJoin('admins', function joinAdmins() {
          this.on('admins.company_id', '=', 'companies.id').andOn(
            db.raw('admins.status <> ?', [ADMIN_STATUS_DELETED]),
          )
        })
        .where('companies.id', id)
        .groupBy('companies.id')
        .select(companySelect)
        .first()

      if (!company) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return { company: company as CompanyRow }
    },
  )

  app.patch<{ Body: CompanyUpdateBody }>(
    '/companies/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY,
        API_ACTION.UPDATE,
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = paramsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateCompanySchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { id } = parsedParams.data
      const { name, email, status } = parsedBody.data

      if (!canUpdateCompanyContext(req, id)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const existingCompany = await findCompanyById(id)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (!isSuperadmin(req) && status !== undefined && status !== existingCompany.status) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      if (email) {
        const existingCompanyByEmail = await db('companies')
          .whereRaw('LOWER(email) = ?', [email])
          .whereNot('id', id)
          .first('id')

        if (existingCompanyByEmail) {
          return reply.code(409).send({ error: 'email_already_exists' })
        }
      }

      if (name) {
        const existingCompanyByName = await db('companies')
          .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
          .whereNot('id', id)
          .first('id')

        if (existingCompanyByName) {
          return reply.code(409).send({ error: 'name_already_exists' })
        }
      }

      const updatePayload: Record<string, unknown> = {
        updated_at: db.fn.now(),
      }

      if (name !== undefined) {
        updatePayload.name = name
      }

      if (email !== undefined) {
        updatePayload.email = email
      }

      if (status !== undefined && isSuperadmin(req)) {
        updatePayload.status = status
        updatePayload.deleted_at = status === COMPANY_STATUS_DELETED ? db.fn.now() : null
      }

      const updated = await db('companies')
        .where('id', id)
        .update(updatePayload)
        .returning([
          'id',
          'name',
          'email',
          'status',
          'created_at as createdAt',
          'updated_at as updatedAt',
          'deleted_at as deletedAt',
        ])

      const updatedCompanyBase = Array.isArray(updated) ? updated[0] : updated
      const accountsCount = await getCompanyAdminsCount(id)

      return reply.code(200).send({
        company: {
          ...updatedCompanyBase,
          accountsCount,
        } satisfies CompanyRow,
      })
    },
  )
}

export default companiesIdRoutes
