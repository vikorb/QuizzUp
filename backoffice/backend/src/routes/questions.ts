import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { Knex } from 'knex'

import {
  QUESTION_STATUS_DELETED,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import db from '../db'
import { API_ACTION, API_RESOURCE } from '../security/permissions'
import { requireApiPermission } from '../security/requireApiPermission'
import { getCurrentCompanyId, isSuperadmin } from '../security/companiesPolicy'
import {
  DEFAULT_QUESTION_MEDIA_TYPE,
  ensureThemeIsUsable,
  getCreateAnswerStatus,
  getCreateQuestionStatus,
  getCurrentAdminId,
  getQuestionCompanyId,
  getQuestionScope,
  getQuestionWithAnswers,
  isValidQuestionMediaType,
  isValidQuestionScope,
  isValidQuestionStatus,
  normalizeAnswers,
  parseOptionalNumber,
  parsePositiveId,
  questionSelect,
  validateAnswers,
  type QuestionBody,
  type QuestionQuery,
} from './questions/_shared'
import questionIdRoutes from './questions/id'
import questionIdStatusRoutes from './questions/idStatus'
import questionAnswersRoutes from './questions/answers'
import questionAnswerIdRoutes from './questions/answers/id'
import questionAnswerIdStatusRoutes from './questions/answers/idStatus'

const questionsRoutes: FastifyPluginAsync = async (app) => {
  app.register(questionIdRoutes)
  app.register(questionIdStatusRoutes)
  app.register(questionAnswersRoutes)
  app.register(questionAnswerIdRoutes)
  app.register(questionAnswerIdStatusRoutes)

  app.get<{ Querystring: QuestionQuery }>(
    '/questions',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Querystring: QuestionQuery }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.LIST,
      )

      if (!hasPermission) {
        return
      }

      const currentCompanyId = getCurrentCompanyId(req)
      const query = req.query

      const questionsQuery = db('questions')
        .select(questionSelect)
        .leftJoin('themes', 'themes.id', 'questions.theme_id')

      if (!isSuperadmin(req)) {
        questionsQuery.where(function filterVisibleQuestions(this: Knex.QueryBuilder) {
          this.where('questions.scope', THEME_SCOPE_GLOBAL)

          if (currentCompanyId !== null) {
            this.orWhere(function filterCompanyQuestions(this: Knex.QueryBuilder) {
              this.where('questions.scope', THEME_SCOPE_COMPANY).where(
                'questions.company_id',
                currentCompanyId,
              )
            })
          }
        })
      }

      if (query.search) {
        questionsQuery.whereILike('questions.question', `%${query.search}%`)
      }

      const themeId = parseOptionalNumber(query.themeId)

      if (themeId !== null) {
        questionsQuery.where('questions.theme_id', themeId)
      }

      const status = parseOptionalNumber(query.status)

      if (status !== null && isValidQuestionStatus(status)) {
        questionsQuery.where('questions.status', status)
      } else {
        questionsQuery.whereNot('questions.status', QUESTION_STATUS_DELETED)
      }

      if (query.typeMedia && isValidQuestionMediaType(query.typeMedia)) {
        questionsQuery.where('questions.type_media', query.typeMedia)
      }

      if (query.scope && isValidQuestionScope(query.scope)) {
        questionsQuery.where('questions.scope', query.scope)
      }

      const questions = await questionsQuery.orderBy('questions.id', 'asc')

      return { questions }
    },
  )

  app.post<{ Body: QuestionBody }>(
    '/questions',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest<{ Body: QuestionBody }>, reply: FastifyReply) => {
      const hasPermission = requireApiPermission(
        req,
        reply,
        API_RESOURCE.QUESTION,
        API_ACTION.CREATE,
      )

      if (!hasPermission) {
        return
      }

      const adminId = getCurrentAdminId(req)

      if (adminId === null) {
        return reply.code(401).send({ error: 'unauthorized' })
      }

      const questionText = req.body.question?.trim()
      const themeId = parsePositiveId(req.body.themeId)
      const typeMedia = req.body.typeMedia ?? DEFAULT_QUESTION_MEDIA_TYPE
      const mediaUrl = req.body.mediaUrl ?? null
      const answers = normalizeAnswers(req.body.answers)

      if (!questionText) {
        return reply.code(400).send({ error: 'question_required' })
      }

      if (themeId === null) {
        return reply.code(400).send({ error: 'question_theme_required' })
      }

      if (!isValidQuestionMediaType(typeMedia)) {
        return reply.code(400).send({ error: 'question_type_media_invalid' })
      }

      const answersError = validateAnswers(answers)

      if (answersError) {
        return reply.code(400).send({ error: answersError })
      }

      const requestedScope = isValidQuestionScope(req.body.scope) ? req.body.scope : undefined
      const scope = getQuestionScope(req, requestedScope)
      const companyId = getQuestionCompanyId(req, scope, req.body.companyId)

      if (scope === THEME_SCOPE_COMPANY && companyId === null) {
        return reply.code(400).send({ error: 'question_company_required' })
      }

      const themeError = await ensureThemeIsUsable(themeId, req, scope, companyId)

      if (themeError) {
        return reply.code(themeError === 'question_theme_forbidden' ? 403 : 400).send({
          error: themeError,
        })
      }

      const questionStatus = getCreateQuestionStatus(req)
      const answerStatus = getCreateAnswerStatus(req)

      const createdQuestion = await db.transaction(async (trx) => {
        const [question] = await trx('questions')
          .insert({
            admin_id: adminId,
            company_id: companyId,
            theme_id: themeId,
            scope,
            question: questionText,
            type_media: typeMedia,
            media_url: mediaUrl,
            status: questionStatus,
            deleted_at: null,
          })
          .returning('*')

        await trx('answers').insert(
          answers.map((answer) => ({
            admin_id: adminId,
            question_id: question.id,
            response: answer.response,
            is_correct: answer.isCorrect,
            status: answerStatus,
            deleted_at: null,
          })),
        )

        return question
      })

      const question = await getQuestionWithAnswers(Number(createdQuestion.id))

      if (!question) {
        return reply.code(500).send({ error: 'question_create_failed' })
      }

      return reply.code(201).send({ question })
    },
  )
}

export default questionsRoutes
