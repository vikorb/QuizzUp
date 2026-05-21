import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import {
  ANSWER_STATUS_DELETED,
  QUESTION_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import {
  answerSelect,
  buildQuestionStatusPatch,
  canEditQuestion,
  canReadQuestion,
  ensureThemeIsUsable,
  getAnswerStatusFromQuestionStatus,
  getCurrentAdminId,
  getQuestionAccessRow,
  getQuestionWithAnswers,
  isValidQuestionMediaType,
  normalizeAnswers,
  parsePositiveId,
  questionSelect,
  validateAnswers,
  type QuestionBody,
  type QuestionParams,
} from './_shared'

const questionIdRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: QuestionParams }>(
    '/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.READ,
      )

      if (!hasPermission) {
        return
      }

      const questionId = parsePositiveId(req.params.questionId)

      if (questionId === null) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      const accessQuestion = await getQuestionAccessRow(questionId)

      if (!accessQuestion) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canReadQuestion(accessQuestion, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const question = await getQuestionWithAnswers(questionId)

      return { question }
    },
  )

  app.patch<{ Params: QuestionParams; Body: QuestionBody }>(
    '/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: QuestionParams; Body: QuestionBody }>,
      reply: FastifyReply,
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.UPDATE,
      )

      if (!hasPermission) {
        return
      }

      const adminId = getCurrentAdminId(req)
      const questionId = parsePositiveId(req.params.questionId)

      if (adminId === null) {
        return reply.code(401).send({ error: 'unauthorized' })
      }

      if (questionId === null) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      const accessQuestion = await getQuestionAccessRow(questionId)

      if (!accessQuestion) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canEditQuestion(accessQuestion, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const patch: Record<string, unknown> = {
        updated_at: db.fn.now(),
      }

      if (req.body.question !== undefined) {
        const questionText = req.body.question.trim()

        if (!questionText) {
          return reply.code(400).send({ error: 'question_required' })
        }

        patch.question = questionText
      }

      if (req.body.themeId !== undefined) {
        const themeId = parsePositiveId(req.body.themeId)

        if (themeId === null) {
          return reply.code(400).send({ error: 'question_theme_required' })
        }

        const themeError = await ensureThemeIsUsable(
          themeId,
          req,
          accessQuestion.scope,
          accessQuestion.company_id,
        )

        if (themeError) {
          return reply.code(themeError === 'question_theme_forbidden' ? 403 : 400).send({
            error: themeError,
          })
        }

        patch.theme_id = themeId
      }

      if (req.body.typeMedia !== undefined) {
        if (!isValidQuestionMediaType(req.body.typeMedia)) {
          return reply.code(400).send({ error: 'question_type_media_invalid' })
        }

        patch.type_media = req.body.typeMedia
      }

      if (req.body.mediaUrl !== undefined) {
        patch.media_url = req.body.mediaUrl
      }

      if (req.body.answers !== undefined) {
        const answers = normalizeAnswers(req.body.answers)
        const answersError = validateAnswers(answers)

        if (answersError) {
          return reply.code(400).send({ error: answersError })
        }

        const answerStatus = getAnswerStatusFromQuestionStatus(accessQuestion.status)

        await db.transaction(async (trx) => {
          await trx('questions').where({ id: questionId }).update(patch)

          await trx('answers')
            .where({ question_id: questionId })
            .update({
              status: ANSWER_STATUS_DELETED,
              updated_at: trx.fn.now(),
              deleted_at: trx.fn.now(),
            })

          await trx('answers').insert(
            answers.map((answer) => ({
              admin_id: adminId,
              question_id: questionId,
              response: answer.response,
              is_correct: answer.isCorrect,
              status: answerStatus,
              deleted_at: null,
            })),
          )
        })
      } else {
        await db('questions').where({ id: questionId }).update(patch)
      }

      const question = await getQuestionWithAnswers(questionId)

      return { question }
    },
  )

  app.delete<{ Params: QuestionParams }>(
    '/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.DELETE,
      )

      if (!hasPermission) {
        return
      }

      const questionId = parsePositiveId(req.params.questionId)

      if (questionId === null) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      const accessQuestion = await getQuestionAccessRow(questionId)

      if (!accessQuestion) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canEditQuestion(accessQuestion, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      await db.transaction(async (trx) => {
        await trx('questions')
          .where({ id: questionId })
          .update(buildQuestionStatusPatch(QUESTION_STATUS_DELETED))

        await trx('answers')
          .where({ question_id: questionId })
          .update({
            status: ANSWER_STATUS_DELETED,
            updated_at: trx.fn.now(),
            deleted_at: trx.fn.now(),
          })
      })

      const question = await db('questions')
        .select(questionSelect)
        .leftJoin('themes', 'themes.id', 'questions.theme_id')
        .where('questions.id', questionId)
        .first()

      const answers = await db('answers')
        .select(answerSelect)
        .where({ question_id: questionId })
        .orderBy('id', 'asc')

      return {
        question: question
          ? {
              ...question,
              answers,
            }
          : null,
      }
    },
  )
}

export default questionIdRoutes
