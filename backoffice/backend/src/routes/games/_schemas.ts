import { z } from 'zod'

import {
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH,
  GAME_PODIUMS,
  MINI_GAMES,
} from '@quizzup/shared'

export const gamesParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const gameParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  gameId: z.coerce.number().int().positive(),
})

const emailSchema = z.string().trim().toLowerCase().email().max(255).optional().nullable()
const displayNameSchema = z.string().trim().min(1).max(GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH)

// RGPD : la case doit être cochée explicitement pour qu'un email soit gardé.
function hasConsentIfEmail(player: { email?: string | null; emailConsent?: boolean }): boolean {
  return !player.email || player.emailConsent === true
}

/** 2e joueur facultatif d'un pupitre : son propre nom et son propre email RGPD. */
const secondPlayerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    emailConsent: z.boolean().optional(),
  })
  .refine(hasConsentIfEmail, { message: 'email_consent_required', path: ['emailConsent'] })

const participantSchema = z
  .object({
    podium: z.number().int().min(1).max(GAME_PODIUMS),
    displayName: displayNameSchema,
    email: emailSchema,
    emailConsent: z.boolean().optional(),
    secondPlayer: secondPlayerSchema.optional().nullable(),
  })
  .refine(hasConsentIfEmail, { message: 'email_consent_required', path: ['emailConsent'] })

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
    // Programme de la partie : absent, tous les mini-jeux du moteur.
    miniGames: z
      .array(z.enum(MINI_GAMES))
      .min(1)
      .max(MINI_GAMES.length)
      .refine((miniGames) => new Set(miniGames).size === miniGames.length, {
        message: 'mini_games_duplicated',
      })
      .optional(),
  })
  .refine(
    (body) =>
      new Set(body.participants.map((item) => item.podium)).size === body.participants.length,
    { message: 'participants_podium_duplicated', path: ['participants'] }
  )
