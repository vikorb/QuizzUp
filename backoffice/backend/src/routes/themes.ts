import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { Knex } from 'knex'

import { THEME_SCOPE_COMPANY, THEME_SCOPE_GLOBAL, THEME_STATUS_DELETED } from '@quizzup/shared'
import db from '../db'
import { API_ACTION, API_RESOURCE } from '../security/permissions'
import { requireApiPermission } from '../security/requireApiPermission'
import { getCurrentCompanyId, isSuperadmin } from '../security/companiesPolicy'
import {
  getCreateThemeStatus,
  getCurrentAdminId,
  getThemeCompanyId,
  getThemeScope,
  isValidThemeMode,
  isValidThemeScope,
  isValidThemeStatus,
  parseOptionalNumber,
  themeSelect,
  type ThemeBody,
  type ThemeQuery,
} from './themes/_shared'
import themeIdRoutes from './themes/id'
import themeIdStatusRoutes from './themes/idStatus'

const themesRoutes: FastifyPluginAsync = async (app) => {
  app.register(themeIdRoutes)
  app.register(themeIdStatusRoutes)

  app.get<{ Querystring: ThemeQuery }>(
    '/themes',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Querystring: ThemeQuery }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.THEME,
        API_ACTION.LIST,
      )

      if (!hasPermission) {
        return
      }

      const currentCompanyId = getCurrentCompanyId(req)
      const query = req.query

      const themesQuery = db('themes').select(themeSelect)

      if (!isSuperadmin(req)) {
        themesQuery.where(function filterVisibleThemes(this: Knex.QueryBuilder) {
          this.where('scope', THEME_SCOPE_GLOBAL)

          if (currentCompanyId !== null) {
            this.orWhere(function filterCompanyThemes(this: Knex.QueryBuilder) {
              this.where('scope', THEME_SCOPE_COMPANY).where('company_id', currentCompanyId)
            })
          }
        })
      }

      if (query.search) {
        themesQuery.whereILike('name', `%${query.search}%`)
      }

      if (query.mode && isValidThemeMode(query.mode)) {
        themesQuery.where('mode', query.mode)
      }

      const status = parseOptionalNumber(query.status)

      if (status !== null && isValidThemeStatus(status)) {
        themesQuery.where('status', status)
      } else {
        themesQuery.whereNot('status', THEME_STATUS_DELETED)
      }

      if (query.scope && isValidThemeScope(query.scope)) {
        themesQuery.where('scope', query.scope)
      }

      const themes = await themesQuery.orderBy('id', 'asc')

      return { themes }
    },
  )

  app.post<{ Body: ThemeBody }>(
    '/themes',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Body: ThemeBody }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.THEME,
        API_ACTION.CREATE,
      )

      if (!hasPermission) {
        return
      }

      const adminId = getCurrentAdminId(req)

      if (adminId === null) {
        return reply.code(401).send({ error: 'unauthorized' })
      }

      const name = req.body.name?.trim()
      const mode = req.body.mode

      if (!name) {
        return reply.code(400).send({ error: 'theme_name_required' })
      }

      if (!isValidThemeMode(mode)) {
        return reply.code(400).send({ error: 'theme_mode_invalid' })
      }

      const requestedScope = isValidThemeScope(req.body.scope) ? req.body.scope : undefined
      const scope = getThemeScope(req, requestedScope)
      const companyId = getThemeCompanyId(req, scope, req.body.companyId)

      if (scope === THEME_SCOPE_COMPANY && companyId === null) {
        return reply.code(400).send({ error: 'theme_company_required' })
      }

      const [theme] = await db('themes')
        .insert({
          admin_id: adminId,
          company_id: companyId,
          scope,
          name,
          mode,
          status: getCreateThemeStatus(req),
          deleted_at: null,
        })
        .returning(themeSelect)

      return reply.code(201).send({ theme })
    },
  )
}

export default themesRoutes
