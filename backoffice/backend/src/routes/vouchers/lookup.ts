import type { FastifyPluginAsync } from 'fastify'

import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { voucherCodeBodySchema, vouchersParamsSchema } from './_schemas'
import { findVoucherByCode } from './_shared'

/** Détail d'un bon à partir de son code. Le code vient du corps : c'est une valeur au porteur. */
const voucherLookupRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/companies/:companyId/vouchers/lookup',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.VOUCHER, API_ACTION.READ)

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

      const voucher = await findVoucherByCode(companyId, parsedBody.data.code)

      if (!voucher) {
        return reply.code(404).send({ error: 'voucher_not_found' })
      }

      return { voucher }
    }
  )
}

export default voucherLookupRoutes
