import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import db from '../db'

type AdminRow = {
  id: number
  company_id: number
  role: string
  firstname: string
  lastname: string
  username: string
  email: string
  status: number
  created_at?: string
  updated_at?: string
}

const meRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const adminId = Number(req.user.sub)

      const admin = await db<AdminRow>('admins')
        .select(
          'id',
          'company_id',
          'role',
          'firstname',
          'lastname',
          'username',
          'email',
          'status',
          'created_at',
          'updated_at'
        )
        .where({ id: adminId })
        .first()

      if (!admin) return reply.code(404).send({ error: 'not_found' })
      return { admin }
    }
  )
}

export default meRoutes
