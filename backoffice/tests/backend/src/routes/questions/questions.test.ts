import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ANSWER_STATUS_ACTIVE,
  QUESTION_STATUS_ACTIVE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
} from '@quizzup/shared'
import questionsRoutes from '@backend/routes/questions'
import { dbState } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { securityState } from '../_helpers/mockSecurity'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  superadminUser,
} from '../_helpers/testApp'
import { seedQuestionsData } from './_fixtures'

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedQuestionsData()
})

type QuestionPayload = {
  id: number
  scope: string
  themeIds: number[]
  canEdit: boolean
  status: number
  answers: Array<{ id: number; response: string; isCorrect: boolean }>
}

function questionBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    question: 'What is 2 + 2 ?',
    themeIds: [1],
    answers: [
      { response: 'Four', isCorrect: true },
      { response: 'Five', isCorrect: false },
    ],
    ...overrides,
  }
}

describe('routes/questions.ts', () => {
  it('requires authentication to list questions', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({ method: 'GET', url: '/questions' })

    expect(response.statusCode).toBe(401)

    await app.close()
  })

  it('rejects question creation without API permission', async () => {
    securityState.hasPermission = false
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody(),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('requires a question label', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({ question: '   ' }),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_required' })

    await app.close()
  })

  it('requires at least one theme', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({ themeIds: [] }),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_theme_required' })

    await app.close()
  })

  it('enforces the answer rules (min two, at least one correct)', async () => {
    const app = await createRouteApp(questionsRoutes)

    const tooFew = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({ answers: [{ response: 'Only one', isCorrect: true }] }),
    })

    expect(tooFew.statusCode).toBe(400)
    expect(parseJson(tooFew)).toEqual({ error: 'question_answers_min_required' })

    const noCorrectAnswer = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({
        answers: [
          { response: 'Four', isCorrect: false },
          { response: 'Five', isCorrect: false },
        ],
      }),
    })

    expect(noCorrectAnswer.statusCode).toBe(400)
    expect(parseJson(noCorrectAnswer)).toEqual({ error: 'question_correct_answer_required' })

    await app.close()
  })

  it('rejects an invalid client-provided answer status (B4)', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({
        answers: [
          { response: 'Four', isCorrect: true, status: 99 },
          { response: 'Five', isCorrect: false },
        ],
      }),
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_answer_status_invalid' })

    await app.close()
  })

  it('forbids using a theme the requester cannot read', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(companyAdminUser),
      payload: questionBody({ themeIds: [5] }),
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'question_theme_forbidden' })

    await app.close()
  })

  it('creates a question spanning several themes and returns canEdit', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({ themeIds: [2, 1] }),
    })

    expect(response.statusCode).toBe(201)

    const body = parseJson<{ question: QuestionPayload }>(response)

    expect(body.question).toMatchObject({
      scope: THEME_SCOPE_GLOBAL,
      status: QUESTION_STATUS_ACTIVE,
      canEdit: true,
    })
    expect(body.question.themeIds).toEqual([1, 2])
    expect(body.question.answers).toHaveLength(2)
    expect(body.question.answers.every((answer) => answer.id > 0)).toBe(true)

    // Deux liens de thème créés pour la nouvelle question.
    const createdLinks = dbState.question_themes.filter(
      (link) => link.question_id === body.question.id
    )
    expect(createdLinks.map((link) => link.theme_id).sort()).toEqual([1, 2])

    // Les réponses sont insérées avec le statut serveur, pas celui du client.
    const createdAnswers = dbState.answers.filter(
      (answer) => answer.question_id === body.question.id
    )
    expect(createdAnswers).toHaveLength(2)
    expect(createdAnswers.every((answer) => answer.status === ANSWER_STATUS_ACTIVE)).toBe(true)

    await app.close()
  })

  it('stores the question kind, qcm by default, and filters on it', async () => {
    const app = await createRouteApp(questionsRoutes)

    const byDefault = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody(),
    })
    const trueFalse = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({
        kind: QUESTION_KIND_TRUE_FALSE,
        answers: [
          { response: 'Vrai', isCorrect: true },
          { response: 'Faux', isCorrect: false },
        ],
      }),
    })
    const invalid = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({ kind: 'riddle' }),
    })
    const filtered = await app.inject({
      method: 'GET',
      url: `/questions?kind=${QUESTION_KIND_TRUE_FALSE}`,
      headers: authHeaders(superadminUser),
    })

    expect(parseJson<{ question: QuestionPayload }>(byDefault).question).toMatchObject({
      kind: QUESTION_KIND_QCM,
    })
    const created = parseJson<{ question: QuestionPayload }>(trueFalse).question
    expect(created).toMatchObject({ kind: QUESTION_KIND_TRUE_FALSE })
    expect(invalid.statusCode).toBe(400)
    expect(parseJson(invalid)).toEqual({ error: 'question_kind_invalid' })
    expect(
      parseJson<{ questions: QuestionPayload[] }>(filtered).questions.map((item) => item.id)
    ).toEqual([created.id])

    await app.close()
  })

  it('applies the answer rules of the question kind on creation', async () => {
    const app = await createRouteApp(questionsRoutes)

    const trueFalse = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({ kind: QUESTION_KIND_TRUE_FALSE }),
    })
    const estimate = await app.inject({
      method: 'POST',
      url: '/questions',
      headers: authHeaders(superadminUser),
      payload: questionBody({ kind: QUESTION_KIND_ESTIMATE }),
    })

    expect(trueFalse.statusCode).toBe(400)
    expect(parseJson(trueFalse)).toEqual({ error: 'question_true_false_answers_invalid' })
    expect(estimate.statusCode).toBe(400)
    expect(parseJson(estimate)).toEqual({ error: 'question_estimate_answers_invalid' })

    await app.close()
  })

  it('refuses audio or video for a true / false or estimate question on creation', async () => {
    const app = await createRouteApp(questionsRoutes)
    const trueFalseAnswers = [
      { response: 'Vrai', isCorrect: true },
      { response: 'Faux', isCorrect: false },
    ]
    const post = (overrides: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/questions',
        headers: authHeaders(superadminUser),
        payload: questionBody(overrides),
      })

    const audio = await post({
      kind: QUESTION_KIND_TRUE_FALSE,
      typeMedia: 'audio',
      answers: trueFalseAnswers,
    })
    const video = await post({
      kind: QUESTION_KIND_ESTIMATE,
      typeMedia: 'video',
      answers: [
        { response: 'Moins de 10', isCorrect: false },
        { response: '10 à 99', isCorrect: true },
        { response: '100 ou plus', isCorrect: false },
      ],
    })
    const image = await post({
      kind: QUESTION_KIND_TRUE_FALSE,
      typeMedia: 'image',
      answers: trueFalseAnswers,
    })
    const qcmVideo = await post({ kind: QUESTION_KIND_QCM, typeMedia: 'video' })

    expect(audio.statusCode).toBe(400)
    expect(parseJson(audio)).toEqual({ error: 'question_kind_media_invalid' })
    expect(video.statusCode).toBe(400)
    expect(parseJson(video)).toEqual({ error: 'question_kind_media_invalid' })
    expect(image.statusCode).toBe(201)
    expect(qcmVideo.statusCode).toBe(201)

    await app.close()
  })

  it('limits visibility to global and own-company questions for non-superadmins', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/questions',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(200)

    const body = parseJson<{ questions: QuestionPayload[] }>(response)

    // q1 (global) + q2 (company 1) ; ni q3 (company 2) ni q4 (supprimée).
    expect(body.questions.map((question) => question.id)).toEqual([1, 2])

    const globalQuestion = body.questions.find((question) => question.id === 1)
    const companyQuestion = body.questions.find((question) => question.id === 2)

    expect(globalQuestion).toMatchObject({ scope: THEME_SCOPE_GLOBAL, canEdit: false })
    expect(companyQuestion).toMatchObject({ scope: THEME_SCOPE_COMPANY, canEdit: true })

    await app.close()
  })

  it('lets superadmins list every non-deleted question with canEdit set', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/questions',
      headers: authHeaders(superadminUser),
    })

    const body = parseJson<{ questions: QuestionPayload[] }>(response)

    expect(response.statusCode).toBe(200)
    expect(body.questions.map((question) => question.id)).toEqual([1, 2, 3])
    expect(body.questions.every((question) => question.canEdit === true)).toBe(true)

    await app.close()
  })
})
