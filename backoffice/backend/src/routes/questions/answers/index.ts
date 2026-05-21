import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { ANSWER_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import {
  answerSelect,
  canEditQuestion,
  canReadQuestion,
  getCreateAnswerStatus,
  getCurrentAdminId,
  getQuestionAccessRow,
  parsePositiveId,
  type AnswerBody,
  type QuestionParams,
} from '../_shared'

const questionAnswersRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: QuestionParams }>(
    '/questions/:questionId/answers',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.ANSWER,
        API_ACTION.LIST,
      )

      if (!hasPermission) {
        return
      }

      const questionId = parsePositiveId(req.params.questionId)

      if (questionId === null) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      const question = await getQuestionAccessRow(questionId)

      if (!question) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canReadQuestion(question, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const answers = await db('answers')
        .select(answerSelect)
        .where({ question_id: questionId })
        .whereNot('status', ANSWER_STATUS_DELETED)
        .orderBy('id', 'asc')

      return { answers }
    },
  )

  app.post<{ Params: QuestionParams; Body: AnswerBody }>(
    '/questions/:questionId/answers',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: QuestionParams; Body: AnswerBody }>,
      reply: FastifyReply,
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.ANSWER,
        API_ACTION.CREATE,
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

      const question = await getQuestionAccessRow(questionId)

      if (!question) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canEditQuestion(question, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const response = req.body.response?.trim()

      if (!response) {
        return reply.code(400).send({ error: 'answer_response_required' })
      }

      const isCorrect = req.body.isCorrect ?? false

      const answer = await db.transaction(async (trx) => {
        if (isCorrect) {
          await trx('answers')
            .where({ question_id: questionId })
            .whereNot('status', ANSWER_STATUS_DELETED)
            .update({
              is_correct: false,
              updated_at: trx.fn.now(),
            })
        }

        const [createdAnswer] = await trx('answers')
          .insert({
            admin_id: adminId,
            question_id: questionId,
            response,
            is_correct: isCorrect,
            status: getCreateAnswerStatus(req),
            deleted_at: null,
          })
          .returning(answerSelect)

        return createdAnswer
      })

      return reply.code(201).send({ answer })
    },
  )
}

export default questionAnswersRoutes
