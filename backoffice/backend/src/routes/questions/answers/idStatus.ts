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
  isValidAnswerStatus,
  parsePositiveId,
  validateLockedAnswersForKind,
  type AnswerParams,
  type AnswerStatusBody,
} from '../_shared'

const questionAnswerIdStatusRoutes: FastifyPluginAsync = async (app) => {
  app.patch<{ Params: AnswerParams; Body: AnswerStatusBody }>(
    '/questions/:questionId/answers/:answerId/status',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: AnswerParams; Body: AnswerStatusBody }>,
      reply: FastifyReply
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.ANSWER,
        API_ACTION.UPDATE_STATUS
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

      const nextStatus = req.body.status

      const result = await db.transaction(async (trx) => {
        const activeAnswers = await lockQuestionAnswers(trx, questionId)
        const existingAnswer = activeAnswers.find((answer) => Number(answer.id) === answerId)

        if (!existingAnswer) {
          return { ok: false, status: 404, error: 'answer_not_found' } as const
        }

        if (nextStatus === ANSWER_STATUS_DELETED && activeAnswers.length <= 2) {
          return { ok: false, status: 400, error: 'question_answers_min_required' } as const
        }

        if (
          nextStatus === ANSWER_STATUS_DELETED &&
          existingAnswer.is_correct &&
          !hasCorrectAnswerBesides(activeAnswers, answerId)
        ) {
          return { ok: false, status: 400, error: 'answer_correct_delete_forbidden' } as const
        }

        const kindError = validateLockedAnswersForKind(
          question.kind,
          activeAnswers.map((answer) =>
            Number(answer.id) === answerId ? { ...answer, status: nextStatus } : answer
          )
        )

        if (kindError) {
          return { ok: false, status: 400, error: kindError } as const
        }

        const [updatedAnswer] = await trx('answers')
          .where({ id: answerId, question_id: questionId })
          .update(buildAnswerStatusPatch(nextStatus))
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
}

export default questionAnswerIdStatusRoutes
