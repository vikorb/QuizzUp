import { API_KEY_STATUS_ACTIVE, API_KEY_STATUS_REVOKED } from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../../../db'
import { canAccessCompanyContext } from '../../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import { apiKeyParamsSchema } from './_schemas'
import { type ApiKeyDbRow, apiKeySelect, toApiKeys } from './_shared'

/** Révocation d'une clé d'API (lot 14.1) : suppression logique, idempotente. */
const companyApiKeyIdRoutes: FastifyPluginAsync = async (app) => {
  app.delete(
    '/companies/:companyId/api-keys/:apiKeyId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!requireApiPermission(req, reply, API_RESOURCE.API_KEY, API_ACTION.DELETE)) {
        return
      }

      const parsedParams = apiKeyParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId, apiKeyId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      // Le filtre sur le statut rend l'appel idempotent : une clé déjà révoquée n'est pas touchée.
      await db('api_keys')
        .where('id', apiKeyId)
        .where('company_id', companyId)
        .where('status', API_KEY_STATUS_ACTIVE)
        .update({
          status: API_KEY_STATUS_REVOKED,
          deleted_at: db.fn.now(),
          updated_at: db.fn.now(),
        })

      const row = (await db('api_keys')
        .where('id', apiKeyId)
        .where('company_id', companyId)
        .first(apiKeySelect)) as ApiKeyDbRow | undefined

      if (!row) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const [apiKey] = await toApiKeys([row], companyId)

      return { apiKey }
    }
  )
}

export default companyApiKeyIdRoutes
