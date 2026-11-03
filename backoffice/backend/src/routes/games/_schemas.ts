import { z } from 'zod'

import {
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH,
  GAME_PODIUMS,
} from '@quizzup/shared'

export const gamesParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const gameParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  gameId: z.coerce.number().int().positive(),
})

const participantSchema = z
  .object({
    podium: z.number().int().min(1).max(GAME_PODIUMS),
    displayName: z.string().trim().min(1).max(GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH),
    email: z.string().trim().toLowerCase().email().max(255).optional().nullable(),
    // RGPD : la case doit être cochée explicitement pour qu'un email soit gardé.
    emailConsent: z.boolean().optional(),
  })
  .refine((participant) => !participant.email || participant.emailConsent === true, {
    message: 'email_consent_required',
    path: ['emailConsent'],
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
  })
  .refine(
    (body) =>
      new Set(body.participants.map((item) => item.podium)).size === body.participants.length,
    { message: 'participants_podium_duplicated', path: ['participants'] }
  )
