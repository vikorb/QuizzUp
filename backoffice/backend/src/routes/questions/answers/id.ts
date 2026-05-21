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
      reply: FastifyReply,
    ) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.ANSWER,
        API_ACTION.UPDATE,
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
        if (existingAnswer.is_correct && req.body.isCorrect === false) {
          return reply.code(400).send({ error: 'answer_correct_required' })
        }

        patch.is_correct = req.body.isCorrect
      }

      const answer = await db.transaction(async (trx) => {
        if (req.body.isCorrect === true) {
          await trx('answers')
            .where({ question_id: questionId })
            .whereNot('id', answerId)
            .whereNot('status', ANSWER_STATUS_DELETED)
            .update({
              is_correct: false,
              updated_at: trx.fn.now(),
            })
        }

        const [updatedAnswer] = await trx('answers')
          .where({ id: answerId, question_id: questionId })
          .update(patch)
          .returning(answerSelect)

        return updatedAnswer
      })

      return { answer }
    },
  )

  app.delete<{ Params: AnswerParams }>(
    '/questions/:questionId/answers/:answerId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: AnswerParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.ANSWER,
        API_ACTION.DELETE,
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

      const question = await getQuestionAccessRow(questionId)

      if (!question) {
        return reply.code(404).send({ error: 'question_not_found' })
      }

      if (!canEditQuestion(question, req)) {
        return reply.code(403).send({ error: 'forbidden' })
      }

      const activeAnswers = await db('answers')
        .where({ question_id: questionId })
        .whereNot('status', ANSWER_STATUS_DELETED)

      const answerToDelete = activeAnswers.find((answer) => Number(answer.id) === answerId)

      if (!answerToDelete) {
        return reply.code(404).send({ error: 'answer_not_found' })
      }

      if (activeAnswers.length <= 2) {
        return reply.code(400).send({ error: 'question_answers_min_required' })
      }

      if (answerToDelete.is_correct) {
        return reply.code(400).send({ error: 'answer_correct_delete_forbidden' })
      }

      const [answer] = await db('answers')
        .where({ id: answerId, question_id: questionId })
        .update(buildAnswerStatusPatch(ANSWER_STATUS_DELETED))
        .returning(answerSelect)

      return { answer }
    },
  )
}

export default questionAnswerIdRoutes
