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
  hasCorrectAnswerBesides,
  lockQuestionAnswers,
  parsePositiveId,
  type AnswerBody,
  type AnswerParams,
} from '../_shared'

const questionAnswerIdRoutes: FastifyPluginAsync = async (app) => {
  app.patch<{ Params: AnswerParams; Body: AnswerBody }>(
    '/questions/:questionId/answers/:answerId',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: AnswerParams; Body: AnswerBody }>,
      reply: FastifyReply
    ) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ANSWER, API_ACTION.UPDATE)

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

      const question = await getQuestionAccessRow(questionId)

      if (!question) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canEditQuestion(question, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const patch: Record<string, unknown> = {
        updated_at: db.fn.now(),
      }

      if (req.body.response !== undefined) {
        const response = req.body.response.trim()

        if (!response) {
          return reply.code(400).send({ error: 'answer_response_required' })
        }

        patch.response = response
      }

      if (req.body.isCorrect !== undefined) {
        patch.is_correct = req.body.isCorrect
      }

      const result = await db.transaction(async (trx) => {
        const activeAnswers = await lockQuestionAnswers(trx, questionId)
        const existingAnswer = activeAnswers.find((answer) => Number(answer.id) === answerId)

        if (!existingAnswer) {
          return { ok: false, status: 404, error: 'answer_not_found' } as const
        }

        if (
          existingAnswer.is_correct &&
          req.body.isCorrect === false &&
          !hasCorrectAnswerBesides(activeAnswers, answerId)
        ) {
          return { ok: false, status: 400, error: 'answer_correct_required' } as const
        }

        const [updatedAnswer] = await trx('answers')
          .where({ id: answerId, question_id: questionId })
          .update(patch)
          .returning(answerSelect)

        return { ok: true, answer: updatedAnswer } as const
      })

      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error })
      }

      const { answer } = result

      return { answer }
    }
  )

  app.delete<{ Params: AnswerParams }>(
    '/questions/:questionId/answers/:answerId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: AnswerParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ANSWER, API_ACTION.DELETE)

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

      const question = await getQuestionAccessRow(questionId)

      if (!question) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canEditQuestion(question, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const result = await db.transaction(async (trx) => {
        const activeAnswers = await lockQuestionAnswers(trx, questionId)
        const answerToDelete = activeAnswers.find((answer) => Number(answer.id) === answerId)

        if (!answerToDelete) {
          return { ok: false, status: 404, error: 'answer_not_found' } as const
        }

        if (activeAnswers.length <= 2) {
          return { ok: false, status: 400, error: 'question_answers_min_required' } as const
        }

        if (answerToDelete.is_correct && !hasCorrectAnswerBesides(activeAnswers, answerId)) {
          return { ok: false, status: 400, error: 'answer_correct_delete_forbidden' } as const
        }

        const [deletedAnswer] = await trx('answers')
          .where({ id: answerId, question_id: questionId })
          .update(buildAnswerStatusPatch(ANSWER_STATUS_DELETED))
          .returning(answerSelect)

        return { ok: true, answer: deletedAnswer } as const
      })

      if (!result.ok) {
        return reply.code(result.status).send({ error: result.error })
      }

      const { answer } = result

      return { answer }
    }
  )
}

export default questionAnswerIdRoutes
