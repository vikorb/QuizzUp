import { z } from 'zod'

import {
  GAME_PODIUMS,
  ROOM_LOG_LEVELS,
  ROOM_LOG_LIST_DEFAULT_LIMIT,
  ROOM_LOG_LIST_MAX_LIMIT,
  ROOM_MIN_DESKS,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'

export const ROOM_NAME_MAX_LENGTH = 255
/** Garde-fou sur la taille de la configuration matérielle stockée en JSON. */
export const ROOM_CONFIG_MAX_LENGTH = 20_000

export const roomsParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const roomParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  roomId: z.coerce.number().int().positive(),
})

const roomNameSchema = z.string().trim().min(1).max(ROOM_NAME_MAX_LENGTH)

/** `desksCount` (nombre de pupitres de la salle), s'il est présent : entier de 1 à 6. */
function hasValidDesksCount(config: Record<string, unknown>): boolean {
  const { desksCount } = config

  return (
    desksCount === undefined ||
    (Number.isInteger(desksCount) &&
      (desksCount as number) >= ROOM_MIN_DESKS &&
      (desksCount as number) <= GAME_PODIUMS)
  )
}

export const roomConfigSchema = z
  .record(z.string(), z.unknown())
  .refine((config) => JSON.stringify(config).length <= ROOM_CONFIG_MAX_LENGTH, {
    message: 'room_config_too_large',
  })
  .refine(hasValidDesksCount, { message: 'room_desks_count_invalid', path: ['desksCount'] })

export const createRoomSchema = z.object({
  name: roomNameSchema,
  config: roomConfigSchema.optional(),
})

export const updateRoomSchema = z
  .object({
    name: roomNameSchema.optional(),
    config: roomConfigSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.config !== undefined, {
    message: 'empty_body',
  })

export const updateRoomStatusSchema = z.object({
  status: z.union([
    z.literal(ROOM_STATUS_INACTIVE),
    z.literal(ROOM_STATUS_ACTIVE),
    z.literal(ROOM_STATUS_DELETED),
  ]),
})

/** Journaux d'une salle, du plus récent au plus ancien ; `before` = `id` de la dernière ligne lue. */
export const roomLogsQuerySchema = z.object({
  level: z.enum(ROOM_LOG_LEVELS).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((limit) => Math.min(limit, ROOM_LOG_LIST_MAX_LIMIT))
    .default(ROOM_LOG_LIST_DEFAULT_LIMIT),
})

/** Identifiant de connexion du PC de la salle (US-ROOM-02). */
export const createRoomAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .regex(/^[\w.-]+$/),
  password: z.string().min(8).max(100),
})
