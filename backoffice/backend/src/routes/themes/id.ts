import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import {
  QUESTION_STATUS_DELETED,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import {
  attachThemesToQuestions,
  canReadQuestion,
  getQuestionAccessRow,
  getQuestionWithAnswers,
  parsePositiveId as parsePositiveQuestionId,
  questionSelect,
  type QuestionAccessRow,
} from '../questions/_shared'
import {
  buildThemeStatusPatch,
  canEditTheme,
  canReadTheme,
  getThemeAccessRow,
  isValidThemeMode,
  parsePositiveId,
  themeSelect,
  type ThemeAccessRow,
  type ThemeBody,
  type ThemeParams,
} from './_shared'

type ThemeQuestionParams = ThemeParams & {
  questionId: string
}

function canLinkQuestionToTheme(
  theme: ThemeAccessRow,
  question: QuestionAccessRow,
): boolean {
  if (theme.scope === THEME_SCOPE_GLOBAL) {
    return question.scope === THEME_SCOPE_GLOBAL
  }

  if (question.scope === THEME_SCOPE_GLOBAL) {
    return true
  }

  return theme.company_id === question.company_id
}

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

  app.get<{ Params: ThemeParams }>(
    '/themes/:themeId/questions',
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

      const questionsWithoutThemes = await db('questions')
        .select(questionSelect)
        .join('question_themes', 'question_themes.question_id', 'questions.id')
        .where('question_themes.theme_id', themeId)
        .whereNot('questions.status', QUESTION_STATUS_DELETED)
        .orderBy('questions.id', 'asc')

      const questions = await attachThemesToQuestions(questionsWithoutThemes)

      return { questions }
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

  app.post<{ Params: ThemeQuestionParams }>(
    '/themes/:themeId/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: ThemeQuestionParams }>,
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
      const questionId = parsePositiveQuestionId(req.params.questionId)

      if (themeId === null) {
        return reply.code(400).send({ error: 'theme_id_invalid' })
      }

      if (questionId === null) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      const accessTheme = await getThemeAccessRow(themeId)

      if (!accessTheme || accessTheme.status === THEME_STATUS_DELETED) {
        return reply.code(404).send({ error: 'theme_not_found' })
      }

      if (!canEditTheme(accessTheme, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const accessQuestion = await getQuestionAccessRow(questionId)

      if (!accessQuestion || accessQuestion.status === QUESTION_STATUS_DELETED) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canReadQuestion(accessQuestion, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      if (!canLinkQuestionToTheme(accessTheme, accessQuestion)) {
        return reply.code(400).send({ error: 'question_theme_scope_mismatch' })
      }

      await db('question_themes')
        .insert({
          question_id: questionId,
          theme_id: themeId,
        })
        .onConflict(['question_id', 'theme_id'])
        .ignore()

      const question = await getQuestionWithAnswers(questionId)

      return { question }
    },
  )

  app.delete<{ Params: ThemeQuestionParams }>(
    '/themes/:themeId/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: ThemeQuestionParams }>,
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
      const questionId = parsePositiveQuestionId(req.params.questionId)

      if (themeId === null) {
        return reply.code(400).send({ error: 'theme_id_invalid' })
      }

      if (questionId === null) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      const accessTheme = await getThemeAccessRow(themeId)

      if (!accessTheme) {
        return reply.code(404).send({ error: 'theme_not_found' })
      }

      if (!canEditTheme(accessTheme, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const accessQuestion = await getQuestionAccessRow(questionId)

      if (!accessQuestion) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canReadQuestion(accessQuestion, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const [{ count }] = await db('question_themes')
        .where({ question_id: questionId })
        .count<{ count: string }[]>('* as count')

      if (Number(count) <= 1) {
        return reply.code(400).send({ error: 'question_theme_last_link' })
      }

      await db('question_themes')
        .where({
          question_id: questionId,
          theme_id: themeId,
        })
        .delete()

      const question = await getQuestionWithAnswers(questionId)

      return { question }
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
