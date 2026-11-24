import { z } from 'zod'

import { isoInstantSchema } from '../games/_schemas'

export const statsParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

const periodBoundSchema = isoInstantSchema.optional()

/**
 * `from` et `to` sont des instants ISO 8601 avec fuseau, en intervalle semi-ouvert `[from, to)`
 * (comme l'historique). `tz` est un nom de fuseau IANA : sa validité se vérifie dans la route
 * (code propre `stats_timezone_invalid`), ici on borne seulement la taille.
 */
export const statsQuerySchema = z.object({
  from: periodBoundSchema,
  to: periodBoundSchema,
  roomId: z.coerce.number().int().positive().optional(),
  tz: z.string().max(64).optional(),
})
