import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import db from '../db'

type CompanyRow = {
  id: number
  name: string
  email: string
  accountsCount: number
}

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

const companiesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, _reply: FastifyReply) => {
      const myCompanyId = Number(req.user.company_id)
      const isAdmin = req.user.role === 'admin'

      const baseQuery = db('companies')
        .leftJoin('admins', function joinAdmins() {
          this.on('admins.company_id', '=', 'companies.id').andOnNull('admins.deleted_at')
        })
        .groupBy('companies.id')
        .select(
          'companies.id',
          'companies.name',
          'companies.email',
          db.raw('COUNT(admins.id)::int as "accountsCount"')
        )

      if (!isAdmin) {
        const company = await baseQuery.where('companies.id', myCompanyId).first()
        if (!company) return { companies: [] }
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
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_params' })

      const { id } = parsed.data
      const myCompanyId = Number(req.user.company_id)
      const isAdmin = req.user.role === 'admin'

      if (!isAdmin && id !== myCompanyId) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const company = await db('companies')
        .leftJoin('admins', function joinAdmins() {
          this.on('admins.company_id', '=', 'companies.id').andOnNull('admins.deleted_at')
        })
        .where('companies.id', id)
        .groupBy('companies.id')
        .select(
          'companies.id',
          'companies.name',
          'companies.email',
          db.raw('COUNT(admins.id)::int as accountsCount')
        )
        .first()

      if (!company) return reply.code(404).send({ error: 'not_found' })
      return { company: company as CompanyRow }
    }
  )
}

export default companiesRoutes
