import type { FastifyPluginAsync } from 'fastify'

import { canAccessCompanyContext } from '../../security/companiesPolicy'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'

import { loadCompanyStats } from './_queries'
import { statsParamsSchema, statsQuerySchema } from './_schemas'
import { isSupportedTimeZone, resolveStatsPeriod, STATS_DEFAULT_TIME_ZONE } from './_shared'

/** Statistiques d'exploitation d'une compagnie (US-STATS-01) : agrégats seulement, aucun joueur. */
const statsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/companies/:companyId/stats', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!requireApiPermission(req, reply, API_RESOURCE.STATS, API_ACTION.READ)) {
      return
    }

    const parsedParams = statsParamsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const { companyId } = parsedParams.data

    if (!canAccessCompanyContext(req, companyId)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const parsedQuery = statsQuerySchema.safeParse(req.query)

    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'invalid_params' })
    }

    const { from, to, roomId, tz } = parsedQuery.data
    const timeZone = tz ?? STATS_DEFAULT_TIME_ZONE

    if (!isSupportedTimeZone(timeZone)) {
      return reply.code(400).send({ error: 'stats_timezone_invalid' })
    }

    const period = resolveStatsPeriod(from, to)

    if (!period) {
      return reply.code(400).send({ error: 'stats_period_invalid' })
    }

    const stats = await loadCompanyStats({ companyId, roomId, ...period, timeZone })

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), timeZone },
      ...stats,
    }
  })
}

export default statsRoutes
