import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import db from '../db'

type PublicMeAdmin = {
  id: number
  companyId: number
  role: string
  firstname: string
  lastname: string
  username: string
  email: string
  status: number
  createdAt?: string
  updatedAt?: string
}

const meRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const adminId = Number(req.user.sub)

      const admin = (await db('admins')
        .select({
          id: 'id',
          companyId: 'company_id',
          role: 'role',
          firstname: 'firstname',
          lastname: 'lastname',
          username: 'username',
          email: 'email',
          status: 'status',
          createdAt: 'created_at',
          updatedAt: 'updated_at',
        })
        .where({ id: adminId })
        .first()) as PublicMeAdmin | undefined

      if (!admin) {
        return reply.code(404).send({ error: 'not_found' })
      }

      return { admin }
    }
  )
}

export default meRoutes
