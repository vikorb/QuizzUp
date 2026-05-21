import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import {
  buildThemeStatusPatch,
  canEditTheme,
  getThemeAccessRow,
  isValidThemeStatus,
  parsePositiveId,
  themeSelect,
  type ThemeParams,
  type ThemeStatusBody,
} from './_shared'

const themeIdStatusRoutes: FastifyPluginAsync = async (app) => {
  app.patch<{ Params: ThemeParams; Body: ThemeStatusBody }>(
    '/themes/:themeId/status',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: ThemeParams; Body: ThemeStatusBody }>,
      reply: FastifyReply,
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.THEME,
        API_ACTION.UPDATE_STATUS,
      )

      if (!hasPermission) {
        return
      }

      const themeId = parsePositiveId(req.params.themeId)

      if (themeId === null) {
        return reply.code(400).send({ error: 'theme_id_invalid' })
      }

      if (!isValidThemeStatus(req.body.status)) {
        return reply.code(400).send({ error: 'theme_status_invalid' })
      }

      const accessTheme = await getThemeAccessRow(themeId)

      if (!accessTheme) {
        return reply.code(404).send({ error: 'theme_not_found' })
      }

      if (!canEditTheme(accessTheme, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const [theme] = await db('themes')
        .where({ id: themeId })
        .update(buildThemeStatusPatch(req.body.status))
        .returning(themeSelect)

      return { theme }
    },
  )
}

export default themeIdStatusRoutes
