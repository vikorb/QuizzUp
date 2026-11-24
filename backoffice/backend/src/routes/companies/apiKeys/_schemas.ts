import {
  API_KEY_NAME_MAX_LENGTH,
  API_LOG_LIST_DEFAULT_LIMIT,
  API_LOG_LIST_MAX_LIMIT,
  API_LOG_STATUS_CLASSES,
} from '@quizzup/shared'
import { z } from 'zod'

export const apiKeysParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const apiKeyParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  apiKeyId: z.coerce.number().int().positive(),
})

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX_LENGTH),
})

/**
 * Journal des appels, du plus récent au plus ancien (`created_at`, puis `id`) ; `before` = `id` de
 * la dernière ligne lue.
 */
export const apiLogsQuerySchema = z.object({
  apiKeyId: z.coerce.number().int().positive().optional(),
  statusClass: z.enum(API_LOG_STATUS_CLASSES).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((limit) => Math.min(limit, API_LOG_LIST_MAX_LIMIT))
    .default(API_LOG_LIST_DEFAULT_LIMIT),
})
