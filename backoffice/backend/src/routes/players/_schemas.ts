import { z } from 'zod'

import {
  PLAYER_LIST_DEFAULT_LIMIT,
  PLAYER_LIST_MAX_LIMIT,
  PLAYER_SEARCH_MAX_LENGTH,
} from '@quizzup/shared'

export const playersParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

/**
 * `search` porte sur le nom seulement : la requête GET est écrite telle quelle dans les journaux
 * d'accès, une adresse e-mail n'y a pas sa place (elle passe par le corps, cf. `playerEmailSchema`).
 * `limit` au-delà du plafond est ramené au plafond ; 0 ou négatif est refusé.
 */
export const playersListQuerySchema = z.object({
  search: z.string().trim().max(PLAYER_SEARCH_MAX_LENGTH).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((limit) => Math.min(limit, PLAYER_LIST_MAX_LIMIT))
    .default(PLAYER_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
})

/**
 * L'adresse vient toujours du corps, jamais de l'URL. Sa forme n'est pas vérifiée : l'effacement
 * doit toujours pouvoir viser ce qui est stocké. La casse et les espaces sont normalisés par SQL.
 */
export const playerEmailSchema = z.strictObject({
  email: z.string().trim().min(1).max(255),
})
