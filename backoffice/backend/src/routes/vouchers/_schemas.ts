import { z } from 'zod'

import {
  VOUCHER_LIST_DEFAULT_LIMIT,
  VOUCHER_LIST_MAX_LIMIT,
  VOUCHER_STATES,
  VOUCHER_STATUS_INACTIVE,
} from '@quizzup/shared'

export const vouchersParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const gameVouchersParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  gameId: z.coerce.number().int().positive(),
})

export const voucherParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  voucherId: z.coerce.number().int().positive(),
})

// Les ids bigint sortent de l'API en nombres ; on accepte aussi "7".
export const issueVoucherSchema = z.object({
  participantId: z.coerce.number().int().positive(),
})

/**
 * Le code est une valeur au porteur : il vient toujours du corps. Sa forme (8 caractères, alphabet
 * de Crockford) n'est pas vérifiée ici : un code mal formé répond 404, comme un code inconnu.
 */
export const voucherCodeBodySchema = z.object({
  code: z.string().max(64),
})

/** Seule l'annulation existe : pas de retour d'un bon annulé ou utilisé à l'état actif. */
export const cancelVoucherSchema = z.object({
  status: z.literal(VOUCHER_STATUS_INACTIVE),
})

/** `limit` au-delà du plafond est ramené au plafond ; 0 ou négatif est refusé. */
export const vouchersListQuerySchema = z.object({
  state: z.enum(VOUCHER_STATES).optional(),
  gameId: z.coerce.number().int().positive().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((limit) => Math.min(limit, VOUCHER_LIST_MAX_LIMIT))
    .default(VOUCHER_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
})
