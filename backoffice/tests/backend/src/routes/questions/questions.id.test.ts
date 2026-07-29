import '../_helpers/registerRouteMocks'

import { beforeEach, describe, expect, it } from 'vitest'

import { ANSWER_STATUS_ACTIVE, ANSWER_STATUS_DELETED } from '@quizzup/shared'
import questionsRoutes from '@backend/routes/questions'
import { dbState } from '../_helpers/mockDb'
import { resetRouteMocksBeforeEach } from '../_helpers/resetRouteMocks'
import { authHeaders, companyAdminUser, createRouteApp, parseJson } from '../_helpers/testApp'
import { seedQuestionsData } from './_fixtures'

resetRouteMocksBeforeEach()

beforeEach(() => {
  seedQuestionsData()
})

type AnswerPayload = { id: number; response: string; isCorrect: boolean; status: number }
type QuestionPayload = { id: number; canEdit: boolean; answers: AnswerPayload[] }

function storedAnswer(id: number): Record<string, unknown> | undefined {
  return dbState.answers.find((answer) => answer.id === id)
}

describe('routes/questions/id.ts', () => {
  it('excludes soft-deleted answers from the question detail (B2)', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'GET',
      url: '/questions/2',
      headers: authHeaders(companyAdminUser),
    })

    expect(response.statusCode).toBe(200)

    const body = parseJson<{ question: QuestionPayload }>(response)

    // La réponse 12 est supprimée (status = 2) et ne doit pas apparaître.
    expect(body.question.answers.map((answer) => answer.id)).toEqual([10, 11])
    expect(body.question.canEdit).toBe(true)

    await app.close()
  })

  it('forbids an establishment admin from editing a global question', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/1',
      headers: authHeaders(companyAdminUser),
      payload: {
        answers: [
          { response: 'Yes', isCorrect: true },
          { response: 'No', isCorrect: false },
        ],
      },
    })

    expect(response.statusCode).toBe(403)
    expect(parseJson(response)).toEqual({ error: 'forbidden' })

    await app.close()
  })

  it('rejects an invalid client-provided answer status on update (B4)', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2',
      headers: authHeaders(companyAdminUser),
      payload: {
        answers: [
          { id: 10, response: 'A', isCorrect: true, status: 99 },
          { id: 11, response: 'B', isCorrect: false },
        ],
      },
    })

    expect(response.statusCode).toBe(400)
    expect(parseJson(response)).toEqual({ error: 'question_answer_status_invalid' })

    await app.close()
  })

  it('preserves existing answer ids and only inserts the new ones (B3)', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2',
      headers: authHeaders(companyAdminUser),
      payload: {
        answers: [
          { id: 10, response: 'A updated', isCorrect: true },
          { id: 11, response: 'B updated', isCorrect: false },
          { response: 'C new', isCorrect: false },
        ],
      },
    })

    expect(response.statusCode).toBe(200)

    const body = parseJson<{ question: QuestionPayload }>(response)
    const answerIds = body.question.answers.map((answer) => answer.id)

    // Les ids existants sont conservés (pas de delete + recreate).
    expect(answerIds).toContain(10)
    expect(answerIds).toContain(11)
    expect(answerIds).toHaveLength(3)

    expect(storedAnswer(10)).toMatchObject({
      response: 'A updated',
      status: ANSWER_STATUS_ACTIVE,
      deleted_at: null,
    })
    expect(storedAnswer(11)).toMatchObject({
      response: 'B updated',
      status: ANSWER_STATUS_ACTIVE,
    })

    // La réponse déjà supprimée reste supprimée et n'est pas ré-insérée.
    expect(storedAnswer(12)).toMatchObject({ status: ANSWER_STATUS_DELETED })

    // Exactement une nouvelle réponse active a été insérée.
    const newAnswers = dbState.answers.filter(
      (answer) =>
        answer.question_id === 2 &&
        answer.status === ANSWER_STATUS_ACTIVE &&
        ![10, 11].includes(Number(answer.id))
    )
    expect(newAnswers).toHaveLength(1)
    expect(newAnswers[0]).toMatchObject({ response: 'C new' })

    await app.close()
  })

  it('soft-deletes only the answers removed from the payload (B3)', async () => {
    const app = await createRouteApp(questionsRoutes)

    const response = await app.inject({
      method: 'PATCH',
      url: '/questions/2',
      headers: authHeaders(companyAdminUser),
      payload: {
        answers: [
          { id: 10, response: 'A kept', isCorrect: true },
          { response: 'Brand new', isCorrect: false },
        ],
      },
    })

    expect(response.statusCode).toBe(200)

    // La réponse 11 retirée du payload est soft-deleted, la 10 est conservée.
    expect(storedAnswer(10)).toMatchObject({
      response: 'A kept',
      status: ANSWER_STATUS_ACTIVE,
    })
    expect(storedAnswer(11)).toMatchObject({ status: ANSWER_STATUS_DELETED })

    const activeAnswers = dbState.answers.filter(
      (answer) => answer.question_id === 2 && answer.status === ANSWER_STATUS_ACTIVE
    )
    expect(activeAnswers.map((answer) => answer.response).sort()).toEqual(['A kept', 'Brand new'])

    await app.close()
  })
})
