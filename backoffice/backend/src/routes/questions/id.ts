import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { ANSWER_STATUS_DELETED, QUESTION_STATUS_DELETED } from '@quizzup/shared'
import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import {
  buildQuestionStatusPatch,
  canEditQuestion,
  canReadQuestion,
  ensureThemesAreUsable,
  getAnswerStatusFromQuestionStatus,
  getCurrentAdminId,
  getQuestionAccessRow,
  getQuestionWithAnswers,
  getThemesForQuestion,
  hasInvalidAnswerStatus,
  isValidQuestionMediaType,
  normalizeAnswers,
  parsePositiveId,
  parseQuestionThemeIds,
  syncQuestionThemes,
  validateAnswers,
  type QuestionBody,
  type QuestionParams,
} from './_shared'

const questionIdRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: QuestionParams }>(
    '/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.QUESTION, API_ACTION.READ)

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

      const question = await getQuestionWithAnswers(questionId, req)

      return { question }
    }
  )

  app.get<{ Params: QuestionParams }>(
    '/questions/:questionId/themes',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.QUESTION, API_ACTION.READ)

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

      const themes = await getThemesForQuestion(questionId)

      return { themes }
    }
  )

  app.patch<{ Params: QuestionParams; Body: QuestionBody }>(
    '/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: QuestionParams; Body: QuestionBody }>,
      reply: FastifyReply
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.UPDATE
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

      let nextThemeIds: number[] | null = null

      if (req.body.question !== undefined) {
        const questionText = req.body.question.trim()

        if (!questionText) {
          return reply.code(400).send({ error: 'question_required' })
        }

        patch.question = questionText
      }

      if (req.body.themeId !== undefined || req.body.themeIds !== undefined) {
        nextThemeIds = parseQuestionThemeIds(req.body)

        const themeError = await ensureThemesAreUsable(
          nextThemeIds,
          req,
          accessQuestion.scope,
          accessQuestion.company_id
        )

        if (themeError) {
          return reply.code(themeError === 'question_theme_forbidden' ? 403 : 400).send({
            error: themeError,
          })
        }
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

        if (hasInvalidAnswerStatus(answers)) {
          return reply.code(400).send({ error: 'question_answer_status_invalid' })
        }

        const answerStatus = getAnswerStatusFromQuestionStatus(accessQuestion.status)

        await db.transaction(async (trx) => {
          await trx('questions').where({ id: questionId }).update(patch)

          if (nextThemeIds !== null) {
            await syncQuestionThemes(trx, questionId, nextThemeIds)
          }

          const existingAnswers = await trx('answers')
            .where({ question_id: questionId })
            .whereNot('status', ANSWER_STATUS_DELETED)

          const existingIds = new Set(existingAnswers.map((answer) => Number(answer.id)))
          const keptIds = new Set<number>()

          // Diff : on conserve les réponses existantes par id, on met à jour celles
          // modifiées, on insère les nouvelles et on soft-delete uniquement les retirées.
          for (const answer of answers) {
            const existingId =
              answer.id !== undefined && existingIds.has(answer.id) ? answer.id : null

            if (existingId !== null) {
              keptIds.add(existingId)

              await trx('answers').where({ id: existingId, question_id: questionId }).update({
                response: answer.response,
                is_correct: answer.isCorrect,
                status: answerStatus,
                updated_at: trx.fn.now(),
                deleted_at: null,
              })
            } else {
              await trx('answers').insert({
                admin_id: adminId,
                question_id: questionId,
                response: answer.response,
                is_correct: answer.isCorrect,
                status: answerStatus,
                deleted_at: null,
              })
            }
          }

          for (const existingAnswer of existingAnswers) {
            if (keptIds.has(Number(existingAnswer.id))) {
              continue
            }

            await trx('answers').where({ id: existingAnswer.id, question_id: questionId }).update({
              status: ANSWER_STATUS_DELETED,
              updated_at: trx.fn.now(),
              deleted_at: trx.fn.now(),
            })
          }
        })
      } else {
        await db.transaction(async (trx) => {
          await trx('questions').where({ id: questionId }).update(patch)

          if (nextThemeIds !== null) {
            await syncQuestionThemes(trx, questionId, nextThemeIds)
          }
        })
      }

      const question = await getQuestionWithAnswers(questionId, req)

      return { question }
    }
  )

  app.delete<{ Params: QuestionParams }>(
    '/questions/:questionId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.DELETE
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

        await trx('answers').where({ question_id: questionId }).update({
          status: ANSWER_STATUS_DELETED,
          updated_at: trx.fn.now(),
          deleted_at: trx.fn.now(),
        })
      })

      const question = await getQuestionWithAnswers(questionId, req)

      return { question }
    }
  )
}

export default questionIdRoutes
