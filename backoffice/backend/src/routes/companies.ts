import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { ADMIN_STATUS_DELETED, COMPANY_STATUS_ACTIVE } from '@quizzup/shared'
import db from '../db'
import { API_ACTION, API_RESOURCE } from '../security/permissions'
import { requireApiPermission } from '../security/requireApiPermission'
import { getCurrentCompanyId, isSuperadmin } from '../security/companiesPolicy'
import type { CompanyCreateBody, CompanyRow } from '../types/company'
import companiesIdRoutes from './companies/id'
import companiesIdStatusRoutes from './companies/idStatus'
import companiesIdPermanentRoutes from './companies/idPermanent'
import companyAdminsRoutes from './companies/admins'
import companyAdminIdRoutes from './companies/admins/id'
import companyAdminIdStatusRoutes from './companies/admins/idStatus'
import { companySelect } from './companies/_shared'
import { createCompanySchema } from './companies/_schemas'

const companiesRoutes: FastifyPluginAsync = async (app) => {
  app.register(companiesIdRoutes)
  app.register(companiesIdStatusRoutes)
  app.register(companiesIdPermanentRoutes)
  app.register(companyAdminsRoutes)
  app.register(companyAdminIdRoutes)
  app.register(companyAdminIdStatusRoutes)

  app.get(
    '/companies',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY,
        API_ACTION.LIST,
      )

      if (!hasPermission) {
        return
      }

      const myCompanyId = getCurrentCompanyId(req)

      const baseQuery = db('companies')
        .leftJoin('admins', function joinAdmins() {
          this.on('admins.company_id', '=', 'companies.id').andOn(
            db.raw('admins.status <> ?', [ADMIN_STATUS_DELETED]),
          )
        })
        .groupBy('companies.id')
        .select(companySelect)

      if (!isSuperadmin(req)) {
        const company = await baseQuery
          .where('companies.id', myCompanyId)
          .first()

        if (!company) {
          return { companies: [] }
        }

        return { companies: [company as CompanyRow] }
      }

      const companies = await baseQuery.orderBy('companies.id', 'asc')

      return { companies: companies as CompanyRow[] }
    },
  )

  app.post<{ Body: CompanyCreateBody }>(
    '/companies',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY,
        API_ACTION.CREATE,
      )

      if (!hasPermission) {
        return
      }

      const parsed = createCompanySchema.safeParse(req.body)

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsed.error.flatten(),
        })
      }

      const { name, email } = parsed.data

      const existingCompanyByEmail = await db('companies')
        .whereRaw('LOWER(email) = ?', [email])
        .first('id')

      if (existingCompanyByEmail) {
        return reply.code(409).send({ error: 'email_already_exists' })
      }

      const existingCompanyByName = await db('companies')
        .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
        .first('id')

      if (existingCompanyByName) {
        return reply.code(409).send({ error: 'name_already_exists' })
      }

      const inserted = await db('companies')
        .insert({
          name,
          email,
          status: COMPANY_STATUS_ACTIVE,
          deleted_at: null,
        })
        .returning([
          'id',
          'name',
          'email',
          'status',
          'created_at as createdAt',
          'updated_at as updatedAt',
          'deleted_at as deletedAt',
        ])

      const createdCompany = Array.isArray(inserted) ? inserted[0] : inserted

      return reply.code(201).send({
        company: {
          ...createdCompany,
          accountsCount: 0,
        } satisfies CompanyRow,
      })
    },
  )
}

export default companiesRoutes
