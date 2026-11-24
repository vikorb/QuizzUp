import {
  COMPANY_STATUS_ACTIVE,
  GAME_STATE_PENDING,
  GAME_STATUS_ACTIVE,
  isJoinDisplayName,
  JOIN_DISPLAY_NAME_MAX_LENGTH,
  JOIN_MAX_PENDING_REGISTRATIONS,
  JOIN_TOKEN_BYTES,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import db from '../../db'
import { createRateLimiter, replyTooManyRequests } from '../../security/rateLimit'
import { companyLogoUrl } from '../companies/_shared'
import { emailSchema, hasConsentIfEmail, hasEmailIfMarketing } from '../games/_schemas'
import { sendPublicError } from './_shared'

/** Corps maximal d'une requête : un jeton et deux prénoms, 4 Ko suffisent largement. */
export const JOIN_BODY_LIMIT = 4 * 1024

/**
 * Inscriptions acceptées par minute et par adresse. Large volontairement : les téléphones d'un
 * centre partagent une seule adresse publique. Le vrai garde-fou est le plafond par partie.
 */
export const JOIN_REGISTRATION_RATE_LIMIT_MAX = 30
export const JOIN_REGISTRATION_RATE_LIMIT_WINDOW_MS = 60_000

// Un jeton fait `JOIN_TOKEN_BYTES` octets en base64url, sans remplissage (43 caractères).
const TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${Math.ceil((JOIN_TOKEN_BYTES * 4) / 3)}}$`)

// Pas de contrôle de forme ici : un jeton mal formé répond le même 404 qu'un jeton inconnu.
const tokenSchema = z.string().max(256)

const lookupBodySchema = z.strictObject({ token: tokenSchema })

type PlayerChecks = {
  email?: string | null
  emailConsent?: boolean
  marketingConsent?: boolean
  ageConfirmed?: boolean
}

// Mêmes règles RGPD que `participantSchema`, plus l'attestation d'âge : l'e-mail d'un joueur n'est
// gardé que s'il a 15 ans ou plus (décision Q4).
function checkPlayer(player: PlayerChecks, ctx: z.RefinementCtx, path: string[] = []) {
  if (!hasConsentIfEmail(player)) {
    ctx.addIssue({
      code: 'custom',
      message: 'email_consent_required',
      path: [...path, 'emailConsent'],
    })
  }

  if (!hasEmailIfMarketing(player)) {
    ctx.addIssue({
      code: 'custom',
      message: 'marketing_consent_requires_email',
      path: [...path, 'marketingConsent'],
    })
  }

  if (player.email && player.ageConfirmed !== true) {
    ctx.addIssue({
      code: 'custom',
      message: 'age_confirmation_required',
      path: [...path, 'ageConfirmed'],
    })
  }
}

const playerFields = {
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(JOIN_DISPLAY_NAME_MAX_LENGTH)
    .refine(isJoinDisplayName, { message: 'display_name_invalid' }),
  email: emailSchema,
  emailConsent: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  ageConfirmed: z.boolean().optional(),
}

const registrationBodySchema = z
  .strictObject({
    token: tokenSchema,
    ...playerFields,
    secondPlayer: z.strictObject(playerFields).optional().nullable(),
  })
  .superRefine((body, ctx) => {
    checkPlayer(body, ctx)

    if (body.secondPlayer) {
      checkPlayer(body.secondPlayer, ctx, ['secondPlayer'])
    }
  })

type RegistrationBody = z.infer<typeof registrationBodySchema>

// Contrairement à `flatten()`, garde le chemin complet (`secondPlayer.email`) : la page sait ainsi
// quel champ de quel joueur est refusé.
function fieldErrorsOf(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const key = issue.path.join('.')

    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
  }

  return fieldErrors
}

type OpenableGame = {
  state: unknown
  status: unknown
  expiresAt: unknown
}

/** Le lien accepte des inscriptions : partie en attente, active, et délai non dépassé. */
function isGameOpen(game: OpenableGame, now: Date): boolean {
  return (
    game.state === GAME_STATE_PENDING &&
    game.status === GAME_STATUS_ACTIVE &&
    Boolean(game.expiresAt) &&
    new Date(game.expiresAt as string).getTime() > now.getTime()
  )
}

function toRegistrationRow(gameId: number, body: RegistrationBody, kidsMode: boolean) {
  const second = body.secondPlayer ?? null
  // Partie en mode enfants : aucun e-mail n'est gardé, même si le client en envoie un (Q5). Sans
  // e-mail, les dates de consentement restent vides.
  const email = kidsMode ? null : (body.email ?? null)
  const secondEmail = kidsMode ? null : (second?.email ?? null)

  // Les consentements sont horodatés par le serveur à la réception, jamais par le client.
  return {
    game_id: gameId,
    display_name: body.displayName,
    email,
    consent_at: email ? db.fn.now() : null,
    marketing_consent_at: email && body.marketingConsent ? db.fn.now() : null,
    second_display_name: second?.displayName ?? null,
    second_email: secondEmail,
    second_consent_at: secondEmail ? db.fn.now() : null,
    second_marketing_consent_at: secondEmail && second?.marketingConsent ? db.fn.now() : null,
  }
}

/**
 * Accueil des joueurs par QR code, côté téléphone (page `/rejoindre/#<jeton>`). Le jeton arrive
 * dans le corps de la requête, jamais dans l'adresse : il n'entre pas dans les journaux. Un jeton
 * mal formé, inconnu ou d'une autre partie répond le même 404 ; un jeton reconnu mais fermé
 * répond 410. Aucune de ces routes ne renvoie un identifiant, un nom ou un e-mail de joueur.
 */
const publicJoinRoutes: FastifyPluginAsync = async (app) => {
  // Un limiteur par instance du plugin (donc par application), en plus de celui de tout le préfixe.
  const registrationLimiter = createRateLimiter({
    max: JOIN_REGISTRATION_RATE_LIMIT_MAX,
    windowMs: JOIN_REGISTRATION_RATE_LIMIT_WINDOW_MS,
  })

  const invalidLink = (reply: Parameters<typeof sendPublicError>[0]) =>
    sendPublicError(reply, 404, 'join_link_invalid')
  const closedLink = (reply: Parameters<typeof sendPublicError>[0]) =>
    sendPublicError(reply, 410, 'join_link_closed')

  /** Partie du jeton, avec ce qu'il faut pour juger si le lien est ouvert ; `null` si inconnu. */
  async function findGameByToken(token: string) {
    if (!TOKEN_PATTERN.test(token)) {
      return null
    }

    const game = await db('games')
      .join('rooms', 'rooms.id', 'games.room_id')
      .join('companies', 'companies.id', 'games.company_id')
      .where('games.join_token', token)
      .first([
        'games.id as id',
        'games.state as state',
        'games.status as status',
        'games.join_expires_at as expiresAt',
        'games.kids_mode as kidsMode',
        'rooms.name as roomName',
        'rooms.status as roomStatus',
        'companies.name as companyName',
        'companies.status as companyStatus',
        'companies.logo_key as logoKey',
      ])

    if (!game) {
      return null
    }

    return {
      ...game,
      id: Number(game.id),
      kidsMode: Boolean(game.kidsMode),
      isOpen:
        isGameOpen(game, new Date()) &&
        game.roomStatus === ROOM_STATUS_ACTIVE &&
        game.companyStatus === COMPANY_STATUS_ACTIVE,
    }
  }

  app.post('/join/lookup', { bodyLimit: JOIN_BODY_LIMIT }, async (req, reply) => {
    // Le corps contient le jeton : ni lui ni les détails de Zod ne vont dans un journal.
    const parsed = lookupBodySchema.safeParse(req.body)

    if (!parsed.success) {
      return sendPublicError(reply, 400, 'invalid_body', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      })
    }

    const game = await findGameByToken(parsed.data.token)

    if (!game) {
      return invalidLink(reply)
    }

    if (!game.isOpen) {
      return closedLink(reply)
    }

    return {
      companyName: game.companyName,
      roomName: game.roomName,
      logoUrl: companyLogoUrl(game.logoKey),
      expiresAt: new Date(game.expiresAt as string).toISOString(),
      kidsMode: game.kidsMode,
    }
  })

  app.post(
    '/join/registrations',
    {
      bodyLimit: JOIN_BODY_LIMIT,
      // Compte tout envoi, même invalide ou trop gros : sonder la route ne doit rien coûter de moins.
      onRequest: async (req, reply) => {
        const limit = registrationLimiter.hit(req.ip)

        if (!limit.allowed) return replyTooManyRequests(reply, limit.retryAfterSeconds)
      },
    },
    async (req, reply) => {
      const parsed = registrationBodySchema.safeParse(req.body)

      if (!parsed.success) {
        return sendPublicError(reply, 400, 'invalid_body', {
          fieldErrors: fieldErrorsOf(parsed.error),
        })
      }

      const body = parsed.data
      const game = await findGameByToken(body.token)

      if (!game) {
        return invalidLink(reply)
      }

      if (!game.isOpen) {
        return closedLink(reply)
      }

      const outcome = await db.transaction(async (trx): Promise<'created' | 'closed' | 'full'> => {
        // Verrou de la partie : deux inscriptions simultanées passent l'une après l'autre, donc le
        // plafond ne peut pas être dépassé, et un lien fermé entre-temps est vu ici.
        const locked = await trx('games')
          .where('id', game.id)
          .forUpdate()
          .first(['state', 'status', 'join_token as token', 'join_expires_at as expiresAt'])

        if (!locked || locked.token !== body.token || !isGameOpen(locked, new Date())) {
          return 'closed'
        }

        const [{ count }] = await trx('game_registrations')
          .where('game_id', game.id)
          .count({ count: '*' })

        if (Number(count) >= JOIN_MAX_PENDING_REGISTRATIONS) {
          return 'full'
        }

        await trx('game_registrations').insert(toRegistrationRow(game.id, body, game.kidsMode))

        return 'created'
      })

      if (outcome === 'closed') {
        return closedLink(reply)
      }

      if (outcome === 'full') {
        return sendPublicError(reply, 409, 'join_full')
      }

      // Même réponse quel que soit l'e-mail : on ne dit jamais s'il était déjà connu.
      return reply.code(201).send({ ok: true })
    }
  )
}

export default publicJoinRoutes
