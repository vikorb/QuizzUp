import { VOUCHER_STATE_REDEEMED, VOUCHER_STATUS_ACTIVE } from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { cancelVoucherSchema, voucherParamsSchema } from './_schemas'
import { findVoucherById } from './_shared'

/** Annulation d'un bon (admin seulement, Q9). Un bon utilisé ne revient pas en arrière en V1. */
const voucherStatusRoutes: FastifyPluginAsync = async (app) => {
  app.patch(
    '/companies/:companyId/vouchers/:voucherId/status',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.VOUCHER,
        API_ACTION.UPDATE_STATUS
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = voucherParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = cancelVoucherSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() })
      }

      const { companyId, voucherId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      // Même principe que l'utilisation : un bon utilisé simultanément ne peut pas être annulé.
      await db('vouchers')
        .where({ company_id: companyId, id: voucherId, status: VOUCHER_STATUS_ACTIVE })
        .whereNull('redeemed_at')
        .update({ status: parsedBody.data.status, updated_at: db.fn.now() })

      const voucher = await findVoucherById(companyId, voucherId)

      if (!voucher) {
        return reply.code(404).send({ error: 'voucher_not_found' })
      }

      // Déjà annulé : l'appel est idempotent. Utilisé : refus.
      if (voucher.state === VOUCHER_STATE_REDEEMED) {
        return reply.code(409).send({ error: 'voucher_already_redeemed' })
      }

      return { voucher }
    }
  )
}

export default voucherStatusRoutes
