import type { QuestionStep } from '@engine/miniGames/miniGame'
import {
  getProgressiveRevealPoints,
  PROGRESSIVE_REVEAL_ANSWER_TIMEOUT_MS,
  PROGRESSIVE_REVEAL_MAX_POINTS,
  PROGRESSIVE_REVEAL_MIN_POINTS,
  PROGRESSIVE_REVEAL_WINDOW_MS,
  progressiveReveal,
  type ProgressiveRevealState,
} from '@engine/miniGames/progressiveReveal'
import type { ButtonIndex } from '@engine/types'
import { MINI_GAME_PROGRESSIVE_REVEAL } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  questionContext,
} from '../_helpers/fixtures'

// Bonne réponse en D (index 3).
const question = imageQuestion(6, 3)

function start(scoreValue = 0): QuestionStep<ProgressiveRevealState> {
  return progressiveReveal.start(
    question,
    PARTICIPANTS,
    0,
    questionContext(question, {
      scores: PARTICIPANTS.map((participant) => ({
        participantId: participant.id,
        score: scoreValue,
      })),
    })
  )
}

function press(
  state: ProgressiveRevealState,
  participantId: number,
  button: ButtonIndex,
  at: number
) {
  return progressiveReveal.press(state, { participantId, button, at })
}

describe('getProgressiveRevealPoints', () => {
  it.each([
    [0, 100],
    [5000, 80],
    [10_000, 60],
    [15_000, 40],
    [20_000, 20],
    [-1000, 100],
    [50_000, 20],
    [1234, 95],
  ])('gives %i ms → %i points', (elapsedMs, points) => {
    expect(getProgressiveRevealPoints(elapsedMs)).toBe(points)
  })

  it('stays within the 20 to 100 points bounds', () => {
    expect(PROGRESSIVE_REVEAL_MAX_POINTS).toBe(100)
    expect(PROGRESSIVE_REVEAL_MIN_POINTS).toBe(20)
  })
})

describe('progressiveReveal.isQuestionEligible', () => {
  it('accepts image questions with a media url and playable answers', () => {
    expect(progressiveReveal.id).toBe(MINI_GAME_PROGRESSIVE_REVEAL)
    expect(progressiveReveal.isQuestionEligible(question)).toBe(true)
  })

  it('rejects text, audio, image without url or without playable answers', () => {
    expect(progressiveReveal.isQuestionEligible(qcmQuestion(1))).toBe(false)
    expect(progressiveReveal.isQuestionEligible(audioQuestion(2))).toBe(false)
    expect(progressiveReveal.isQuestionEligible({ ...question, mediaUrl: null })).toBe(false)
    expect(progressiveReveal.isQuestionEligible({ ...question, mediaUrl: '' })).toBe(false)
    expect(
      progressiveReveal.isQuestionEligible({ ...question, answers: question.answers.slice(0, 1) })
    ).toBe(false)
    expect(
      progressiveReveal.isQuestionEligible({
        ...question,
        answers: question.answers.map((answer) => ({ ...answer, isCorrect: false })),
      })
    ).toBe(false)
  })
})

describe('progressiveReveal answers', () => {
  it.each([
    [0, 100],
    [10_000, 60],
    [19_999, 20],
  ])('awards points by the elapsed time at buzz (%i ms)', (buzzAt, points) => {
    const buzz = press(start().state, 2, 0, buzzAt)
    // La réponse arrive plus tard : seul le moment du buzz compte.
    const answer = press(buzz.state, 2, 3, buzzAt + 4000)

    expect(answer.state.status).toBe('done')
    expect(answer.answers).toEqual([
      expect.objectContaining({
        participantId: 2,
        answerId: 63,
        isCorrect: true,
        points,
        responseTimeMs: buzzAt,
      }),
    ])
  })

  it('locks out a wrong answer without penalty, even with points to lose', () => {
    const buzz = press(start(500).state, 1, 0, 1000)
    const wrong = press(buzz.state, 1, 0, 2000)

    expect(wrong.state.status).toBe('open')
    expect(wrong.state.lockedOutIds).toEqual([1])
    expect(wrong.state.answers).toEqual([
      expect.objectContaining({ participantId: 1, isCorrect: false, points: 0 }),
    ])
    expect(press(wrong.state, 1, 0, 2500).events).toEqual([])
  })

  it('does not count the answering pause in the elapsed time of the next buzz', () => {
    const buzz = press(start().state, 1, 0, 5000)
    // 5 s de réponse ratée : l'image reste figée.
    const wrong = press(buzz.state, 1, 0, 10_000)
    const next = press(wrong.state, 2, 0, 15_000)
    const answer = press(next.state, 2, 3, 15_500)

    // 10 s réellement écoulées dans la fenêtre → 60 points.
    expect(answer.answers?.[1]).toMatchObject({ participantId: 2, points: 60 })
  })

  it('treats an answer timeout as a wrong answer without penalty', () => {
    const buzz = press(start(300).state, 4, 1, 100)
    const timeout = progressiveReveal.tick(buzz.state, 100 + PROGRESSIVE_REVEAL_ANSWER_TIMEOUT_MS)

    expect(timeout.events[0]).toMatchObject({
      type: 'answer_wrong',
      payload: { participantId: 4, timedOut: true, answerId: null },
    })
    expect(timeout.state.answers[0]?.points).toBe(0)
  })

  it('ends at the end of the window when nobody finds', () => {
    const { state } = start()

    expect(progressiveReveal.tick(state, PROGRESSIVE_REVEAL_WINDOW_MS - 1).events).toEqual([])

    const end = progressiveReveal.tick(state, PROGRESSIVE_REVEAL_WINDOW_MS)
    expect(end.state.status).toBe('done')
    expect(end.answers).toEqual([])
    expect(end.endedAt).toBe(PROGRESSIVE_REVEAL_WINDOW_MS)
  })

  it('ends when every player is locked out, nobody losing points', () => {
    let { state } = start(200)
    let last: QuestionStep<ProgressiveRevealState> | undefined

    for (const [index, participant] of PARTICIPANTS.entries()) {
      state = press(state, participant.id, 0, 1000 * (index + 1)).state
      last = press(state, participant.id, 0, 1000 * (index + 1) + 100)
      state = last.state
    }

    expect(state.status).toBe('done')
    expect(last?.answers).toHaveLength(4)
    expect(last?.answers?.every((answer) => answer.points === 0 && !answer.isCorrect)).toBe(true)
  })
})
