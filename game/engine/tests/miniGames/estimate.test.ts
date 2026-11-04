import {
  estimate,
  ESTIMATE_DURATION_MS,
  ESTIMATE_NEIGHBOUR_POINTS,
  ESTIMATE_POINTS,
  type EstimateState,
  getRangeSortValue,
  sortRanges,
} from '@engine/miniGames/estimate'
import { MINI_GAME_ESTIMATE, QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { estimateQuestion, PARTICIPANTS, qcmQuestion, questionContext } from '../_helpers/fixtures'

const raw = estimateQuestion(9)
// Ordre croissant appliqué par le moteur : A = « Moins de 100 », B = « 100 à 199 » (juste),
// C = « 200 à 299 », D = « 1 000 ou plus ».
const question = { ...raw, answers: estimate.arrangeAnswers!(raw.answers) }

function start() {
  return estimate.start(question, PARTICIPANTS, 0, questionContext(question))
}

function press(state: EstimateState, participantId: number, button: 0 | 1 | 2 | 3, at: number) {
  return estimate.press(state, { participantId, button, at })
}

describe('estimate.isQuestionEligible', () => {
  it('accepts 3 or 4 numeric ranges with one correct answer', () => {
    expect(estimate.id).toBe(MINI_GAME_ESTIMATE)
    expect(estimate.isQuestionEligible(raw)).toBe(true)
    expect(estimate.isQuestionEligible({ ...raw, answers: raw.answers.slice(1) })).toBe(true)
  })

  it('rejects text answers, 2 ranges, audio and several correct ranges', () => {
    expect(
      estimate.isQuestionEligible({
        ...raw,
        answers: raw.answers.map((answer, index) =>
          index === 0 ? { ...answer, text: 'Aucune idée' } : answer
        ),
      })
    ).toBe(false)
    expect(estimate.isQuestionEligible({ ...raw, answers: raw.answers.slice(2) })).toBe(false)
    expect(estimate.isQuestionEligible({ ...raw, mediaType: QUESTION_MEDIA_TYPE_AUDIO })).toBe(
      false
    )
    expect(
      estimate.isQuestionEligible({
        ...raw,
        answers: raw.answers.map((answer) => ({ ...answer, isCorrect: true })),
      })
    ).toBe(false)
    expect(estimate.isQuestionEligible(qcmQuestion(1, 0, 2))).toBe(false)
  })
})

describe('estimate.arrangeAnswers', () => {
  it('sorts ranges by their first number, stable on ties, without mutating the input', () => {
    const before = raw.answers.map((answer) => answer.text)

    expect(question.answers.map((answer) => answer.text)).toEqual([
      'Moins de 100',
      '100 à 199',
      '200 à 299',
      '1 000 ou plus',
    ])
    expect(raw.answers.map((answer) => answer.text)).toEqual(before)
    expect(estimate.arrangeAnswers).toBe(sortRanges)
  })

  it('handles decimals and negative numbers', () => {
    expect(
      sortRanges([
        { id: 1, text: '2,5 m', isCorrect: false },
        { id: 2, text: '-10 °C', isCorrect: false },
        { id: 3, text: '0,75', isCorrect: true },
      ]).map((answer) => answer.id)
    ).toEqual([2, 3, 1])
  })
})

describe('estimate play', () => {
  it('gives 100 to the right range, 30 to its neighbours, 0 further away', () => {
    let { state } = start()
    let step = press(state, 1, 1, 1000)

    for (const [participantId, button, at] of [
      [2, 0, 2000],
      [3, 2, 3000],
      [4, 3, 4000],
    ] as const) {
      state = step.state
      expect(step.answers).toBeUndefined()
      step = press(state, participantId, button, at)
    }

    expect(step.state.status).toBe('done')
    expect(step.endedAt).toBe(4000)
    expect(step.answers).toEqual([
      expect.objectContaining({ participantId: 1, isCorrect: true, points: ESTIMATE_POINTS }),
      expect.objectContaining({
        participantId: 2,
        isCorrect: false,
        points: ESTIMATE_NEIGHBOUR_POINTS,
      }),
      expect.objectContaining({
        participantId: 3,
        isCorrect: false,
        points: ESTIMATE_NEIGHBOUR_POINTS,
      }),
      expect.objectContaining({ participantId: 4, isCorrect: false, points: 0 }),
    ])
  })

  it('emits answer_locked and counts the first press only', () => {
    const first = press(start().state, 2, 3, 500)

    expect(first.events).toEqual([
      expect.objectContaining({
        type: 'answer_locked',
        payload: expect.objectContaining({ participantId: 2, answeredCount: 1, playersCount: 4 }),
      }),
    ])
    expect(press(first.state, 2, 1, 600).state).toBe(first.state)
  })

  it('ignores missing buttons on 3-range questions, unknown players and late presses', () => {
    const three = { ...raw, answers: sortRanges(raw.answers.slice(1)) }
    const { state } = estimate.start(three, PARTICIPANTS, 0, questionContext(three))

    expect(press(state, 1, 3, 10).state).toBe(state)
    expect(press(state, 77, 0, 10).state).toBe(state)
    expect(press(state, 1, 0, ESTIMATE_DURATION_MS).state).toBe(state)
  })

  it('ends at the deadline through tick', () => {
    const { state } = press(start().state, 3, 1, 1500)
    const ended = estimate.tick(state, ESTIMATE_DURATION_MS)

    expect(estimate.tick(state, ESTIMATE_DURATION_MS - 1).state).toBe(state)
    expect(ended.endedAt).toBe(ESTIMATE_DURATION_MS)
    expect(ended.answers).toEqual([
      expect.objectContaining({ participantId: 3, points: ESTIMATE_POINTS, responseTimeMs: 1500 }),
    ])
  })

  it('does not mutate the state it receives', () => {
    const { state } = start()
    const snapshot = structuredClone(state)

    estimate.tick(press(state, 1, 0, 10).state, ESTIMATE_DURATION_MS)

    expect(state).toEqual(snapshot)
  })
})

describe('sortRanges with open-ended ranges', () => {
  it('puts "Moins de" first and "Plus de" last even when they share a number', () => {
    const ranges = ['Entre 10 et 50', 'Moins de 10', 'Plus de 50', '50 ou plus'].map(
      (text, index) => ({ id: index, text, isCorrect: index === 1 })
    )

    expect(sortRanges(ranges).map((answer) => answer.text)).toEqual([
      'Moins de 10',
      'Entre 10 et 50',
      'Plus de 50',
      '50 ou plus',
    ])
  })

  it('reads a dot followed by three digits as a thousands separator', () => {
    expect(getRangeSortValue('1.500 km')).toBe(1500)
    expect(getRangeSortValue('Plus de 1.000')).toBe(1000.5)
    expect(getRangeSortValue('Avant 1800')).toBe(1799.5)
    expect(getRangeSortValue('Après 1900')).toBe(1900.5)
    expect(getRangeSortValue('1900 ou après')).toBe(1900.5)
    expect(getRangeSortValue('1800 ou avant')).toBe(1799.5)
    expect(getRangeSortValue('1,5 m')).toBe(1.5)
  })
})

describe('getRangeSortValue edge cases', () => {
  it('keeps small decimals and reads "ou moins" / "jusqu’à" as lower bounds', () => {
    expect(getRangeSortValue('0.125 kg')).toBe(0.125)
    expect(getRangeSortValue('10 ou moins')).toBe(9.5)
    expect(getRangeSortValue('Jusqu’à 10')).toBe(9.5)
  })
})
