import { z } from 'zod'

export const statsParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

// Même règle que l'historique des parties : l'année 0000 est valide en ISO 8601 mais PostgreSQL
// la refuse (pas d'année 0), d'où un 500 sans ce garde-fou.
const periodBoundSchema = z.iso
  .datetime({ offset: true })
  .refine((instant) => !instant.startsWith('0000'))
  .optional()

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
