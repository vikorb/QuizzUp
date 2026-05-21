import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { ANSWER_STATUS_DELETED } from '@quizzup/shared'
import db from '../../../db'
import { API_ACTION, API_RESOURCE } from '../../../security/permissions'
import { requireApiPermission } from '../../../security/requireApiPermission'
import {
  answerSelect,
  buildAnswerStatusPatch,
  canEditQuestion,
  getQuestionAccessRow,
  isValidAnswerStatus,
  parsePositiveId,
  type AnswerParams,
  type AnswerStatusBody,
} from '../_shared'

const questionAnswerIdStatusRoutes: FastifyPluginAsync = async (app) => {
  app.patch<{ Params: AnswerParams; Body: AnswerStatusBody }>(
    '/questions/:questionId/answers/:answerId/status',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: AnswerParams; Body: AnswerStatusBody }>,
      reply: FastifyReply,
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.ANSWER,
        API_ACTION.UPDATE_STATUS,
      )

      if (!hasPermission) {
        return
      }

      const questionId = parsePositiveId(req.params.questionId)
      const answerId = parsePositiveId(req.params.answerId)

      if (questionId === null) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      if (answerId === null) {
        return reply.code(400).send({ error: 'answer_id_invalid' })
      }

      if (!isValidAnswerStatus(req.body.status)) {
        return reply.code(400).send({ error: 'answer_status_invalid' })
      }

      const question = await getQuestionAccessRow(questionId)

      if (!question) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canEditQuestion(question, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const existingAnswer = await db('answers')
        .where({ id: answerId, question_id: questionId })
        .whereNot('status', ANSWER_STATUS_DELETED)
        .first()

      if (!existingAnswer) {
        return reply.code(404).send({ error: 'answer_not_found' })
      }

      if (req.body.status === ANSWER_STATUS_DELETED) {
        const activeAnswers = await db('answers')
          .where({ question_id: questionId })
          .whereNot('status', ANSWER_STATUS_DELETED)

        if (activeAnswers.length <= 2) {
          return reply.code(400).send({ error: 'question_answers_min_required' })
        }

        if (existingAnswer.is_correct) {
          return reply.code(400).send({ error: 'answer_correct_delete_forbidden' })
        }
      }

      const [answer] = await db('answers')
        .where({ id: answerId, question_id: questionId })
        .update(buildAnswerStatusPatch(req.body.status))
        .returning(answerSelect)

      return { answer }
    },
  )
}

export default questionAnswerIdStatusRoutes
