import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import db from '../db'
import { CompanyCreateBody, CompanyRow, CompanyStatusUpdateBody } from '../types/company'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
})

const updateCompanyStatusSchema = z.object({
  status: z.union([
    z.literal(COMPANY_STATUS_INACTIVE),
    z.literal(COMPANY_STATUS_ACTIVE),
    z.literal(COMPANY_STATUS_DELETED),
  ]),
})

const companySelect = [
  'companies.id',
  'companies.name',
  'companies.email',
  'companies.status',
  'companies.created_at as createdAt',
  'companies.updated_at as updatedAt',
  'companies.deleted_at as deletedAt',
  db.raw('COUNT(admins.id)::int as "accountsCount"'),
]

async function getCompanyAdminsCount(companyId: number): Promise<number> {
  const adminsCount = await db('admins')
    .where('company_id', companyId)
    .whereNot('status', 3)
    .count<{ count: string }>('id as count')
    .first()

  return Number(adminsCount?.count ?? 0)
}

const companiesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, _reply: FastifyReply) => {
      const mycompany_id = Number(req.user.company_id)
      const isAdmin = req.user.role === 'admin'

      const baseQuery = db('companies')
        .leftJoin('admins', function joinAdmins() {
          this.on('admins.company_id', '=', 'companies.id').andOn(db.raw('admins.status <> 3'))
        })
        .groupBy('companies.id')
        .select(companySelect)

      if (!isAdmin) {
        const company = await baseQuery
          .where('companies.id', mycompany_id)
          .whereNot('companies.status', COMPANY_STATUS_DELETED)
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

  app.get(
    '/companies/:id',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = paramsSchema.safeParse(req.params)

      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { id } = parsed.data
      const mycompany_id = Number(req.user.company_id)
      const isAdmin = req.user.role === 'admin'

      if (!isAdmin && id !== mycompany_id) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const company = await db('companies')
        .leftJoin('admins', function joinAdmins() {
          this.on('admins.company_id', '=', 'companies.id').andOn(db.raw('admins.status <> 3'))
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

  app.post<{ Body: CompanyCreateBody }>(
    '/companies',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
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

  app.patch<{ Body: CompanyStatusUpdateBody }>(
    '/companies/:id/status',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = paramsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateCompanyStatusSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { id } = parsedParams.data
      const { status } = parsedBody.data

      const existingCompany = await db('companies').where('id', id).first('id', 'status')

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const updated = await db('companies')
        .where('id', id)
        .update({
          status,
          updated_at: db.fn.now(),
          deleted_at: status === COMPANY_STATUS_DELETED ? db.fn.now() : null,
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

  app.delete(
    '/companies/:id/permanent',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.user.role !== 'admin') {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsed = paramsSchema.safeParse(req.params)

      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { id } = parsed.data

      const existingCompany = await db('companies').where('id', id).first('id', 'status')

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (existingCompany.status === COMPANY_STATUS_DELETED) {
        return reply.code(200).send({
          success: true,
          deleted: {
            companyId: id,
            adminsCount: 0,
            companiesCount: 0,
          },
        })
      }

      const updatedCompanies = await db('companies')
        .where('id', id)
        .update({
          status: COMPANY_STATUS_DELETED,
          updated_at: db.fn.now(),
          deleted_at: db.fn.now(),
        })

      return reply.code(200).send({
        success: true,
        deleted: {
          companyId: id,
          adminsCount: 0,
          companiesCount: updatedCompanies,
        },
      })
    },
  )
}

export default companiesRoutes
