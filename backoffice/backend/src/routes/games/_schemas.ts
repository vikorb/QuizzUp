import { z } from 'zod'

import {
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_LIST_DEFAULT_LIMIT,
  GAME_LIST_MAX_LIMIT,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH,
  GAME_PODIUMS,
  GAME_STATES,
  MINI_GAMES,
} from '@quizzup/shared'

export const gamesParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const gameParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  gameId: z.coerce.number().int().positive(),
})

// L'année 0000 est valide en ISO 8601 mais PostgreSQL la refuse (pas d'année 0) : 500 sinon.
const periodBoundSchema = z.iso
  .datetime({ offset: true })
  .refine((instant) => !instant.startsWith('0000'))
  .optional()

/**
 * Filtres et pagination de la liste. `from` et `to` sont des instants ISO 8601 avec fuseau, en
 * intervalle semi-ouvert `[from, to)` : `to` est exclu (le frontend envoie le début du jour
 * suivant en heure locale, le jour d'une salle n'est pas le jour UTC).
 * `limit` au-delà du plafond est ramené au plafond ; 0 ou négatif est refusé.
 */
export const gamesListQuerySchema = z.object({
  state: z.enum(GAME_STATES).optional(),
  roomId: z.coerce.number().int().positive().optional(),
  from: periodBoundSchema,
  to: periodBoundSchema,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((limit) => Math.min(limit, GAME_LIST_MAX_LIMIT))
    .default(GAME_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
})

const emailSchema = z.string().trim().toLowerCase().email().max(255).optional().nullable()
const displayNameSchema = z.string().trim().min(1).max(GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH)

// RGPD : la case doit être cochée explicitement pour qu'un email soit gardé.
function hasConsentIfEmail(player: { email?: string | null; emailConsent?: boolean }): boolean {
  return !player.email || player.emailConsent === true
}

// Consentement aux offres du centre : distinct de la conservation de l'email, mais sans email
// il n'y a personne à qui écrire.
function hasEmailIfMarketing(player: {
  email?: string | null
  marketingConsent?: boolean
}): boolean {
  return player.marketingConsent !== true || Boolean(player.email)
}

/** 2e joueur facultatif d'un pupitre : son propre nom et son propre email RGPD. */
const secondPlayerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    emailConsent: z.boolean().optional(),
    marketingConsent: z.boolean().optional(),
  })
  .refine(hasConsentIfEmail, { message: 'email_consent_required', path: ['emailConsent'] })
  .refine(hasEmailIfMarketing, {
    message: 'marketing_consent_requires_email',
    path: ['marketingConsent'],
  })

const participantSchema = z
  .object({
    podium: z.number().int().min(1).max(GAME_PODIUMS),
    displayName: displayNameSchema,
    email: emailSchema,
    emailConsent: z.boolean().optional(),
    marketingConsent: z.boolean().optional(),
    secondPlayer: secondPlayerSchema.optional().nullable(),
  })
  .refine(hasConsentIfEmail, { message: 'email_consent_required', path: ['emailConsent'] })
  .refine(hasEmailIfMarketing, {
    message: 'marketing_consent_requires_email',
    path: ['marketingConsent'],
  })

export const createGameSchema = z
  .object({
    // Les ids bigint sortent de l'API en texte : on accepte "7" comme 7.
    roomId: z.coerce.number().int().positive(),
    roundsCount: z.number().int().min(1).max(GAME_MAX_ROUNDS).default(GAME_DEFAULT_ROUNDS),
    questionsPerRound: z
      .number()
      .int()
      .min(1)
      .max(GAME_MAX_QUESTIONS_PER_ROUND)
      .default(GAME_DEFAULT_QUESTIONS_PER_ROUND),
    participants: z.array(participantSchema).min(1).max(GAME_PODIUMS),
    // Programme de la partie : absent, tous les mini-jeux du moteur. La liste complète est
    // ramenée à « absent » (stocké `null`), comme le fait le formulaire : un futur mini-jeu
    // sera ainsi inclus d'office.
    miniGames: z
      .array(z.enum(MINI_GAMES))
      .min(1)
      .max(MINI_GAMES.length)
      .refine((miniGames) => new Set(miniGames).size === miniGames.length, {
        message: 'mini_games_duplicated',
      })
      .transform((miniGames) => (miniGames.length === MINI_GAMES.length ? undefined : miniGames))
      .optional(),
  })
  .refine(
    (body) =>
      new Set(body.participants.map((item) => item.podium)).size === body.participants.length,
    { message: 'participants_podium_duplicated', path: ['participants'] }
  )
