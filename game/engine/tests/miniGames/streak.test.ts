import {
  getStreakMultiplier,
  getStreaks,
  streak,
  STREAK_BASE_POINTS,
  STREAK_DURATION_MS,
  STREAK_MAX_MULTIPLIER,
  type StreakState,
} from '@engine/miniGames/streak'
import type { AnswerRecord } from '@engine/types'
import { MINI_GAME_STREAK } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  questionContext,
} from '../_helpers/fixtures'

// Manche de 7 questions, bonne réponse toujours en A.
const ROUND = Array.from({ length: 7 }, (_item, index) => qcmQuestion(100 + index, 0))

function record(participantId: number, questionId: number, isCorrect: boolean): AnswerRecord {
  return {
    participantId,
    questionId,
    answerId: null,
    isCorrect,
    points: 0,
    responseTimeMs: 0,
    stage: null,
  }
}

/** Réponses passées : `results[participantId]` = justesse par question (undefined = absent). */
function history(results: Record<number, (boolean | undefined)[]>): AnswerRecord[] {
  return Object.entries(results).flatMap(([participantId, values]) =>
    values.flatMap((value, index) =>
      value === undefined ? [] : [record(Number(participantId), ROUND[index]!.id, value)]
    )
  )
}

function startAt(questionIndex: number, roundAnswers: AnswerRecord[]) {
  const question = ROUND[questionIndex]!

  return streak.start(
    question,
    PARTICIPANTS,
    0,
    questionContext(question, {
      questionIndex,
      questionsCount: ROUND.length,
      roundQuestions: ROUND,
      roundAnswers,
    })
  )
}

function press(state: StreakState, participantId: number, button: 0 | 1 | 2 | 3, at: number) {
  return streak.press(state, { participantId, button, at })
}

describe('streak.isQuestionEligible', () => {
  it('accepts multiple choice questions only', () => {
    expect(streak.id).toBe(MINI_GAME_STREAK)
    expect(streak.isQuestionEligible(qcmQuestion(1))).toBe(true)
    expect(streak.isQuestionEligible(imageQuestion(1))).toBe(true)
    expect(streak.isQuestionEligible(audioQuestion(1))).toBe(false)
    expect(streak.isQuestionEligible(qcmQuestion(1, 0, 1))).toBe(false)
  })
})

describe('getStreaks / getStreakMultiplier', () => {
  it('counts consecutive right answers, reset by a mistake or a missing answer', () => {
    const answers = history({
      1: [true, true, true],
      2: [true, false, true],
      3: [true, undefined, true],
      4: [false, false, false],
    })

    expect(getStreaks([1, 2, 3, 4, 5], ROUND.slice(0, 3), answers)).toEqual({
      1: 3,
      2: 1,
      3: 1,
      4: 0,
      5: 0,
    })
    expect(getStreaks([1], [], answers)).toEqual({ 1: 0 })
  })

  it('maps streaks to ×1 … ×5', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(getStreakMultiplier)).toEqual([1, 2, 3, 4, 5, 5, 5])
    expect(STREAK_MAX_MULTIPLIER).toBe(5)
  })
})

describe('streak play', () => {
  it('applies ×1 to everybody on the first question', () => {
    const { state } = startAt(0, [])

    expect(state.extra.multipliers).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1 })
  })

  it('raises the multiplier up to ×5 and drops back to ×1 after a mistake', () => {
    const answers = history({
      1: [true, true, true, true, true, true],
      2: [true, true, false, true, true, true],
      3: [true, true, true, true, true, false],
      4: [true, true, true, true, true, undefined],
    })
    const step = startAt(6, answers)

    expect(step.state.extra.multipliers).toEqual({ 1: 5, 2: 4, 3: 1, 4: 1 })

    let { state } = step
    let last = step

    for (const participantId of [1, 2, 3, 4]) {
      last = press(state, participantId, participantId === 2 ? 1 : 0, participantId * 100)
      state = last.state
    }

    expect(last.state.status).toBe('done')
    expect(last.endedAt).toBe(400)
    expect(last.answers).toEqual([
      expect.objectContaining({ participantId: 1, isCorrect: true, points: 125, stage: 5 }),
      expect.objectContaining({ participantId: 2, isCorrect: false, points: 0, stage: 4 }),
      expect.objectContaining({
        participantId: 3,
        isCorrect: true,
        points: STREAK_BASE_POINTS,
        stage: 1,
      }),
      expect.objectContaining({ participantId: 4, isCorrect: true, points: 25, stage: 1 }),
    ])
  })

  it('only looks at questions before the current one', () => {
    // Des réponses « futures » (questions 2 et 3) ne doivent pas compter pour la question 1.
    const answers = history({ 1: [true, true, true] })

    expect(startAt(1, answers).state.extra.multipliers[1]).toBe(2)
  })

  it('counts one press per player and ignores unknown players or late presses', () => {
    const { state } = startAt(0, [])
    const first = press(state, 1, 1, 100)

    expect(press(first.state, 1, 0, 200).state).toBe(first.state)
    expect(press(state, 99, 0, 100).state).toBe(state)
    expect(press(state, 1, 0, STREAK_DURATION_MS).state).toBe(state)
    expect(first.events).toEqual([
      expect.objectContaining({
        type: 'answer_locked',
        payload: expect.objectContaining({ participantId: 1 }),
      }),
    ])
  })

  it('ends at the deadline through tick', () => {
    const answers = history({ 2: [true, true] })
    const { state } = press(startAt(2, answers).state, 2, 0, 1234)
    const ended = streak.tick(state, STREAK_DURATION_MS)

    expect(ended.endedAt).toBe(STREAK_DURATION_MS)
    expect(ended.answers).toEqual([
      expect.objectContaining({ participantId: 2, points: 75, stage: 3, responseTimeMs: 1234 }),
    ])
  })

  it('does not mutate the state it receives', () => {
    const { state } = startAt(0, [])
    const snapshot = structuredClone(state)

    streak.tick(press(state, 1, 0, 10).state, STREAK_DURATION_MS)

    expect(state).toEqual(snapshot)
  })
})
