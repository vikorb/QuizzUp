import {
  formatVoucherCode,
  VOUCHER_STATE_CANCELLED,
  VOUCHER_STATE_EXPIRED,
  VOUCHER_STATE_REDEEMED,
  VOUCHER_STATUS_ACTIVE,
} from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { getCurrentAdminId } from '../_shared/adminContext'
import { voucherCodeBodySchema, vouchersParamsSchema } from './_schemas'
import { findVoucherByCode } from './_shared'

/** Refus d'une utilisation, selon l'état du bon : statut HTTP et code d'erreur. */
const REDEEM_REFUSALS = {
  [VOUCHER_STATE_CANCELLED]: [409, 'voucher_cancelled'],
  [VOUCHER_STATE_REDEEMED]: [409, 'voucher_already_redeemed'],
  [VOUCHER_STATE_EXPIRED]: [410, 'voucher_expired'],
} as const

/** Usage unique : marque le bon comme utilisé (« Marquer comme utilisé » à l'accueil). */
const voucherRedeemRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/vouchers/redeem',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.VOUCHER,
        API_ACTION.UPDATE
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = vouchersParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = voucherCodeBodySchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
      }

      const { companyId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const code = formatVoucherCode(parsedBody.data.code)

      if (!code) {
        return reply.code(404).send({ error: 'voucher_not_found' })
      }

      // Une seule instruction décide : deux comptoirs qui valident en même temps, un seul passe.
      const now = new Date()
      const redeemed = await db('vouchers')
        .where({ company_id: companyId, code, status: VOUCHER_STATUS_ACTIVE })
        .whereNull('redeemed_at')
        .where('expires_at', '>', now)
        .update({ redeemed_at: now, redeemed_by: getCurrentAdminId(req), updated_at: now })
        .returning('id')

      const voucher = await findVoucherByCode(companyId, code)

      if (!voucher) {
        return reply.code(404).send({ error: 'voucher_not_found' })
      }

      if (redeemed.length === 0) {
        // Un bon encore valable après un refus n'existe pas : seuls ces trois états refusent.
        const refusal = REDEEM_REFUSALS[voucher.state as keyof typeof REDEEM_REFUSALS]

        if (!refusal) {
          throw new Error('voucher redeem refused although valid')
        }

        return reply.code(refusal[0]).send({ error: refusal[1] })
      }

      return { voucher }
    }
  )
}

export default voucherRedeemRoutes
