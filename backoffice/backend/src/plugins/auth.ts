import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'

import { ADMIN_ROLE_ROOM, ADMIN_STATUS_ACTIVE } from '@quizzup/shared'
import db from '../db'
import { isRoomAccountUsable } from '../security/roomCompany'

type JwtPayload = {
  sub: string
  company_id: number
  role: string
  sid: string
  /** Renseigné à partir de la base pour un compte de salle (US-ROOM-02). */
  room_id?: number | null
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

type AdminAccessRow = {
  id: number
  role: string
  company_id: number
  room_id: number | null
  status: number
}

const INACTIVITY_SECONDS = 60 * 60 // 1h

const authPlugin: FastifyPluginAsync = async (app) => {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('Missing env JWT_SECRET')

  app.register(jwt, { secret: jwtSecret })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
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

    // US-ROOM-02 : le PC d'une salle reste connecté (appareil fixe). Sa session
    // n'expire pas par inactivité ; l'admin la coupe en supprimant le compte.
    // Le rôle est lu dans le JWT ici, puis revérifié en base juste après.
    const isRoomSession = req.user.role === ADMIN_ROLE_ROOM

    if (!isRoomSession && diffSeconds > INACTIVITY_SECONDS) {
      // Optionnel : on révoque en DB pour garder une trace
      await db('admin_sessions').where({ id: sid }).update({ revoked_at: db.fn.now() })
      return reply.code(401).send({ error: 'session_expired_inactive' })
    }

    // Sécurité : on NE fait PAS confiance aux claims du JWT (durée 7 j) pour les
    // décisions d'accès. On relit l'état COURANT de l'admin en base à chaque
    // requête : un admin rétrogradé/désactivé/supprimé doit perdre ses droits
    // immédiatement, sans attendre l'expiration du token.
    const admin = await db<AdminAccessRow>('admins')
      .select('id', 'role', 'company_id', 'room_id', 'status')
      .where({ id: adminId })
      .first()

    // Un JWT de salle ne doit pas prolonger la session d'un compte qui n'est plus
    // un compte de salle (et inversement).
    const roleChanged = isRoomSession !== (admin?.role === ADMIN_ROLE_ROOM)

    const roomCompanyInactive =
      admin?.role === ADMIN_ROLE_ROOM &&
      !(await isRoomAccountUsable(admin.company_id, admin.room_id))

    if (!admin || admin.status !== ADMIN_STATUS_ACTIVE || roleChanged || roomCompanyInactive) {
      // Compte inactif/supprimé/inexistant : on invalide aussi la session en base.
      await db('admin_sessions').where({ id: sid }).update({ revoked_at: db.fn.now() })
      return reply.code(401).send({ error: 'account_inactive' })
    }

    // On rafraîchit les claims sensibles à partir de la base (source de vérité).
    req.user.role = String(admin.role)
    req.user.company_id = Number(admin.company_id)
    req.user.room_id = admin.room_id === null ? null : Number(admin.room_id)

    // Sliding inactivity : chaque requête OK => refresh last_seen_at
    await db('admin_sessions').where({ id: sid }).update({ last_seen_at: db.fn.now() })
  })
}

export default fp(authPlugin)

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
