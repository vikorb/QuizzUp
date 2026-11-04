import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  ANSWER_STATUS_INACTIVE,
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_TRUE_FALSE,
} from '@quizzup/shared'
import questionsRoutes from '@backend/routes/questions'
import { dbState, MOCK_NOW } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { authHeaders, companyAdminUser, createRouteApp, parseJson } from '../_helpers/testApp'
import { concurrentWriteBeforeTransaction, seedQuestionsData } from './_fixtures'

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedQuestionsData()
})

function isCorrect(id: number): boolean {
  return Boolean(dbState.answers.find((answer) => answer.id === id)?.is_correct)
}

function addActiveAnswer(id: number, correct: boolean): void {
  dbState.answers.push({
    id,
    admin_id: 2,
    question_id: 2,
    response: `Answer ${id}`,
    is_correct: correct,
    status: ANSWER_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: MOCK_NOW,
    deleted_at: null,
  })
}

describe('routes/questions/answers — multiple correct answers', () => {
  it('keeps the existing correct answer when a new correct answer is created', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'POST',
      url: '/questions/2/answers',
      headers: authHeaders(companyAdminUser),
      payload: { response: 'C', isCorrect: true },
    })

    expect(response.statusCode).toBe(201)
    expect(isCorrect(10)).toBe(true)
    expect(
      dbState.answers.filter((answer) => answer.question_id === 2 && answer.is_correct)
    ).toHaveLength(2)

    await app.close()
  })

  it('keeps the existing correct answer when another answer becomes correct', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2/answers/11',
      headers: authHeaders(companyAdminUser),
      payload: { isCorrect: true },
    })

    expect(response.statusCode).toBe(200)
    expect(isCorrect(10)).toBe(true)
    expect(isCorrect(11)).toBe(true)

    await app.close()
  })

  it('refuses to unmark the last correct answer', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2/answers/10',
      headers: authHeaders(companyAdminUser),
      payload: { isCorrect: false },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'answer_correct_required' })
    expect(isCorrect(10)).toBe(true)

    await app.close()
  })

  it('unmarks a correct answer when another correct answer remains', async () => {
    dbState.answers = dbState.answers.map((answer) =>
      answer.id === 11 ? { ...answer, is_correct: true } : answer
    )
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2/answers/10',
      headers: authHeaders(companyAdminUser),
      payload: { isCorrect: false },
    })

    expect(response.statusCode).toBe(200)
    expect(isCorrect(10)).toBe(false)
    expect(isCorrect(11)).toBe(true)

    await app.close()
  })

  it('deletes a correct answer only when another correct answer remains', async () => {
    addActiveAnswer(13, false)
    const app = await createRouteApp(questionsRoutes)

    const lastCorrect = await app.inject({
      method: 'DELETE',
      url: '/questions/2/answers/10',
      headers: authHeaders(companyAdminUser),
    })

    expect(lastCorrect.statusCode).toBe(400)
    expect(parseJson(lastCorrect)).toEqual({ error: 'answer_correct_delete_forbidden' })

    dbState.answers = dbState.answers.map((answer) =>
      answer.id === 13 ? { ...answer, is_correct: true } : answer
    )

    const withOtherCorrect = await app.inject({
      method: 'DELETE',
      url: '/questions/2/answers/10',
      headers: authHeaders(companyAdminUser),
    })

    expect(withOtherCorrect.statusCode).toBe(200)
    expect(dbState.answers.find((answer) => answer.id === 10)?.status).toBe(ANSWER_STATUS_DELETED)

    await app.close()
  })

  it('soft-deletes a correct answer through the status route when another correct answer remains', async () => {
    addActiveAnswer(13, true)
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2/answers/10/status',
      headers: authHeaders(companyAdminUser),
      payload: { status: ANSWER_STATUS_DELETED },
    })

    expect(response.statusCode).toBe(200)
    expect(dbState.answers.find((answer) => answer.id === 10)?.status).toBe(ANSWER_STATUS_DELETED)

    await app.close()
  })

  it('does not count an inactive correct answer as a remaining correct answer', async () => {
    dbState.answers = dbState.answers.map((answer) =>
      answer.id === 11 ? { ...answer, is_correct: true, status: ANSWER_STATUS_INACTIVE } : answer
    )
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2/answers/10',
      headers: authHeaders(companyAdminUser),
      payload: { isCorrect: false },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'answer_correct_required' })
    expect(isCorrect(10)).toBe(true)

    await app.close()
  })
})

describe('routes/questions/answers — rules of the question kind', () => {
  // Question 2 devient un vrai/faux valide : « Vrai » (juste) et « Faux ».
  beforeEach(() => {
    const question = dbState.questions.find((row) => row.id === 2)!
    question.kind = QUESTION_KIND_TRUE_FALSE
    dbState.answers.find((row) => row.id === 10)!.response = 'Vrai'
    dbState.answers.find((row) => row.id === 11)!.response = 'Faux'
  })

  async function send(method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
    const app = await createRouteApp(questionsRoutes)
    const response = await app.inject({
      method,
      url,
      headers: authHeaders(companyAdminUser),
      ...(payload ? { payload } : {}),
    })
    await app.close()

    return response
  }

  it('refuses every unit change that breaks a true/false question', async () => {
    const attempts = [
      await send('POST', '/questions/2/answers', { response: 'Peut-être' }),
      await send('PATCH', '/questions/2/answers/11', { response: 'Peut-être' }),
      await send('PATCH', '/questions/2/answers/11', { isCorrect: true }),
    ]

    for (const response of attempts) {
      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'question_true_false_answers_invalid' })
    }

    expect(dbState.answers.filter((row) => row.question_id === 2)).toHaveLength(3)
    expect(dbState.answers.find((row) => row.id === 11)).toMatchObject({
      response: 'Faux',
      is_correct: false,
      status: ANSWER_STATUS_ACTIVE,
    })
  })

  it('accepts a unit change that keeps the true/false rules', async () => {
    const response = await send('PATCH', '/questions/2/answers/11', { response: 'FAUX' })

    expect(response.statusCode).toBe(200)
    expect(dbState.answers.find((row) => row.id === 11)).toMatchObject({ response: 'FAUX' })
  })

  it('refuses to delete an answer of a true/false question, by either route', async () => {
    addActiveAnswer(13, false)
    dbState.answers.find((row) => row.id === 13)!.status = ANSWER_STATUS_INACTIVE

    const responses = [
      await send('DELETE', '/questions/2/answers/11'),
      await send('PATCH', '/questions/2/answers/11/status', { status: ANSWER_STATUS_DELETED }),
    ]

    for (const response of responses) {
      expect(response.statusCode).toBe(400)
      expect(parseJson(response)).toEqual({ error: 'question_true_false_answers_invalid' })
    }
  })
})

describe('routes/questions/answers — kind changed during the request (row lock)', () => {
  const toEstimate = () => {
    concurrentWriteBeforeTransaction(() => {
      const row = dbState.questions.find((question) => question.id === 2)!
      row.kind = QUESTION_KIND_ESTIMATE
    })
  }

  it('checks a new answer against the kind read under the lock', async () => {
    const app = await createRouteApp(questionsRoutes)
    toEstimate()

    const response = await app.inject({
      method: 'POST',
      url: '/questions/2/answers',
      headers: authHeaders(companyAdminUser),
      payload: { response: 'C', isCorrect: false },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_estimate_answers_invalid' })
    expect(dbState.answers.filter((row) => row.question_id === 2)).toHaveLength(3)

    await app.close()
  })

  it('checks an edited answer against the kind read under the lock', async () => {
    const app = await createRouteApp(questionsRoutes)
    toEstimate()

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2/answers/11',
      headers: authHeaders(companyAdminUser),
      payload: { response: 'Autre' },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_estimate_answers_invalid' })
    expect(dbState.answers.find((row) => row.id === 11)!.response).toBe('B')

    await app.close()
  })

  it('checks a status change and a deletion against the kind read under the lock', async () => {
    const app = await createRouteApp(questionsRoutes)
    addActiveAnswer(13, false)
    addActiveAnswer(14, false)

    toEstimate()
    const status = await app.inject({
      method: 'PATCH',
      url: '/questions/2/answers/13/status',
      headers: authHeaders(companyAdminUser),
      payload: { status: ANSWER_STATUS_DELETED },
    })
    expect(status.statusCode).toBe(400)
    expect(parseJson(status)).toEqual({ error: 'question_estimate_answers_invalid' })

    toEstimate()
    const removal = await app.inject({
      method: 'DELETE',
      url: '/questions/2/answers/14',
      headers: authHeaders(companyAdminUser),
    })
    expect(removal.statusCode).toBe(400)
    expect(parseJson(removal)).toEqual({ error: 'question_estimate_answers_invalid' })
    expect(dbState.answers.find((row) => row.id === 14)!.status).toBe(ANSWER_STATUS_ACTIVE)

    await app.close()
  })
})
