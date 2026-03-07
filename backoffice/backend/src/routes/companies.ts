import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import db from '../db'

type CompanyRow = {
  id: number
  name: string
  email: string
  status: number
  createdAt: string
  updatedAt: string | null
  accountsCount: number
}

type CompanyCreateBody = {
  name: string
  email: string
}

type CompanyStatusUpdateBody = {
  status: 1 | 2
}

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
})

const updateCompanyStatusSchema = z.object({
  status: z.union([z.literal(1), z.literal(2)]),
})

const companySelect = [
  'companies.id',
  'companies.name',
  'companies.email',
  'companies.status',
  'companies.created_at as createdAt',
  'companies.updated_at as updatedAt',
  db.raw('COUNT(admins.id)::int as "accountsCount"'),
]

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
        const company = await baseQuery.where('companies.id', mycompany_id).first()

        if (!company) {
          return { companies: [] }
        }

        return { companies: [company as CompanyRow] }
      }

      const companies = await baseQuery.orderBy('companies.id', 'asc')
      return { companies: companies as CompanyRow[] }
    }
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
    }
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
          status: 1,
        })
        .returning([
          'id',
          'name',
          'email',
          'status',
          'created_at as createdAt',
          'updated_at as updatedAt',
        ])

      const createdCompany = Array.isArray(inserted) ? inserted[0] : inserted

      return reply.code(201).send({
        company: {
          ...createdCompany,
          accountsCount: 0,
        } satisfies CompanyRow,
      })
    }
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

      const existingCompany = await db('companies')
        .where('id', id)
        .first('id', 'status')

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const updated = await db('companies')
        .where('id', id)
        .update({
          status,
          updated_at: db.fn.now(),
        })
        .returning([
          'id',
          'name',
          'email',
          'status',
          'created_at as createdAt',
          'updated_at as updatedAt',
        ])

      const updatedCompanyBase = Array.isArray(updated) ? updated[0] : updated

      const adminsCount = await db('admins')
        .where('company_id', id)
        .whereNot('status', 3)
        .count<{ count: string }>('id as count')
        .first()

      return reply.code(200).send({
        company: {
          ...updatedCompanyBase,
          accountsCount: Number(adminsCount?.count ?? 0),
        } satisfies CompanyRow,
      })
    }
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

      const existingCompany = await db('companies')
        .where('id', id)
        .first('id', 'name')

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const result = await db.transaction(async (trx) => {
        const deletedAdmins = await trx('admins').where('company_id', id).del()
        const deletedCompanies = await trx('companies').where('id', id).del()

        return {
          deletedAdmins,
          deletedCompanies,
        }
      })

      return reply.code(200).send({
        success: true,
        deleted: {
          companyId: id,
          adminsCount: result.deletedAdmins,
          companiesCount: result.deletedCompanies,
        },
      })
    }
  )
}

export default companiesRoutes
