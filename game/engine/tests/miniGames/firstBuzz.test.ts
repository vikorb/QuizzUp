import { getBuzzElapsedMs } from '@engine/miniGames/buzzToAnswer'
import {
  FIRST_BUZZ_ANSWER_TIMEOUT_MS,
  FIRST_BUZZ_PENALTY,
  FIRST_BUZZ_POINTS,
  FIRST_BUZZ_WINDOW_MS,
  firstBuzz,
  type FirstBuzzState,
} from '@engine/miniGames/firstBuzz'
import type { QuestionStep } from '@engine/miniGames/miniGame'
import type { ButtonIndex } from '@engine/types'
import { MINI_GAME_FIRST_BUZZ } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  questionContext,
  trueFalseQuestion,
} from '../_helpers/fixtures'

// Bonne réponse en B (index 1).
const question = qcmQuestion(5, 1)

function scores(values: number[]) {
  return PARTICIPANTS.map((participant, index) => ({
    participantId: participant.id,
    score: values[index] ?? 0,
  }))
}

function start(scoreValues: number[] = [0, 0, 0, 0], at = 0): QuestionStep<FirstBuzzState> {
  return firstBuzz.start(
    question,
    PARTICIPANTS,
    at,
    questionContext(question, { scores: scores(scoreValues) })
  )
}

function press(state: FirstBuzzState, participantId: number, button: ButtonIndex, at: number) {
  return firstBuzz.press(state, { participantId, button, at })
}

describe('firstBuzz definition', () => {
  it('is registered under the first buzz id', () => {
    expect(firstBuzz.id).toBe(MINI_GAME_FIRST_BUZZ)
    expect(firstBuzz.minParticipants).toBeUndefined()
    expect(firstBuzz.arrangeAnswers).toBeUndefined()
    expect(firstBuzz.revealMs).toBeUndefined()
  })

  it('accepts readable multiple choice questions only', () => {
    expect(firstBuzz.isQuestionEligible(question)).toBe(true)
    expect(firstBuzz.isQuestionEligible(imageQuestion(1))).toBe(true)
    expect(firstBuzz.isQuestionEligible(trueFalseQuestion(2, true))).toBe(true)
    expect(firstBuzz.isQuestionEligible(audioQuestion(3))).toBe(false)
    expect(firstBuzz.isQuestionEligible(qcmQuestion(4, 0, 1))).toBe(false)
    expect(
      firstBuzz.isQuestionEligible({
        ...question,
        answers: question.answers.map((answer) => ({ ...answer, isCorrect: false })),
      })
    ).toBe(false)
  })
})

describe('firstBuzz start', () => {
  it('opens the buzz window without events and copies the starting scores', () => {
    const context = questionContext(question, { scores: scores([10, 20, 30, 40]) })
    const step = firstBuzz.start(question, PARTICIPANTS, 1000, context)

    expect(step.events).toEqual([])
    expect(step.answers).toBeUndefined()
    expect(step.state).toMatchObject({
      kind: MINI_GAME_FIRST_BUZZ,
      status: 'open',
      openedAt: 1000,
      windowMs: FIRST_BUZZ_WINDOW_MS,
      participantIds: [1, 2, 3, 4],
      lockedOutIds: [],
      answers: [],
    })
    expect(step.state.scoresAtStart).toEqual(context.scores)
    expect(step.state.scoresAtStart).not.toBe(context.scores)
    expect(step.state.scoresAtStart[0]).not.toBe(context.scores[0])
  })
})

describe('firstBuzz window', () => {
  it('ends for everybody without answers when nobody buzzes', () => {
    const { state } = start([], 1000)

    expect(firstBuzz.tick(state, 1000 + FIRST_BUZZ_WINDOW_MS - 1)).toEqual({ state, events: [] })

    const end = firstBuzz.tick(state, 1000 + FIRST_BUZZ_WINDOW_MS + 5000)

    expect(end.answers).toEqual([])
    expect(end.state.status).toBe('done')
    expect(end.endedAt).toBe(1000 + FIRST_BUZZ_WINDOW_MS)
  })

  it('reports the elapsed buzz time, frozen while someone answers', () => {
    const { state } = start()

    expect(getBuzzElapsedMs(state, 4000)).toBe(4000)
    expect(getBuzzElapsedMs(state, 99_000)).toBe(FIRST_BUZZ_WINDOW_MS)
    expect(getBuzzElapsedMs(state, -50)).toBe(0)

    const buzz = press(state, 1, 0, 3000)

    expect(getBuzzElapsedMs(buzz.state, 7000)).toBe(3000)
  })
})

describe('firstBuzz answers', () => {
  it('lets the first buzzer (any button) answer alone and win 100 points', () => {
    const buzz = press(start().state, 2, 3, 2500)

    expect(buzz.state.status).toBe('answering')
    expect(buzz.state.answeringParticipantId).toBe(2)
    expect(buzz.state.answerDeadline).toBe(2500 + FIRST_BUZZ_ANSWER_TIMEOUT_MS)
    expect(buzz.events).toEqual([
      {
        type: 'buzzer_pressed',
        at: 2500,
        payload: { questionId: 5, participantId: 2, elapsedMs: 2500 },
      },
    ])

    // Pendant la réponse, les autres ne peuvent ni buzzer ni répondre.
    const other = press(buzz.state, 3, 1, 2600)
    expect(other.state).toBe(buzz.state)
    expect(other.events).toEqual([])

    const answer = press(buzz.state, 2, 1, 4000)

    expect(answer.state.status).toBe('done')
    expect(answer.endedAt).toBe(4000)
    expect(answer.events).toEqual([
      {
        type: 'answer_correct',
        at: 4000,
        payload: { questionId: 5, participantId: 2, answerId: 51 },
      },
    ])
    expect(answer.answers).toEqual([
      {
        participantId: 2,
        questionId: 5,
        answerId: 51,
        isCorrect: true,
        points: FIRST_BUZZ_POINTS,
        responseTimeMs: 2500,
        stage: null,
      },
    ])
  })

  it('penalises a wrong answer by 25 points, locks the player out and passes the hand', () => {
    const buzz = press(start([100, 100, 100, 100]).state, 1, 0, 1000)
    const wrong = press(buzz.state, 1, 2, 3000)

    expect(wrong.answers).toBeUndefined()
    expect(wrong.state.status).toBe('open')
    expect(wrong.state.lockedOutIds).toEqual([1])
    expect(wrong.state.answers).toEqual([
      {
        participantId: 1,
        questionId: 5,
        answerId: 52,
        isCorrect: false,
        points: -FIRST_BUZZ_PENALTY,
        responseTimeMs: 1000,
        stage: null,
      },
    ])
    expect(wrong.events).toEqual([
      {
        type: 'answer_wrong',
        at: 3000,
        payload: { questionId: 5, participantId: 1, answerId: 52, timedOut: false },
      },
    ])

    // Le joueur bloqué ne peut plus buzzer ; un autre prend la main et trouve.
    expect(press(wrong.state, 1, 0, 3100).events).toEqual([])
    const second = press(wrong.state, 3, 0, 3500)
    expect(second.state.answeringParticipantId).toBe(3)

    const correct = press(second.state, 3, 1, 4000)
    expect(correct.answers).toEqual([
      expect.objectContaining({ participantId: 1, points: -FIRST_BUZZ_PENALTY }),
      expect.objectContaining({ participantId: 3, isCorrect: true, points: FIRST_BUZZ_POINTS }),
    ])
  })

  it.each([
    [0, 0],
    [10, -10],
    [25, -25],
    [400, -25],
  ])('caps the penalty to the score at question start (%i)', (score, points) => {
    const buzz = press(start([score, 0, 0, 0]).state, 1, 0, 100)
    const wrong = press(buzz.state, 1, 0, 200)

    expect(wrong.state.answers[0]?.points).toBe(points)
  })

  it('pauses the buzz window while a player answers', () => {
    const buzz = press(start().state, 1, 0, 2000)
    // 4 s de réponse : la fenêtre finit 4 s plus tard que prévu.
    const wrong = press(buzz.state, 1, 0, 6000)

    expect(wrong.state.openedAt).toBe(4000)
    expect(firstBuzz.tick(wrong.state, FIRST_BUZZ_WINDOW_MS + 3999).events).toEqual([])

    const end = firstBuzz.tick(wrong.state, FIRST_BUZZ_WINDOW_MS + 4000)
    expect(end.state.status).toBe('done')
    expect(end.endedAt).toBe(FIRST_BUZZ_WINDOW_MS + 4000)
    expect(end.answers).toHaveLength(1)

    // Le temps de buzz du joueur suivant ne compte pas la pause.
    const next = press(wrong.state, 2, 0, 9000)
    expect(next.events[0]?.payload).toMatchObject({ elapsedMs: 5000 })
    expect(press(next.state, 2, 1, 9500).answers?.[1]?.responseTimeMs).toBe(5000)
  })

  it('treats an answer timeout as a wrong answer', () => {
    const buzz = press(start([50, 0, 0, 0]).state, 1, 0, 500)
    const deadline = 500 + FIRST_BUZZ_ANSWER_TIMEOUT_MS

    expect(firstBuzz.tick(buzz.state, deadline - 1)).toEqual({ state: buzz.state, events: [] })

    const timeout = firstBuzz.tick(buzz.state, deadline + 2000)

    expect(timeout.events).toEqual([
      {
        type: 'answer_wrong',
        at: deadline,
        payload: { questionId: 5, participantId: 1, answerId: null, timedOut: true },
      },
    ])
    expect(timeout.state.status).toBe('open')
    expect(timeout.state.lockedOutIds).toEqual([1])
    // La reprise se fait à l'échéance réelle, pas au tick tardif.
    expect(timeout.state.openedAt).toBe(FIRST_BUZZ_ANSWER_TIMEOUT_MS)
    expect(timeout.state.answers[0]).toMatchObject({
      answerId: null,
      isCorrect: false,
      points: -FIRST_BUZZ_PENALTY,
      responseTimeMs: 500,
    })
  })

  it('ends the question when every player is locked out', () => {
    let { state } = start([0, 10, 30, 100])
    let last: QuestionStep<FirstBuzzState> | undefined

    for (const [index, participant] of PARTICIPANTS.entries()) {
      state = press(state, participant.id, 0, 100 + index * 100).state
      last = press(state, participant.id, 3, 150 + index * 100)
      state = last.state
    }

    expect(state.status).toBe('done')
    expect(last?.endedAt).toBe(450)
    expect(last?.answers?.map((answer) => [answer.participantId, answer.points])).toEqual([
      [1, 0],
      [2, -10],
      [3, -25],
      [4, -25],
    ])
    expect(last?.answers?.every((answer) => !answer.isCorrect)).toBe(true)
  })

  it('ignores unknown players, buttons without an answer and presses once done', () => {
    const shortQuestion = qcmQuestion(8, 0, 2)
    const { state } = firstBuzz.start(
      shortQuestion,
      PARTICIPANTS,
      0,
      questionContext(shortQuestion)
    )

    expect(press(state, 99, 0, 10)).toEqual({ state, events: [] })

    const buzz = press(state, 1, 3, 10)
    expect(buzz.state.status).toBe('answering')
    expect(press(buzz.state, 1, 3, 20)).toEqual({ state: buzz.state, events: [] })

    const done = press(buzz.state, 1, 0, 30)
    expect(done.state.status).toBe('done')
    expect(press(done.state, 2, 0, 40)).toEqual({ state: done.state, events: [] })
    expect(firstBuzz.tick(done.state, 99_999)).toEqual({ state: done.state, events: [] })
  })

  it('does not mutate the state it receives', () => {
    const { state } = start([100, 0, 0, 0])
    const snapshot = structuredClone(state)

    const buzz = press(state, 1, 0, 100)
    const buzzSnapshot = structuredClone(buzz.state)
    press(buzz.state, 1, 0, 200)
    firstBuzz.tick(buzz.state, 99_999)

    expect(state).toEqual(snapshot)
    expect(buzz.state).toEqual(buzzSnapshot)
  })
})
