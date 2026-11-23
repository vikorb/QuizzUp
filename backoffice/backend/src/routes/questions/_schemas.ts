import { z } from 'zod'

import { THEME_SCOPES } from '@quizzup/shared'

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
