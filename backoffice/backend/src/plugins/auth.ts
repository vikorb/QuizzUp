import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'

import { ADMIN_ROLE_ROOM, ADMIN_ROLE_SUPERADMIN, ADMIN_STATUS_ACTIVE } from '@quizzup/shared'
import db from '../db'
import {
  consoleNetworkWarnings,
  createConsoleNetwork,
  type ConsoleNetwork,
} from '../security/consoleNetwork'
import { assertJwtSecretIsSafe } from '../security/jwtSecret'
import { isRoomAccountUsable } from '../security/roomCompany'
import { parseTotpKey } from '../security/secretBox'
import { parseTrustProxy } from '../utils/trustProxy'

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

export type SessionCheck =
  | { ok: true; admin: AdminAccessRow }
  | { ok: false; error: 'session_invalid' | 'session_expired_inactive' | 'account_inactive' }

/**
 * Vérifie qu'une session est encore valable (non révoquée, non expirée par inactivité, compte
 * actif). Ne prolonge pas la session : c'est `authenticate` qui rafraîchit `last_seen_at`. Les
 * flux SSE (`routes/live`) la rejouent sans la prolonger. Une session invalide est révoquée.
 */
export async function checkSession(
  sid: string,
  adminId: number,
  isRoomSession: boolean
): Promise<SessionCheck> {
  const session = await db<AdminSessionRow>('admin_sessions')
    .select('id', 'admin_id', 'last_seen_at', 'revoked_at')
    .where({ id: sid, admin_id: adminId })
    .first()

  if (!session || session.revoked_at) {
    return { ok: false, error: 'session_invalid' }
  }

  const lastSeen = new Date(session.last_seen_at).getTime()
  const now = Date.now()
  const diffSeconds = Math.floor((now - lastSeen) / 1000)

  // US-ROOM-02 : le PC d'une salle reste connecté (appareil fixe). Sa session
  // n'expire pas par inactivité ; l'admin la coupe en supprimant le compte.
  // Le rôle est lu dans le JWT ici, puis revérifié en base juste après.
  if (!isRoomSession && diffSeconds > INACTIVITY_SECONDS) {
    // Optionnel : on révoque en DB pour garder une trace
    await db('admin_sessions').where({ id: sid }).update({ revoked_at: db.fn.now() })
    return { ok: false, error: 'session_expired_inactive' }
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
    admin?.role === ADMIN_ROLE_ROOM && !(await isRoomAccountUsable(admin.company_id, admin.room_id))

  if (!admin || admin.status !== ADMIN_STATUS_ACTIVE || roleChanged || roomCompanyInactive) {
    // Compte inactif/supprimé/inexistant : on invalide aussi la session en base.
    await db('admin_sessions').where({ id: sid }).update({ revoked_at: db.fn.now() })
    return { ok: false, error: 'account_inactive' }
  }

  return { ok: true, admin }
}

const authPlugin: FastifyPluginAsync = async (app) => {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('Missing env JWT_SECRET')
  assertJwtSecretIsSafe(jwtSecret)

  app.register(jwt, { secret: jwtSecret })

  // Console éditeur : le superadmin ne passe que depuis ces adresses (cf. security/consoleNetwork.ts).
  // Décorée pour que `routes/auth.ts` (connexion) lise la même variable, une seule fois.
  const consoleNetwork = createConsoleNetwork(process.env.CONSOLE_ALLOWED_CIDRS)
  app.decorate('consoleNetwork', consoleNetwork)
  app.log.info(
    { ranges: consoleNetwork.ranges },
    consoleNetwork.ranges.length > 0
      ? `console éditeur : ${consoleNetwork.ranges.length} plage(s) autorisée(s)`
      : 'console éditeur : fermée (CONSOLE_ALLOWED_CIDRS vide)'
  )
  for (const warning of consoleNetworkWarnings(
    consoleNetwork.ranges,
    parseTrustProxy(process.env.TRUST_PROXY)
  )) {
    app.log.warn(warning)
  }

  // Clé de chiffrement des secrets TOTP. Absente ou mal formée : le deuxième facteur répond 503 au
  // superadmin, sans bloquer le reste de l'API (les centres ne dépendent pas de la console).
  const totpKey = parseTotpKey(process.env.TOTP_ENCRYPTION_KEY)
  app.decorate('totpKey', totpKey)
  if (!totpKey) {
    app.log.error(
      'TOTP_ENCRYPTION_KEY absente ou invalide (32 octets en base64) : connexion superadmin indisponible'
    )
  }

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'unauthorized' })
    }

    // Un jeton qui porte `typ` n'est pas un jeton de session (ex. le jeton de défi du deuxième
    // facteur, sans `sid`) : jamais accepté comme porteur.
    if ((req.user as { typ?: unknown }).typ !== undefined) {
      return reply.code(401).send({ error: 'unauthorized' })
    }

    const adminId = Number(req.user.sub)
    const sid = req.user.sid
    const check = await checkSession(sid, adminId, req.user.role === ADMIN_ROLE_ROOM)

    if (!check.ok) {
      return reply.code(401).send({ error: check.error })
    }

    const { admin } = check

    // Le rôle vient de la base : un jeton superadmin volé ne sert à rien hors des adresses de la
    // console, sur aucune route (sauf `allowOutsideConsole`, la déconnexion : elle ne fait que
    // révoquer la session). Même corps que `requireApiPermission`.
    if (
      admin.role === ADMIN_ROLE_SUPERADMIN &&
      !req.routeOptions.config.allowOutsideConsole &&
      !consoleNetwork.allows(req.ip)
    ) {
      req.log.warn(
        { adminId: admin.id, route: req.routeOptions.url, ip: req.ip },
        'superadmin hors des adresses de la console'
      )
      return reply.code(403).send({ error: 'forbidden' })
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
    consoleNetwork: ConsoleNetwork
    /** Clé AES-256 des secrets TOTP, ou null si `TOTP_ENCRYPTION_KEY` est absente ou invalide. */
    totpKey: Buffer | null
  }

  interface FastifyContextConfig {
    /** Route que `authenticate` laisse passer à un superadmin hors des adresses de la console. */
    allowOutsideConsole?: boolean
  }
}
