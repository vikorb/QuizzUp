import { QUESTION_AUDIO_EFFECTS, QUESTION_MEDIA_PROVIDERS, THEME_SCOPES } from '@quizzup/shared'
import { z } from 'zod'

import { providerRefSchema } from '../../services/mediaProvider'

const booleanQuerySchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

/** Query de `POST /questions/import` ; portée et compagnie suivent les règles de `POST /questions`. */
export const importQuestionsQuerySchema = z.object({
  dryRun: booleanQuerySchema,
  draft: booleanQuerySchema,
  scope: z.enum(THEME_SCOPES).optional(),
  companyId: z.coerce.number().int().positive().optional(),
})

/** Effet audio d'une question : `null` l'efface (retour à `none`). */
export const questionAudioEffectSchema = z.enum(QUESTION_AUDIO_EFFECTS).nullable()

/** Corps de `PUT /questions/:questionId/media/provider` : un titre d'un fournisseur d'extraits. */
export const questionMediaProviderBodySchema = z.object({
  provider: z.enum(QUESTION_MEDIA_PROVIDERS),
  ref: providerRefSchema,
})
