import { COMPANY_STATUS_DELETED } from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { canUpdateCompanyStatusContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import type { CompanyStatusUpdateBody } from '../../types/company'
import { paramsSchema, updateCompanyStatusSchema } from './_schemas'
import { findCompanyById, getCompanyAdminsCount, toCompanyRow } from './_shared'

const companiesIdStatusRoutes: FastifyPluginAsync = async (app) => {
  app.patch<{ Body: CompanyStatusUpdateBody }>(
    '/companies/:id/status',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY,
        API_ACTION.UPDATE_STATUS
      )

      if (!hasPermission) {
        return
      }

      if (!canUpdateCompanyStatusContext(req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const parsedParams = paramsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateCompanyStatusSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { id } = parsedParams.data
      const { status } = parsedBody.data

      const existingCompany = await findCompanyById(id)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const updated = await db('companies')
        .where('id', id)
        .update({
          status,
          updated_at: db.fn.now(),
          deleted_at: status === COMPANY_STATUS_DELETED ? db.fn.now() : null,
        })
        .returning([
          'id',
          'name',
          'email',
          'status',
          'created_at as createdAt',
          'updated_at as updatedAt',
          'deleted_at as deletedAt',
          'logo_key as logoKey',
          'voucher_label as voucherLabel',
          'voucher_validity_days as voucherValidityDays',
        ])

      const updatedCompanyBase = Array.isArray(updated) ? updated[0] : updated
      const accountsCount = await getCompanyAdminsCount(id)

      return reply.code(200).send({
        company: toCompanyRow({ ...updatedCompanyBase, accountsCount }),
      })
    }
  )
}

export default companiesIdStatusRoutes
