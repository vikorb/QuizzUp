import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import db from '../db'

type JwtPayload = {
  sub: string
  company_id: number
  role: string
  sid: string
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JwtPayload
  }
}

type AdminSessionRow = {
  id: string
  admin_id: number
  created_at: string
  last_seen_at: string
  revoked_at: string | null
}

const INACTIVITY_SECONDS = 60 * 60 // 1h

const authPlugin: FastifyPluginAsync = async (app) => {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('Missing env JWT_SECRET')

  app.register(jwt, { secret: jwtSecret })

  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify()
      } catch {
        return reply.code(401).send({ error: 'unauthorized' })
      }

      const adminId = Number(req.user.sub)
      const sid = req.user.sid

      const session = await db<AdminSessionRow>('admin_sessions')
        .select('id', 'admin_id', 'last_seen_at', 'revoked_at')
        .where({ id: sid, admin_id: adminId })
        .first()

      if (!session || session.revoked_at) {
        return reply.code(401).send({ error: 'session_invalid' })
      }

      const lastSeen = new Date(session.last_seen_at).getTime()
      const now = Date.now()
      const diffSeconds = Math.floor((now - lastSeen) / 1000)

      if (diffSeconds > INACTIVITY_SECONDS) {
        // Optionnel : on révoque en DB pour garder une trace
        await db('admin_sessions').where({ id: sid }).update({ revoked_at: db.fn.now() })
        return reply.code(401).send({ error: 'session_expired_inactive' })
      }

      // Sliding inactivity : chaque requête OK => refresh last_seen_at
      await db('admin_sessions').where({ id: sid }).update({ last_seen_at: db.fn.now() })
    }
  )
}

export default fp(authPlugin)

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
