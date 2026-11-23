import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { ADMIN_ROLE_ROOM, ADMIN_ROLE_SUPERADMIN } from '@quizzup/shared'
import db from '../db'
import { createRateLimiter, replyTooManyRequests } from '../security/rateLimit'
import { isRoomAccountUsable } from '../security/roomCompany'

/** Jeton d'un compte de salle (appareil fixe) : la révocation se fait en base. */
const ROOM_TOKEN_EXPIRES_IN = '365d'

/**
 * Limites des tentatives de connexion, sur 15 minutes. Par adresse : 100, large car tout le
 * personnel d'un centre et les PC de ses salles partagent la même adresse publique. Par couple
 * (adresse, identifiant) : 10, pour qu'un joueur du Wi-Fi invités qui rate un identifiant ne
 * bloque pas les autres identifiants du centre. Seuls les échecs restent comptés (une connexion
 * réussie rend ses passages, cf. plus bas).
 */
const LOGIN_RATE_LIMIT_MAX_PER_ADDRESS = 100
const LOGIN_RATE_LIMIT_MAX_PER_ACCOUNT = 10
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60_000

// Longueur maximale de l'identifiant dans la clé du limiteur : un corps de 1 Mo ne doit pas
// devenir une clé de 1 Mo en mémoire (une adresse e-mail tient en 254 caractères).
const LOGIN_RATE_LIMIT_IDENTIFIER_MAX = 254

// Même coût que les mots de passe réels (cf. companies/admins) : un compte inconnu passe par un
// `bcrypt.compare` de même durée, sinon le temps de réponse révèle si le compte existe.
const MISSING_ACCOUNT_HASH = bcrypt.hashSync('missing-account', 12)

type AdminRow = {
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
  // Des limiteurs par application : les tests repartent d'un compteur vide.
  const addressLimiter = createRateLimiter({
    max: LOGIN_RATE_LIMIT_MAX_PER_ADDRESS,
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  })
  const accountLimiter = createRateLimiter({
    max: LOGIN_RATE_LIMIT_MAX_PER_ACCOUNT,
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  })

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
      // Avant tout accès à la base ou à bcrypt, et quel que soit l'identifiant : la réponse ne
      // dit rien sur l'existence d'un compte. Même route pour le personnel et les comptes de salle.
      const addressLimit = addressLimiter.hit(req.ip)
      if (!addressLimit.allowed) return replyTooManyRequests(reply, addressLimit.retryAfterSeconds)

      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send(parsed.error.flatten())

      const { identifier, password } = parsed.data

      const accountKey = identifier.toLowerCase().slice(0, LOGIN_RATE_LIMIT_IDENTIFIER_MAX)
      const accountLimit = accountLimiter.hit(req.ip, accountKey)
      if (!accountLimit.allowed) {
        // Un essai refusé ne compte pas pour l'adresse : insister sur un identifiant ne doit pas
        // épuiser le plafond des autres.
        addressLimiter.refund(req.ip)
        return replyTooManyRequests(reply, accountLimit.retryAfterSeconds)
      }

      const isEmail = identifier.includes('@')

      const query = db<AdminRow>('admins')
        .select(
          'id',
          'company_id',
          'room_id',
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
      if (!admin) {
        await bcrypt.compare(password, MISSING_ACCOUNT_HASH)
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      const ok = await bcrypt.compare(password, admin.mdp_hash)
      if (!ok) return reply.code(401).send({ error: 'invalid_credentials' })

      // Compte de salle d'une compagnie désactivée ou supprimée : connexion refusée.
      if (
        admin.role === ADMIN_ROLE_ROOM &&
        !(await isRoomAccountUsable(admin.company_id, admin.room_id))
      ) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      // Superadmin hors des adresses de la console : après bcrypt, avec la réponse d'un mauvais mot
      // de passe (un 403 confirmerait qu'il est juste). Pas de session, et l'essai reste compté.
      if (admin.role === ADMIN_ROLE_SUPERADMIN && !app.consoleNetwork.allows(req.ip)) {
        req.log.warn({ adminId: admin.id, ip: req.ip }, 'connexion superadmin hors console')
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      // Succès : le passage est rendu. Sinon un centre dont le personnel se connecte souvent
      // finirait bloqué, alors que seuls les échecs ressemblent à une attaque. Celui qui
      // devine le mot de passe d'un autre compte n'y gagne rien : ses essais ratés restent comptés.
      addressLimiter.refund(req.ip)
      accountLimiter.refund(req.ip, accountKey)

      const sid = randomUUID()

      await db<AdminSessionRow>('admin_sessions').insert({
        id: sid,
        admin_id: admin.id,
      })

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
  )

  app.post(
    '/logout',
    // Un superadmin hors des adresses de la console peut quand même fermer sa session.
    { config: { allowOutsideConsole: true }, preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const sid = req.user.sid
      await db('admin_sessions').where({ id: sid }).update({ revoked_at: db.fn.now() })
      return reply.send({ ok: true })
    }
  )
}

export default authRoutes
