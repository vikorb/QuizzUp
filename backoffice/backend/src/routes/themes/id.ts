import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { THEME_STATUS_DELETED } from '@quizzup/shared'
import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import {
  buildThemeStatusPatch,
  canEditTheme,
  canReadTheme,
  getThemeAccessRow,
  isValidThemeMode,
  parsePositiveId,
  themeSelect,
  type ThemeBody,
  type ThemeParams,
} from './_shared'

const themeIdRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: ThemeParams }>(
    '/themes/:themeId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: ThemeParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.THEME,
        API_ACTION.READ,
      )

      if (!hasPermission) {
        return
      }

      const themeId = parsePositiveId(req.params.themeId)

      if (themeId === null) {
        return reply.code(400).send({ error: 'theme_id_invalid' })
      }

      const accessTheme = await getThemeAccessRow(themeId)

      if (!accessTheme) {
        return reply.code(404).send({ error: 'theme_not_found' })
      }

      if (!canReadTheme(accessTheme, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const theme = await db('themes').select(themeSelect).where({ id: themeId }).first()

      return { theme }
    },
  )

  app.patch<{ Params: ThemeParams; Body: ThemeBody }>(
    '/themes/:themeId',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: ThemeParams; Body: ThemeBody }>,
      reply: FastifyReply,
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.THEME,
        API_ACTION.UPDATE,
      )

      if (!hasPermission) {
        return
      }

      const themeId = parsePositiveId(req.params.themeId)

      if (themeId === null) {
        return reply.code(400).send({ error: 'theme_id_invalid' })
      }

      const accessTheme = await getThemeAccessRow(themeId)

      if (!accessTheme) {
        return reply.code(404).send({ error: 'theme_not_found' })
      }

      if (!canEditTheme(accessTheme, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const patch: Record<string, unknown> = {
        updated_at: db.fn.now(),
      }

      if (req.body.name !== undefined) {
        const name = req.body.name.trim()

        if (!name) {
          return reply.code(400).send({ error: 'theme_name_required' })
        }

        patch.name = name
      }

      if (req.body.mode !== undefined) {
        if (!isValidThemeMode(req.body.mode)) {
          return reply.code(400).send({ error: 'theme_mode_invalid' })
        }

        patch.mode = req.body.mode
      }

      const [theme] = await db('themes')
        .where({ id: themeId })
        .update(patch)
        .returning(themeSelect)

      return { theme }
    },
  )

  app.delete<{ Params: ThemeParams }>(
    '/themes/:themeId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: ThemeParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.THEME,
        API_ACTION.DELETE,
      )

      if (!hasPermission) {
        return
      }

      const themeId = parsePositiveId(req.params.themeId)

      if (themeId === null) {
        return reply.code(400).send({ error: 'theme_id_invalid' })
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
        .update(buildThemeStatusPatch(THEME_STATUS_DELETED))
        .returning(themeSelect)

      return { theme }
    },
  )
}

export default themeIdRoutes
