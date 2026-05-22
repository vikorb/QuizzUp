import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import {
  ANSWER_STATUS_DELETED,
  QUESTION_STATUS_DELETED,
} from '@quizzup/shared'
import db from '../../db'
import { API_ACTION, API_RESOURCE } from '../../security/permissions'
import { requireApiPermission } from '../../security/requireApiPermission'
import {
  buildQuestionStatusPatch,
  canEditQuestion,
  getQuestionAccessRow,
  getQuestionWithAnswers,
  isValidQuestionStatus,
  parsePositiveId,
  type QuestionParams,
  type QuestionStatusBody,
} from './_shared'

const questionIdStatusRoutes: FastifyPluginAsync = async (app) => {
  app.patch<{ Params: QuestionParams; Body: QuestionStatusBody }>(
    '/questions/:questionId/status',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: QuestionParams; Body: QuestionStatusBody }>,
      reply: FastifyReply,
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.UPDATE_STATUS,
      )

      if (!hasPermission) {
        return
      }

      const questionId = parsePositiveId(req.params.questionId)

      if (questionId === null) {
        return reply.code(400).send({ error: 'question_id_invalid' })
      }

      const nextStatus = req.body.status

      if (!isValidQuestionStatus(nextStatus)) {
        return reply.code(400).send({ error: 'question_status_invalid' })
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
          .update(buildQuestionStatusPatch(nextStatus))

        if (nextStatus === QUESTION_STATUS_DELETED) {
          await trx('answers')
            .where({ question_id: questionId })
            .update({
              status: ANSWER_STATUS_DELETED,
              updated_at: trx.fn.now(),
              deleted_at: trx.fn.now(),
            })
        }
      })

      const question = await getQuestionWithAnswers(questionId)

      return { question }
    },
  )
}

export default questionIdStatusRoutes
