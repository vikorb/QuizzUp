import { z } from 'zod'

import {
  DEMO_REQUEST_CENTER_NAME_MAX,
  DEMO_REQUEST_EMAIL_MAX,
  DEMO_REQUEST_MESSAGE_MAX,
  DEMO_REQUEST_NAME_MAX,
  DEMO_REQUEST_PHONE_PATTERN,
  DEMO_REQUEST_ROOMS_MAX,
} from '@quizzup/shared'

/**
 * Corps de `POST /public/v1/demo-requests`. `website` est le champ piège : invisible pour une
 * personne, rempli par les robots. Quand il l'est, la route répond 202 avant d'arriver ici ; le
 * schéma ne l'accepte donc que vide.
 */
// PostgreSQL refuse le caractère NUL dans un texte (22021) : on le rejette ici, en 400, plutôt qu'en 500.
const noNul = (value: string) => !value.includes('\u0000')

export const createDemoRequestSchema = z.object({
  name: z.string().trim().min(1).max(DEMO_REQUEST_NAME_MAX).refine(noNul),
  centerName: z.string().trim().min(1).max(DEMO_REQUEST_CENTER_NAME_MAX).refine(noNul),
  email: z.email().max(DEMO_REQUEST_EMAIL_MAX),
  phone: z.string().regex(DEMO_REQUEST_PHONE_PATTERN).optional(),
  roomsCount: z.number().int().min(1).max(DEMO_REQUEST_ROOMS_MAX),
  message: z.string().trim().max(DEMO_REQUEST_MESSAGE_MAX).refine(noNul).optional(),
  consent: z.literal(true),
  website: z.string().trim().max(0).optional(),
  locale: z.enum(['fr', 'en']).optional(),
})

export type CreateDemoRequestBody = z.infer<typeof createDemoRequestSchema>
