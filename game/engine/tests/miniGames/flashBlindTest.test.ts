import {
  FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS,
  FLASH_BLIND_TEST_BUZZ_WINDOW_MS,
  flashBlindTest,
  type FlashBlindTestState,
} from '@engine/miniGames/flashBlindTest'
import type { QuestionStep } from '@engine/miniGames/miniGame'
import { QUESTION_MEDIA_TYPE_IMAGE } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { audioQuestion, PARTICIPANTS, questionContext, textQuestion } from '../_helpers/fixtures'

const STAGE_1_END = 1000 + FLASH_BLIND_TEST_BUZZ_WINDOW_MS
const STAGE_2_END = STAGE_1_END + 5000 + FLASH_BLIND_TEST_BUZZ_WINDOW_MS
const STAGE_3_END = STAGE_2_END + 20_000 + FLASH_BLIND_TEST_BUZZ_WINDOW_MS

// Bonne réponse en C (index 2).
const question = audioQuestion(7, 2)

function start(): QuestionStep<FlashBlindTestState> {
  return flashBlindTest.start(question, PARTICIPANTS, 0, questionContext(question))
}

function press(
  state: FlashBlindTestState,
  participantId: number,
  button: 0 | 1 | 2 | 3,
  at: number
) {
  return flashBlindTest.press(state, { participantId, button, at })
}

describe('flashBlindTest.isQuestionEligible', () => {
  it('accepts audio questions with 2 to 4 answers and a correct one', () => {
    expect(flashBlindTest.isQuestionEligible(question)).toBe(true)
  })

  it('rejects non audio questions, missing media or invalid answers', () => {
    expect(flashBlindTest.isQuestionEligible(textQuestion(1))).toBe(false)
    expect(
      flashBlindTest.isQuestionEligible({ ...question, mediaType: QUESTION_MEDIA_TYPE_IMAGE })
    ).toBe(false)
    expect(flashBlindTest.isQuestionEligible({ ...question, mediaUrl: null })).toBe(false)
    expect(
      flashBlindTest.isQuestionEligible({ ...question, answers: question.answers.slice(0, 1) })
    ).toBe(false)
    expect(
      flashBlindTest.isQuestionEligible({
        ...question,
        answers: question.answers.map((answer) => ({ ...answer, isCorrect: false })),
      })
    ).toBe(false)
    expect(
      flashBlindTest.isQuestionEligible({
        ...question,
        answers: [...question.answers, { id: 99, text: 'E', isCorrect: false }],
      })
    ).toBe(false)
  })
})

describe('flashBlindTest stages', () => {
  it('starts with a 1 second extract', () => {
    const step = start()

    expect(step.state.stageIndex).toBe(0)
    expect(step.events).toEqual([
      expect.objectContaining({
        type: 'blind_test_stage_started',
        at: 0,
        payload: expect.objectContaining({
          stage: 1,
          extractMs: 1000,
          mediaUrl: question.mediaUrl,
        }),
      }),
    ])
  })

  it('moves to the 5 s then 20 s extract when nobody buzzes, then everybody loses', () => {
    let { state } = start()

    expect(flashBlindTest.tick(state, STAGE_1_END - 1).events).toEqual([])

    const stage2 = flashBlindTest.tick(state, STAGE_1_END)
    expect(stage2.events[0]).toMatchObject({
      type: 'blind_test_stage_started',
      at: STAGE_1_END,
      payload: { stage: 2, extractMs: 5000 },
    })
    state = stage2.state

    const stage3 = flashBlindTest.tick(state, STAGE_2_END)
    expect(stage3.events[0]).toMatchObject({ payload: { stage: 3, extractMs: 20_000 } })
    state = stage3.state

    const end = flashBlindTest.tick(state, STAGE_3_END)
    expect(end.answers).toEqual([])
    expect(end.state.status).toBe('done')
  })
})

describe('flashBlindTest answers', () => {
  it.each([
    [0, 500, 100],
    [1, STAGE_1_END + 200, 50],
    [2, STAGE_2_END + 200, 20],
  ])('awards stage %i points to the first correct buzz', (stageIndex, buzzAt, points) => {
    let { state } = start()

    if (stageIndex >= 1) {
      state = flashBlindTest.tick(state, STAGE_1_END).state
    }

    if (stageIndex >= 2) {
      state = flashBlindTest.tick(state, STAGE_2_END).state
    }

    const buzz = press(state, 3, 0, buzzAt)
    expect(buzz.events.map((event) => event.type)).toEqual(['buzzer_pressed', 'blind_test_paused'])
    expect(buzz.state.status).toBe('answering')

    const answer = press(buzz.state, 3, 2, buzzAt + 1500)

    expect(answer.state.status).toBe('done')
    expect(answer.answers).toEqual([
      expect.objectContaining({
        participantId: 3,
        isCorrect: true,
        points,
        stage: stageIndex + 1,
        answerId: 72,
      }),
    ])
    expect(answer.events[0]?.type).toBe('answer_correct')
  })

  it('ignores presses from other players while someone is answering', () => {
    const buzz = press(start().state, 1, 0, 300)
    const other = press(buzz.state, 2, 2, 400)

    expect(other.state).toBe(buzz.state)
    expect(other.events).toEqual([])
  })

  it('locks out a wrong answer without penalty and lets the others buzz', () => {
    const buzz = press(start().state, 1, 3, 300)
    const wrong = press(buzz.state, 1, 0, 2300)

    expect(wrong.state.status).toBe('playing')
    expect(wrong.state.lockedOutIds).toEqual([1])
    expect(wrong.state.answers).toEqual([
      expect.objectContaining({ participantId: 1, isCorrect: false, points: 0 }),
    ])
    expect(wrong.events.map((event) => event.type)).toEqual([
      'answer_wrong',
      'blind_test_stage_resumed',
    ])
    expect(wrong.events[1]?.payload).toMatchObject({ elapsedMs: 300 })

    // Le joueur bloqué ne peut plus buzzer, les autres oui.
    expect(press(wrong.state, 1, 0, 2400).events).toEqual([])
    expect(press(wrong.state, 2, 0, 2400).state.answeringParticipantId).toBe(2)
  })

  it('does not count the answering time against the stage', () => {
    const buzz = press(start().state, 1, 0, 300)
    const wrong = press(buzz.state, 1, 0, 4300)

    // 300 ms écoulés avant le buzz, 4 s de réponse : le palier finit à 4 s + 4 s.
    expect(flashBlindTest.tick(wrong.state, STAGE_1_END + 3999).events).toEqual([])
    expect(flashBlindTest.tick(wrong.state, STAGE_1_END + 4000).events[0]?.payload).toMatchObject({
      stage: 2,
    })
  })

  it('treats an answer timeout as a wrong answer', () => {
    const buzz = press(start().state, 4, 0, 100)

    expect(
      flashBlindTest.tick(buzz.state, 100 + FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS - 1).events
    ).toEqual([])

    const timeout = flashBlindTest.tick(buzz.state, 100 + FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS)

    expect(timeout.events[0]).toMatchObject({
      type: 'answer_wrong',
      payload: { participantId: 4, timedOut: true },
    })
    expect(timeout.state.lockedOutIds).toEqual([4])
  })

  it('ends the question when every player is locked out', () => {
    let { state } = start()

    for (const [index, participant] of PARTICIPANTS.entries()) {
      state = press(state, participant.id, 0, 100 + index * 10).state
      const step = press(state, participant.id, 0, 105 + index * 10)
      state = step.state

      if (index === PARTICIPANTS.length - 1) {
        expect(step.answers).toHaveLength(4)
        expect(step.answers?.every((answer) => !answer.isCorrect)).toBe(true)
      }
    }

    expect(state.status).toBe('done')
  })

  it('ignores unknown players and buttons without an answer', () => {
    const shortQuestion = { ...question, answers: question.answers.slice(0, 2) }
    const { state } = flashBlindTest.start(
      shortQuestion,
      PARTICIPANTS,
      0,
      questionContext(shortQuestion)
    )

    expect(press(state, 99, 0, 10).events).toEqual([])

    const buzz = press(state, 1, 0, 10)
    expect(press(buzz.state, 1, 3, 20).events).toEqual([])
  })
})
