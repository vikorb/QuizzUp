import type { FastifyPluginAsync } from 'fastify'

import {
  API_KEY_MAX_ACTIVE,
  API_KEY_STATUS_ACTIVE,
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../../../db'
import { generateApiKey } from '../../../security/apiKeys'
import { canAccessCompanyContext, getCurrentAdminId } from '../../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'

import { isUniqueViolation } from '../../_shared/dbErrors'
import { findCompanyById } from '../_shared'
import { apiKeysParamsSchema, createApiKeySchema } from './_schemas'
import { apiKeySelect, toApiKeys, type ApiKeyDbRow } from './_shared'

/** Collision de préfixe (32 bits) : on retire un autre jeton plutôt que de répondre 500. */
const CREATE_MAX_ATTEMPTS = 5

type CreateOutcome =
  | { row: ApiKeyDbRow }
  | { error: 'not_found' | 'company_deleted' | 'company_inactive' | 'api_key_limit_reached' }

const ERROR_STATUS = {
  not_found: 404,
  company_deleted: 409,
  company_inactive: 409,
  api_key_limit_reached: 409,
} as const

/** Clés d'API de la compagnie (lot 14.1) : liste et création. La révocation est dans `id.ts`. */
const companyApiKeysRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/api-keys',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!requireApiPermission(req, reply, API_RESOURCE.API_KEY, API_ACTION.LIST)) {
        return
      }

      const parsedParams = apiKeysParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const { companyId } = parsedParams.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      if (!(await findCompanyById(companyId))) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const rows = (await db('api_keys')
        .where('company_id', companyId)
        .orderBy('id', 'desc')
        .select(apiKeySelect)) as ApiKeyDbRow[]

      return { apiKeys: await toApiKeys(rows) }
    }
  )

  app.post(
    '/companies/:companyId/api-keys',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!requireApiPermission(req, reply, API_RESOURCE.API_KEY, API_ACTION.CREATE)) {
        return
      }

      const parsedParams = apiKeysParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedBody = createApiKeySchema.safeParse(req.body)

      if (!parsedBody.success) {
        return reply.code(400).send({
          error: 'invalid_body',
          details: parsedBody.error.flatten(),
        })
      }

      const { companyId } = parsedParams.data
      const { name } = parsedBody.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      for (let attempt = 0; attempt < CREATE_MAX_ATTEMPTS; attempt += 1) {
        const generated = generateApiKey()

        try {
          // Une transaction par essai : une violation d'unicité annule la transaction en cours.
          const outcome = await db.transaction<CreateOutcome>(async (trx) => {
            // Le verrou sur la compagnie sérialise les créations : sans lui, deux requêtes
            // simultanées compteraient chacune 9 clés actives et en créeraient une 10e et une 11e.
            const company = await trx('companies')
              .where('id', companyId)
              .forUpdate()
              .first('id', 'status')

            if (!company) {
              return { error: 'not_found' }
            }

            if (Number(company.status) === COMPANY_STATUS_DELETED) {
              return { error: 'company_deleted' }
            }

            if (Number(company.status) !== COMPANY_STATUS_ACTIVE) {
              return { error: 'company_inactive' }
            }

            const active = await trx('api_keys')
              .where('company_id', companyId)
              .where('status', API_KEY_STATUS_ACTIVE)
              .count()
              .first()

            if (Number(active?.count ?? 0) >= API_KEY_MAX_ACTIVE) {
              return { error: 'api_key_limit_reached' }
            }

            const inserted = await trx('api_keys')
              .insert({
                company_id: companyId,
                name,
                key_prefix: generated.prefix,
                key_hash: generated.hash,
                created_by_admin_id: getCurrentAdminId(req),
                status: API_KEY_STATUS_ACTIVE,
                deleted_at: null,
              })
              .returning(apiKeySelect)

            return { row: (Array.isArray(inserted) ? inserted[0] : inserted) as ApiKeyDbRow }
          })

          if ('error' in outcome) {
            return reply.code(ERROR_STATUS[outcome.error]).send({ error: outcome.error })
          }

          const [apiKey] = await toApiKeys([outcome.row])

          // Le secret n'est renvoyé qu'ici : ni stocké, ni journalisé, ni mis en cache.
          return reply
            .code(201)
            .header('Cache-Control', 'no-store')
            .send({ apiKey, secret: generated.token })
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error
          }
        }
      }

      throw new Error('api_key_generation_collision')
    }
  )
}

export default companyApiKeysRoutes
