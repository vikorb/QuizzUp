import { z } from 'zod'

import { DEMO_REQUEST_MESSAGE_MAX, DEMO_REQUEST_ROOMS_MAX } from '@quizzup/shared'

/**
 * Corps de `POST /public/v1/demo-requests`. `website` est le champ piège : invisible pour une
 * personne, rempli par les robots. Quand il l'est, la route répond 202 avant d'arriver ici ; le
 * schéma ne l'accepte donc que vide.
 */
export const createDemoRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  centerName: z.string().trim().min(1).max(160),
  email: z.email().max(254),
  phone: z
    .string()
    .regex(/^[+0-9 ().-]{6,32}$/)
    .optional(),
  roomsCount: z.number().int().min(1).max(DEMO_REQUEST_ROOMS_MAX),
  message: z.string().max(DEMO_REQUEST_MESSAGE_MAX).optional(),
  consent: z.literal(true),
  website: z.string().trim().max(0).optional(),
  locale: z.enum(['fr', 'en']).optional(),
})

export type CreateDemoRequestBody = z.infer<typeof createDemoRequestSchema>
