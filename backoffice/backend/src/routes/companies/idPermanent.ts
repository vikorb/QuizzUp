import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { COMPANY_STATUS_DELETED } from '@quizzup/shared'
import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'

import { paramsSchema } from './_schemas'
import { findCompanyById } from './_shared'

const companiesIdPermanentRoutes: FastifyPluginAsync = async (app) => {
  app.delete(
    '/companies/:id/permanent',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.COMPANY,
        API_ACTION.PERMANENT_DELETE,
      )

      if (!hasPermission) {
        return
      }

      const parsed = paramsSchema.safeParse(req.params)

      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { id } = parsed.data

      const existingCompany = await findCompanyById(id)

      if (!existingCompany) {
        return reply.code(404).send({ error: 'not_found' })
      }

      if (existingCompany.status === COMPANY_STATUS_DELETED) {
        return reply.code(200).send({
          success: true,
          deleted: {
            companyId: id,
            adminsCount: 0,
            companiesCount: 0,
          },
        })
      }

      const updatedCompanies = await db('companies')
        .where('id', id)
        .update({
          status: COMPANY_STATUS_DELETED,
          updated_at: db.fn.now(),
          deleted_at: db.fn.now(),
        })

      return reply.code(200).send({
        success: true,
        deleted: {
          companyId: id,
          adminsCount: 0,
          companiesCount: updatedCompanies,
        },
      })
    },
  )
}

export default companiesIdPermanentRoutes
