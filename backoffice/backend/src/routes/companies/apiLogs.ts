import type { ApiLog } from '@quizzup/shared'
import type { FastifyPluginAsync } from 'fastify'

import db from '../../db'
import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import { findCompanyById } from './_shared'
import { apiKeysParamsSchema, apiLogsQuerySchema } from './apiKeys/_schemas'

type ApiLogDbRow = {
  id: number
  api_key_id: number
  method: string
  route: string
  status_code: number
  error_code: string | null
  game_id: number | null
  duration_ms: number
  idempotent_replay: boolean
  created_at: Date | string
}

/** Journal des appels reçus par `/public/v1` avec une clé de la compagnie (lot 14.1). */
const companyApiLogsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/companies/:companyId/api-logs',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!requireApiPermission(req, reply, API_RESOURCE.API_LOG, API_ACTION.LIST)) {
        return
      }

      const parsedParams = apiKeysParamsSchema.safeParse(req.params)

      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'invalid_params' })
      }

      const parsedQuery = apiLogsQuerySchema.safeParse(req.query)

      if (!parsedQuery.success) {
        return reply
          .code(400)
          .send({ error: 'invalid_query', details: parsedQuery.error.flatten() })
      }

      const { companyId } = parsedParams.data
      const { apiKeyId, statusClass, before, limit } = parsedQuery.data

      if (!canAccessCompanyContext(req, companyId)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      if (!(await findCompanyById(companyId))) {
        return reply.code(404).send({ error: 'not_found' })
      }

      const query = db('api_request_logs').where('company_id', companyId)

      if (apiKeyId) {
        query.where('api_key_id', apiKeyId)
      }

      if (statusClass) {
        // '4xx' : de 400 inclus à 500 exclu.
        const first = Number(statusClass[0]) * 100

        query.where('status_code', '>=', first).where('status_code', '<', first + 100)
      }

      if (before) {
        // Curseur composite sur l'ordre de l'index (company_id, created_at DESC, id DESC) : `before`
        // est l'`id` de la dernière ligne lue. Un `id` hors de la compagnie ne retrouve aucune ligne
        // de référence : la comparaison est nulle et la page vide.
        query.whereRaw(
          '(created_at, id) < (SELECT created_at, id FROM api_request_logs WHERE id = ? AND company_id = ?)',
          [before, companyId]
        )
      }

      // Une ligne de plus que la page : sa présence dit s'il y a une page suivante.
      const rows = (await query
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit + 1)
        .select(
          'id',
          'api_key_id',
          'method',
          'route',
          'status_code',
          'error_code',
          'game_id',
          'duration_ms',
          'idempotent_replay',
          'created_at'
        )) as ApiLogDbRow[]

      const page = rows.slice(0, limit)
      const keyIds = [...new Set(page.map((row) => Number(row.api_key_id)))]
      const keys =
        keyIds.length > 0
          ? ((await db('api_keys')
              .where('company_id', companyId)
              .whereIn('id', keyIds)
              .select('id', 'key_prefix')) as Array<{ id: number; key_prefix: string }>)
          : []
      const prefixes = new Map(keys.map((key) => [Number(key.id), key.key_prefix]))

      const logs = page.map((row): ApiLog => ({
        id: Number(row.id),
        apiKeyId: Number(row.api_key_id),
        keyPrefix: prefixes.get(Number(row.api_key_id)) ?? '',
        method: row.method,
        route: row.route,
        statusCode: Number(row.status_code),
        errorCode: row.error_code,
        gameId: row.game_id === null ? null : Number(row.game_id),
        durationMs: Number(row.duration_ms),
        idempotentReplay: row.idempotent_replay,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      }))

      return {
        logs,
        nextBefore: rows.length > limit ? (logs[logs.length - 1]?.id ?? null) : null,
      }
    }
  )
}

export default companyApiLogsRoutes
