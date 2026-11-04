import {
  TRUE_FALSE_DURATION_MS,
  TRUE_FALSE_POINTS,
  TRUE_FALSE_REVEAL_MS,
  trueFalse,
  type TrueFalseState,
} from '@engine/miniGames/trueFalse'
import { MINI_GAME_TRUE_FALSE, QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { PARTICIPANTS, qcmQuestion, questionContext, trueFalseQuestion } from '../_helpers/fixtures'

const START = 0
const DEADLINE = START + TRUE_FALSE_DURATION_MS

// Affirmation vraie, remise dans l'ordre A = Vrai, B = Faux comme le ferait le moteur.
const raw = trueFalseQuestion(3, true)
const question = { ...raw, answers: trueFalse.arrangeAnswers!(raw.answers) }

function start() {
  return trueFalse.start(question, PARTICIPANTS, START, questionContext(question))
}

function press(state: TrueFalseState, participantId: number, button: 0 | 1 | 2 | 3, at: number) {
  return trueFalse.press(state, { participantId, button, at })
}

describe('trueFalse definition', () => {
  it('uses a short reveal', () => {
    expect(trueFalse.id).toBe(MINI_GAME_TRUE_FALSE)
    expect(trueFalse.revealMs).toBe(TRUE_FALSE_REVEAL_MS)
  })

  it('accepts « Vrai » / « Faux » statements only', () => {
    expect(trueFalse.isQuestionEligible(raw)).toBe(true)
    expect(trueFalse.isQuestionEligible(trueFalseQuestion(4, false))).toBe(true)
    expect(trueFalse.isQuestionEligible(qcmQuestion(1, 0, 2))).toBe(false)
    expect(trueFalse.isQuestionEligible(qcmQuestion(1))).toBe(false)
    expect(trueFalse.isQuestionEligible({ ...raw, mediaType: QUESTION_MEDIA_TYPE_AUDIO })).toBe(
      false
    )
  })

  it('always puts « Vrai » in A and « Faux » in B, without mutating the input', () => {
    const answers = raw.answers
    const arranged = trueFalse.arrangeAnswers!(answers)

    expect(arranged.map((answer) => answer.text)).toEqual(['Vrai', 'Faux'])
    expect(answers.map((answer) => answer.text)).toEqual(['Faux', 'Vrai'])
    expect(trueFalse.arrangeAnswers!(arranged).map((answer) => answer.text)).toEqual([
      'Vrai',
      'Faux',
    ])
    expect(
      trueFalse.arrangeAnswers!([
        { id: 1, text: 'false', isCorrect: true },
        { id: 2, text: ' TRUE', isCorrect: false },
      ]).map((answer) => answer.id)
    ).toEqual([2, 1])
  })
})

describe('trueFalse play', () => {
  it('gives fixed points to right answers, none to wrong ones, and ends early', () => {
    let { state } = start()
    const types: string[] = []

    for (const [participantId, button, at] of [
      [1, 0, 100],
      [2, 1, 200],
      [3, 0, 5999],
    ] as const) {
      const step = press(state, participantId, button, at)
      state = step.state
      types.push(...step.events.map((event) => event.type))
      expect(step.answers).toBeUndefined()
    }

    const last = press(state, 4, 0, 300)

    expect(types).toEqual(['answer_locked', 'answer_locked', 'answer_locked'])
    expect(last.events.map((event) => event.type)).toEqual(['answer_locked'])
    expect(last.state.status).toBe('done')
    // Fin = dernier appui chronologique.
    expect(last.endedAt).toBe(5999)
    expect(last.answers).toEqual([
      expect.objectContaining({ participantId: 1, isCorrect: true, points: TRUE_FALSE_POINTS }),
      expect.objectContaining({ participantId: 2, isCorrect: false, points: 0 }),
      expect.objectContaining({ participantId: 3, isCorrect: true, points: TRUE_FALSE_POINTS }),
      expect.objectContaining({ participantId: 4, isCorrect: true, points: TRUE_FALSE_POINTS }),
    ])
  })

  it('ignores C/D buttons, unknown players, repeated and late presses', () => {
    const { state } = start()
    const locked = press(state, 1, 1, 100)

    expect(press(state, 1, 2, 100).state).toBe(state)
    expect(press(state, 1, 3, 100).state).toBe(state)
    expect(press(state, 42, 0, 100).state).toBe(state)
    expect(press(state, 1, 0, DEADLINE).state).toBe(state)
    expect(press(locked.state, 1, 0, 200).state).toBe(locked.state)
  })

  it('ends at the deadline through tick', () => {
    const { state } = press(start().state, 2, 0, 1000)

    expect(trueFalse.tick(state, DEADLINE - 1).state).toBe(state)

    const ended = trueFalse.tick(state, DEADLINE)

    expect(ended.endedAt).toBe(DEADLINE)
    expect(ended.answers).toEqual([
      expect.objectContaining({
        participantId: 2,
        points: TRUE_FALSE_POINTS,
        responseTimeMs: 1000,
      }),
    ])
  })

  it('does not mutate the state it receives', () => {
    const { state } = start()
    const snapshot = structuredClone(state)

    trueFalse.tick(press(state, 1, 0, 10).state, DEADLINE)

    expect(state).toEqual(snapshot)
  })
})
