import type { FastifyPluginAsync } from 'fastify'

import { ADMIN_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import { canUpdateCompanyAccountStatusContext } from '../../../security/companiesPolicy'
import type { AdminStatusUpdateBody } from '../../../types/admin'

import { adminParamsSchema, updateAdminStatusSchema } from '../_schemas'
import { findAdminInCompany, findCompanyById, getAdminRow } from '../_shared'

const companyAdminIdStatusRoutes: FastifyPluginAsync = async (app) => {
  app.patch<{ Body: AdminStatusUpdateBody }>(
    '/companies/:companyId/admins/:adminId/status',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY_ACCOUNT,
        API_ACTION.UPDATE_STATUS,
      )

      if (!hasPermission) {
        return
      }

      const parsedParams = adminParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = updateAdminStatusSchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId, adminId } = parsedParams.data
      const { status } = parsedBody.data

      const existingCompany = await findCompanyById(companyId)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const existingAdmin = await findAdminInCompany(companyId, adminId)

      if (!existingAdmin) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (!canUpdateCompanyAccountStatusContext(req, companyId, existingAdmin)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      await db('admins')
        .where('company_id', companyId)
        .where('id', adminId)
        .update({
          status,
          updated_at: db.fn.now(),
          deleted_at: status === ADMIN_STATUS_DELETED ? db.fn.now() : null,
        })

      const account = await getAdminRow(companyId, adminId)

      return reply.code(200).send({
        account,
      })
    },
  )
}

export default companyAdminIdStatusRoutes
