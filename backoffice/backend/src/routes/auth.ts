import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import db from '../db'

type AdminRow = {
  id: number
  company_id: number
  role: string
  firstname: string
  lastname: string
  username: string
  email: string
  mdp_hash: string
  status: number
}

type AdminSessionRow = {
  id: string
  admin_id: number
  created_at: string
  last_seen_at: string
  revoked_at: string | null
}

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
})

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/login',
    async (
      req: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply
    ): Promise<
      | {
          token: string
          admin: {
            id: number
            company_id: number
            role: string
            firstname: string
            lastname: string
            username: string
            email: string
          }
        }
      | FastifyReply
    > => {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send(parsed.error.flatten())

      const { identifier, password } = parsed.data
      const isEmail = identifier.includes('@')

      const query = db<AdminRow>('admins')
        .select(
          'id',
          'company_id',
          'role',
          'firstname',
          'lastname',
          'username',
          'email',
          'mdp_hash',
          'status'
        )
        .where('status', 1)

      if (isEmail) query.andWhereRaw('lower(email) = lower(?)', [identifier])
      else query.andWhereRaw('lower(username) = lower(?)', [identifier])

      const admin = await query.first()
      if (!admin) return reply.code(401).send({ error: 'invalid_credentials' })

      const ok = await bcrypt.compare(password, admin.mdp_hash)
      if (!ok) return reply.code(401).send({ error: 'invalid_credentials' })

      const sid = randomUUID()

      await db<AdminSessionRow>('admin_sessions').insert({
        id: sid,
        admin_id: admin.id,
      })

      // expiresIn peut être large (ex 7j) car l’inactivité est gérée par la session DB
      const token = app.jwt.sign(
        { sub: String(admin.id), company_id: admin.company_id, role: admin.role, sid },
        { expiresIn: '7d' }
      )

      return {
        token,
        admin: {
          id: admin.id,
          company_id: admin.company_id,
          role: admin.role,
          firstname: admin.firstname,
          lastname: admin.lastname,
          username: admin.username,
          email: admin.email,
        },
      }
    }
  )

  app.post(
    '/logout',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const sid = req.user.sid
      await db('admin_sessions').where({ id: sid }).update({ revoked_at: db.fn.now() })
      return reply.send({ ok: true })
    }
  )
}

export default authRoutes
