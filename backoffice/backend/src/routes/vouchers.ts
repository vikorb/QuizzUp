import type { FastifyPluginAsync } from 'fastify'

import {
  VOUCHER_STATE_CANCELLED,
  VOUCHER_STATE_EXPIRED,
  VOUCHER_STATE_REDEEMED,
  VOUCHER_STATE_VALID,
  VOUCHER_STATUS_ACTIVE,
  VOUCHER_STATUS_INACTIVE,
} from '@quizzup/shared'
import { canAccessCompanyContext } from '../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../security/permissions'
import { requireApiPermission } from '../security/requireApiPermission'
import { vouchersListQuerySchema, vouchersParamsSchema } from './vouchers/_schemas'
import { toVoucherRow, voucherQuery, voucherSelect } from './vouchers/_shared'
import gameVouchersRoutes from './vouchers/gameVouchers'
import voucherStatusRoutes from './vouchers/idStatus'
import voucherLookupRoutes from './vouchers/lookup'
import voucherRedeemRoutes from './vouchers/redeem'

/** Bons de fidélisation d'une compagnie (US-VOUCHER-01) : émission, recherche, utilisation, annulation. */
const vouchersRoutes: FastifyPluginAsync = async (app) => {
  app.register(gameVouchersRoutes)
  app.register(voucherLookupRoutes)
  app.register(voucherRedeemRoutes)
  app.register(voucherStatusRoutes)

  app.get(
    '/companies/:companyId/vouchers',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.VOUCHER, API_ACTION.LIST)

      if (!hasPermission) {
        return
      }

      const parsedParams = vouchersParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedQuery = vouchersListQuerySchema.safeParse(req.query)

      if (!parsedQuery.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { state, gameId, limit, offset } = parsedQuery.data
      const now = new Date()

      // Même filtre pour la page et pour le total : `total` ne dépend pas de la page demandée.
      // Les états sont ceux de `getVoucherState` (annulé, utilisé, périmé, valable), écrits en SQL.
      const filteredVouchers = () => {
        const query = voucherQuery().where('vouchers.company_id', companyId)

        if (gameId) {
          query.where('vouchers.game_id', gameId)
        }

        if (state === VOUCHER_STATE_CANCELLED) {
          query.where('vouchers.status', VOUCHER_STATUS_INACTIVE)
        } else if (state === VOUCHER_STATE_REDEEMED) {
          query.where('vouchers.status', VOUCHER_STATUS_ACTIVE).whereNotNull('vouchers.redeemed_at')
        } else if (state === VOUCHER_STATE_EXPIRED) {
          query
            .where('vouchers.status', VOUCHER_STATUS_ACTIVE)
            .whereNull('vouchers.redeemed_at')
            .where('vouchers.expires_at', '<=', now)
        } else if (state === VOUCHER_STATE_VALID) {
          query
            .where('vouchers.status', VOUCHER_STATUS_ACTIVE)
            .whereNull('vouchers.redeemed_at')
            .where('vouchers.expires_at', '>', now)
        }

        return query
      }

      const [{ count }] = await filteredVouchers().count({ count: '*' })
      // Le plus récent d'abord ; l'id départage les égalités, donc deux pages ne se chevauchent jamais.
      const rows = await filteredVouchers()
        .select(voucherSelect)
        .orderBy('vouchers.created_at', 'desc')
        .orderBy('vouchers.id', 'desc')
        .limit(limit)
        .offset(offset)

      return { vouchers: rows.map((row) => toVoucherRow(row, now)), total: Number(count) }
    }
  )
}

export default vouchersRoutes
