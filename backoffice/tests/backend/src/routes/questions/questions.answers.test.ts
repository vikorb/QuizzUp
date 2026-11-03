import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  ANSWER_STATUS_INACTIVE,
} from '@quizzup/shared'
import questionsRoutes from '@backend/routes/questions'
import { dbState, MOCK_NOW } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { authHeaders, companyAdminUser, createRouteApp, parseJson } from '../_helpers/testApp'
import { seedQuestionsData } from './_fixtures'

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
