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
  lockQuestionAnswers,
  parsePositiveId,
  validateLockedAnswersForKind,
  type AnswerBody,
  type QuestionParams,
} from '../_shared'

const questionAnswersRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: QuestionParams }>(
    '/questions/:questionId/answers',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Params: QuestionParams }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ANSWER, API_ACTION.LIST)

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
    }
  )

  app.post<{ Params: QuestionParams; Body: AnswerBody }>(
    '/questions/:questionId/answers',
    { preHandler: [app.authenticate] },
    async (
      req: FastifyRequest<{ Params: QuestionParams; Body: AnswerBody }>,
      reply: FastifyReply
    ) => {
      const hasPermission = requireApiPermission(req, reply, API_RESOURCE.ANSWER, API_ACTION.CREATE)

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

      const response = req.body!.response?.trim()

      if (!response) {
        return reply.code(400).send({ error: 'answer_response_required' })
      }

      const isCorrect = req.body!.isCorrect ?? false
      const status = getCreateAnswerStatus(req)

      // Plusieurs bonnes réponses sont autorisées : ajouter une bonne réponse
      // ne modifie pas les autres. Les règles du type (vrai/faux, estimation)
      // portent sur l'ensemble des réponses, revérifié question verrouillée.
      const result = await db.transaction(async (trx) => {
        const currentAnswers = await lockQuestionAnswers(trx, questionId)
        const kindError = validateLockedAnswersForKind(question.kind, [
          ...currentAnswers,
          { id: 0, response, is_correct: isCorrect, status },
        ])

        if (kindError) {
          return { ok: false, error: kindError } as const
        }

        const [answer] = await trx('answers')
          .insert({
            admin_id: adminId,
            question_id: questionId,
            response,
            is_correct: isCorrect,
            status,
            deleted_at: null,
          })
          .returning(answerSelect)

        return { ok: true, answer } as const
      })

      if (!result.ok) {
        return reply.code(400).send({ error: result.error })
      }

      return reply.code(201).send({ answer: result.answer })
    }
  )
}

export default questionAnswersRoutes
