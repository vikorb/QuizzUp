import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import db from '../db'

type CompanyRow = {
  id: number
  name: string
  email: string
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

      if (!isAdmin) {
        const company = await db<CompanyRow>('companies')
          .select('id', 'name', 'email')
          .where({ id: myCompanyId })
          .first()

        if (!company) return { companies: [] }
        return { companies: [company] }
      }

      const companies = await db<CompanyRow>('companies')
        .select('id', 'name', 'email')
        .orderBy('id', 'asc')

      return { companies }
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

      const company = await db<CompanyRow>('companies')
        .select('id', 'name', 'email')
        .where({ id })
        .first()

      if (!company) return reply.code(404).send({ error: 'not_found' })

      return { company }
    }
  )
}

export default companiesRoutes
