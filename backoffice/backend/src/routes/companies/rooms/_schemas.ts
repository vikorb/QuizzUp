import { z } from 'zod'

import { ROOM_STATUS_ACTIVE, ROOM_STATUS_DELETED, ROOM_STATUS_INACTIVE } from '@quizzup/shared'

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

const roomConfigSchema = z
  .record(z.string(), z.unknown())
  .refine((config) => JSON.stringify(config).length <= ROOM_CONFIG_MAX_LENGTH, {
    message: 'room_config_too_large',
  })

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
