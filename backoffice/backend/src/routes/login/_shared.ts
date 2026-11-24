import { randomUUID } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ADMIN_ROLE_ROOM, ADMIN_ROLE_SUPERADMIN, ADMIN_STATUS_ACTIVE } from '@quizzup/shared'

import db from '../../db'

/** Jeton d'un compte de salle (appareil fixe) : la révocation se fait en base. */
const ROOM_TOKEN_EXPIRES_IN = '365d'

/** Valeur de `typ` du jeton de défi : `authenticate` refuse tout jeton qui porte un `typ`. */
export const MFA_CHALLENGE_TYPE = 'mfa_challenge'
export const MFA_CHALLENGE_EXPIRES_IN = '5m'

export type AdminRow = {
  id: number
  company_id: number
  room_id: number | null
  role: string
  firstname: string
  lastname: string
  username: string
  email: string
  mdp_hash: string
  status: number
}

export const ADMIN_LOGIN_COLUMNS = [
  'id',
  'company_id',
  'room_id',
  'role',
  'firstname',
  'lastname',
  'username',
  'email',
  'mdp_hash',
  'status',
] as const

/**
 * Ouvre une session : ligne `admin_sessions` et jeton porteur. Commun à la connexion (tous les
 * rôles sauf le superadmin) et à la fin du deuxième facteur (superadmin).
 */
export async function issueSession(app: FastifyInstance, admin: AdminRow) {
  const sid = randomUUID()

  await db('admin_sessions').insert({ id: sid, admin_id: admin.id })

  // expiresIn peut être large (ex 7j) car l’inactivité est gérée par la session DB
  const token = app.jwt.sign(
    { sub: String(admin.id), company_id: admin.company_id, role: admin.role, sid },
    // US-ROOM-02 : le PC d'une salle reste connecté ; l'admin coupe l'accès en
    // supprimant le compte (sessions révoquées en base).
    { expiresIn: admin.role === ADMIN_ROLE_ROOM ? ROOM_TOKEN_EXPIRES_IN : '7d' }
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

/** Jeton de défi remis après un mot de passe juste : ni `sid` ni session, valable 5 minutes. */
export function signChallenge(app: FastifyInstance, adminId: number): string {
  return app.jwt.sign(
    { sub: String(adminId), typ: MFA_CHALLENGE_TYPE },
    { expiresIn: MFA_CHALLENGE_EXPIRES_IN }
  )
}

/**
 * Le superadmin actif désigné par un jeton de défi, ou null (jeton absent, altéré, expiré, d'un
 * autre type — jeton normal comprise —, compte désactivé ou plus superadmin). Le rôle est relu en base.
 */
export async function readChallenge(app: FastifyInstance, token: string): Promise<AdminRow | null> {
  let claims: { sub?: unknown; typ?: unknown; sid?: unknown }

  try {
    claims = app.jwt.verify(token)
  } catch {
    return null
  }

  if (claims.typ !== MFA_CHALLENGE_TYPE || claims.sid !== undefined) return null

  const adminId = Number(claims.sub)
  if (!Number.isSafeInteger(adminId)) return null

  const admin = await db<AdminRow>('admins')
    .select(...ADMIN_LOGIN_COLUMNS)
    .where({ id: adminId, role: ADMIN_ROLE_SUPERADMIN, status: ADMIN_STATUS_ACTIVE })
    .first()

  return admin ?? null
}

/** Clé de chiffrement absente ou mal formée : le deuxième facteur est indisponible (le reste de l'API non). */
export function replyTotpUnavailable(req: FastifyRequest, reply: FastifyReply) {
  req.log.error('TOTP_ENCRYPTION_KEY absente ou invalide : deuxième facteur indisponible')

  return reply.code(503).send({ error: 'totp_unavailable' })
}

/** Deuxième facteur verrouillé après trop d'échecs : 429 avec le délai restant. */
export function replyTooManyAttempts(reply: FastifyReply, retryAfterSeconds: number) {
  return reply
    .code(429)
    .header('Retry-After', String(retryAfterSeconds))
    .send({ error: 'too_many_attempts' })
}
