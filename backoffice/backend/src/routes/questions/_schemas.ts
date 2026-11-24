import { z } from 'zod'

import { QUESTION_MEDIA_PROVIDERS, THEME_SCOPES } from '@quizzup/shared'

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

/** Corps de `PUT /questions/:questionId/media/provider` : un titre d'un fournisseur d'extraits. */
export const questionMediaProviderBodySchema = z.object({
  provider: z.enum(QUESTION_MEDIA_PROVIDERS),
  ref: providerRefSchema,
})
