import {
  COMPANY_STATUS_DELETED,
  formatVoucherCode,
  getVoucherState,
  VOUCHER_STATUS_DELETED,
} from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { createRateLimiter, replyTooManyRequests } from '../../security/rateLimit'
import { companyLogoUrl } from '../companies/_shared'
import { voucherCodeBodySchema } from '../vouchers/_schemas'
import { sendPublicError } from './_shared'

/** Corps d'une recherche : un code, 1 Ko suffit largement. */
export const VOUCHER_LOOKUP_BODY_LIMIT = 1024

/** Recherches acceptées par minute et par adresse : un code de 40 bits ne se devine pas à ce débit. */
export const VOUCHER_LOOKUP_RATE_LIMIT_MAX = 20
export const VOUCHER_LOOKUP_RATE_LIMIT_WINDOW_MS = 60_000

/**
 * `POST /public/v1/vouchers/lookup` : ce qu'un porteur voit de son bon (page `/bon/#<code>`). Ni le
 * nom du joueur ni la partie ne sortent. Un code mal formé, inconnu, supprimé ou d'une compagnie
 * supprimée répond le même 404.
 */
const publicVoucherRoutes: FastifyPluginAsync = async (app) => {
  // Un limiteur par instance du plugin (donc par application), en plus de celui de tout le préfixe.
  const limiter = createRateLimiter({
    max: VOUCHER_LOOKUP_RATE_LIMIT_MAX,
    windowMs: VOUCHER_LOOKUP_RATE_LIMIT_WINDOW_MS,
  })

  app.post(
    '/vouchers/lookup',
    {
      bodyLimit: VOUCHER_LOOKUP_BODY_LIMIT,
      // Compte toute recherche, même sans résultat : deviner des codes ne doit rien coûter de moins.
      onRequest: async (req, reply) => {
        const limit = limiter.hit(req.ip)

        if (!limit.allowed) return replyTooManyRequests(reply, limit.retryAfterSeconds)
      },
    },
    async (req, reply) => {
      // Le corps contient le code : ni lui ni les détails de Zod ne vont dans un journal.
      const parsed = voucherCodeBodySchema.safeParse(req.body)

      if (!parsed.success) {
        return sendPublicError(reply, 400, 'invalid_body', {
          fieldErrors: parsed.error.flatten().fieldErrors,
        })
      }

      const notFound = () => sendPublicError(reply, 404, 'voucher_not_found')
      const code = formatVoucherCode(parsed.data.code)

      if (!code) {
        return notFound()
      }

      const voucher = await db('vouchers')
        .where('code', code)
        .whereNot('status', VOUCHER_STATUS_DELETED)
        .first('company_id', 'label', 'expires_at', 'redeemed_at', 'status')

      if (!voucher) {
        return notFound()
      }

      const company = await db('companies')
        .where('id', voucher.company_id)
        .first('name', 'status', 'logo_key')

      if (!company || company.status === COMPANY_STATUS_DELETED) {
        return notFound()
      }

      return {
        label: voucher.label,
        companyName: company.name,
        logoUrl: companyLogoUrl(company.logo_key),
        expiresAt: voucher.expires_at,
        state: getVoucherState({
          status: voucher.status,
          redeemedAt: voucher.redeemed_at,
          expiresAt: voucher.expires_at,
        }),
      }
    }
  )
}

export default publicVoucherRoutes
