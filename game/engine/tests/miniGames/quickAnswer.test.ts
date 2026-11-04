import type { QuestionStep } from '@engine/miniGames/miniGame'
import {
  getQuickAnswerPoints,
  QUICK_ANSWER_DURATION_MS,
  QUICK_ANSWER_MAX_POINTS,
  QUICK_ANSWER_MIN_POINTS,
  quickAnswer,
  type QuickAnswerState,
} from '@engine/miniGames/quickAnswer'
import { MINI_GAME_QUICK_ANSWER } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  questionContext,
} from '../_helpers/fixtures'

const START = 1000
const DEADLINE = START + QUICK_ANSWER_DURATION_MS

// Bonne réponse en C (index 2).
const question = qcmQuestion(7, 2)

function start(): QuestionStep<QuickAnswerState> {
  return quickAnswer.start(question, PARTICIPANTS, START, questionContext(question))
}

function press(state: QuickAnswerState, participantId: number, button: 0 | 1 | 2 | 3, at: number) {
  return quickAnswer.press(state, { participantId, button, at })
}

describe('quickAnswer.isQuestionEligible', () => {
  it('accepts text or image questions with 2 to 4 answers', () => {
    expect(quickAnswer.id).toBe(MINI_GAME_QUICK_ANSWER)
    expect(quickAnswer.isQuestionEligible(question)).toBe(true)
    expect(quickAnswer.isQuestionEligible(imageQuestion(1))).toBe(false)
    expect(quickAnswer.isQuestionEligible(qcmQuestion(1, 0, 2))).toBe(true)
  })

  it('rejects audio questions and invalid answers', () => {
    expect(quickAnswer.isQuestionEligible(audioQuestion(1))).toBe(false)
    expect(quickAnswer.isQuestionEligible(qcmQuestion(1, 0, 1))).toBe(false)
    expect(quickAnswer.isQuestionEligible(qcmQuestion(1, 0, 5))).toBe(false)
    expect(quickAnswer.isQuestionEligible(qcmQuestion(1, 9))).toBe(false)
  })
})

describe('getQuickAnswerPoints', () => {
  it('decreases linearly from 100 to 20 points, bounded', () => {
    expect(getQuickAnswerPoints(0)).toBe(QUICK_ANSWER_MAX_POINTS)
    expect(getQuickAnswerPoints(-500)).toBe(QUICK_ANSWER_MAX_POINTS)
    expect(getQuickAnswerPoints(QUICK_ANSWER_DURATION_MS / 2)).toBe(60)
    expect(getQuickAnswerPoints(QUICK_ANSWER_DURATION_MS)).toBe(QUICK_ANSWER_MIN_POINTS)
    expect(getQuickAnswerPoints(QUICK_ANSWER_DURATION_MS * 3)).toBe(QUICK_ANSWER_MIN_POINTS)
    expect(getQuickAnswerPoints(1000)).toBeGreaterThan(getQuickAnswerPoints(2000))
  })
})

describe('quickAnswer play', () => {
  it('starts answering for every participant, without event', () => {
    const step = start()

    expect(step.events).toEqual([])
    expect(step.state).toMatchObject({
      kind: MINI_GAME_QUICK_ANSWER,
      status: 'answering',
      extra: null,
      answering: { playerIds: [1, 2, 3, 4], startedAt: START, deadline: DEADLINE },
    })
  })

  it('scores faster correct answers higher, wrong answers 0, and ends at the last press', () => {
    let { state } = start()
    const events = []

    for (const [participantId, button, at] of [
      [1, 2, START],
      [2, 2, START + 7500],
      [3, 0, START + 1000],
      [4, 2, START + 14_999],
    ] as const) {
      const step = press(state, participantId, button, at)
      state = step.state
      events.push(...step.events)

      if (participantId === 4) {
        expect(step.state.status).toBe('done')
        expect(step.endedAt).toBe(START + 14_999)
        expect(step.answers).toEqual([
          expect.objectContaining({
            participantId: 1,
            isCorrect: true,
            points: 100,
            responseTimeMs: 0,
          }),
          expect.objectContaining({
            participantId: 2,
            isCorrect: true,
            points: 60,
            responseTimeMs: 7500,
          }),
          expect.objectContaining({ participantId: 3, isCorrect: false, points: 0, answerId: 70 }),
          expect.objectContaining({ participantId: 4, isCorrect: true, points: 20 }),
        ])
      } else {
        expect(step.answers).toBeUndefined()
      }
    }

    expect(events.map((event) => event.type)).toEqual(Array(4).fill('answer_locked'))
  })

  it('counts only the first press of each player', () => {
    const first = press(start().state, 1, 0, START + 100)
    const second = press(first.state, 1, 2, START + 200)

    expect(second.state).toBe(first.state)
    expect(second.events).toEqual([])
    expect(quickAnswer.tick(second.state, DEADLINE).answers).toEqual([
      expect.objectContaining({ participantId: 1, isCorrect: false, points: 0 }),
    ])
  })

  it('ignores unknown players, buttons without answer and late presses', () => {
    const narrow = qcmQuestion(8, 0, 2)
    const { state } = quickAnswer.start(narrow, PARTICIPANTS, START, questionContext(narrow))

    expect(press(state, 99, 0, START + 10).state).toBe(state)
    expect(press(state, 1, 3, START + 10).state).toBe(state)
    expect(press(state, 1, 0, DEADLINE).state).toBe(state)
    expect(press(state, 1, 0, DEADLINE).events).toEqual([])
  })

  it('ends at the deadline through tick with the players who answered', () => {
    const { state } = press(start().state, 2, 2, START + 3000)

    expect(quickAnswer.tick(state, DEADLINE - 1)).toEqual({ state, events: [] })

    const ended = quickAnswer.tick(state, DEADLINE + 500)

    expect(ended.state.status).toBe('done')
    expect(ended.endedAt).toBe(DEADLINE)
    expect(ended.answers).toEqual([
      expect.objectContaining({ participantId: 2, points: getQuickAnswerPoints(3000) }),
    ])
  })

  it('does not mutate the state it receives', () => {
    const { state } = start()
    const snapshot = structuredClone(state)

    const pressed = press(state, 1, 2, START + 10)
    quickAnswer.tick(pressed.state, DEADLINE)

    expect(state).toEqual(snapshot)
    expect(pressed.state.answering.choices).toHaveLength(1)
  })
})
