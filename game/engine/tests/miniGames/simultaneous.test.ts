import {
  choiceRecord,
  createSimultaneousMiniGame,
  getAnsweringEnd,
  isAnsweringComplete,
  isChoiceCorrect,
  lockAnswer,
  openAnswering,
  type SimultaneousAnswering,
} from '@engine/miniGames/simultaneous'
import { MINI_GAME_QUICK_ANSWER } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { PARTICIPANTS, qcmQuestion, questionContext } from '../_helpers/fixtures'

// Bonne réponse en B (index 1), 3 réponses seulement : D n'existe pas.
const question = qcmQuestion(5, 1, 3)

function open(playerIds = [1, 2, 3]): SimultaneousAnswering {
  return openAnswering(question, playerIds, 1000, 10_000)
}

function lock(
  answering: SimultaneousAnswering,
  participantId: number,
  button: 0 | 1 | 2 | 3,
  at: number
) {
  return lockAnswer(answering, { participantId, button, at })
}

describe('openAnswering', () => {
  it('opens an empty answering window ending at the deadline', () => {
    expect(open()).toEqual({
      question,
      playerIds: [1, 2, 3],
      startedAt: 1000,
      deadline: 11_000,
      choices: [],
    })
  })
})

describe('lockAnswer', () => {
  it('locks the first answer of a player and emits answer_locked without revealing it', () => {
    const answering = open()
    const locked = lock(answering, 2, 1, 1500)

    expect(locked?.answering.choices).toEqual([
      { participantId: 2, answerId: question.answers[1]?.id, button: 1, at: 1500 },
    ])
    expect(locked?.event).toEqual({
      type: 'answer_locked',
      at: 1500,
      payload: { questionId: 5, participantId: 2, answeredCount: 1, playersCount: 3 },
    })
    expect(locked?.event.payload).not.toHaveProperty('answerId')
    // L'état reçu n'est pas modifié.
    expect(answering.choices).toEqual([])
  })

  it('counts answered players in the event', () => {
    const first = lock(open(), 1, 0, 1100)
    const second = first && lock(first.answering, 3, 2, 1200)

    expect(second?.event.payload).toMatchObject({ answeredCount: 2, playersCount: 3 })
  })

  it('ignores a second press, an unknown or unauthorised player, an empty button and late presses', () => {
    const locked = lock(open(), 1, 0, 1100)

    expect(locked).not.toBeNull()
    expect(lock(locked!.answering, 1, 1, 1200)).toBeNull()
    expect(lock(open(), 99, 0, 1200)).toBeNull()
    expect(lock(open([1, 2]), 3, 0, 1200)).toBeNull()
    expect(lock(open(), 1, 3, 1200)).toBeNull()
    expect(lock(open(), 1, 0, 11_000)).toBeNull()
    expect(lock(open(), 1, 0, 10_999)).not.toBeNull()
  })
})

describe('isAnsweringComplete / getAnsweringEnd', () => {
  it('is complete at the deadline, ending at the deadline', () => {
    const answering = open()

    expect(isAnsweringComplete(answering, 10_999)).toBe(false)
    expect(isAnsweringComplete(answering, 11_000)).toBe(true)
    expect(getAnsweringEnd(answering)).toBe(11_000)
  })

  it('is complete once everybody answered, ending at the last press', () => {
    let answering = open([1, 2])
    answering = lock(answering, 2, 0, 3000)!.answering

    expect(isAnsweringComplete(answering, 3000)).toBe(false)
    expect(getAnsweringEnd(answering)).toBe(11_000)

    answering = lock(answering, 1, 1, 4200)!.answering

    expect(isAnsweringComplete(answering, 4200)).toBe(true)
    expect(getAnsweringEnd(answering)).toBe(4200)
  })

  it('ends at the start when nobody may answer', () => {
    const answering = open([])

    expect(isAnsweringComplete(answering, 1000)).toBe(true)
    expect(getAnsweringEnd(answering)).toBe(1000)
  })
})

describe('choiceRecord / isChoiceCorrect', () => {
  it('builds a game_answers line with response time, points and stage', () => {
    const answering = lock(open(), 2, 1, 2345.6)!.answering
    const [choice] = answering.choices

    expect(isChoiceCorrect(question, choice!)).toBe(true)
    expect(choiceRecord(answering, choice!, 80)).toEqual({
      participantId: 2,
      questionId: 5,
      answerId: question.answers[1]?.id,
      isCorrect: true,
      points: 80,
      responseTimeMs: 1346,
      stage: null,
    })
    expect(choiceRecord(answering, choice!, 80, 3).stage).toBe(3)
  })

  it('marks a wrong choice as incorrect', () => {
    const answering = lock(open(), 2, 0, 2000)!.answering

    expect(isChoiceCorrect(question, answering.choices[0]!)).toBe(false)
    expect(choiceRecord(answering, answering.choices[0]!, 0).isCorrect).toBe(false)
  })
})

describe('createSimultaneousMiniGame', () => {
  const game = createSimultaneousMiniGame({
    id: MINI_GAME_QUICK_ANSWER,
    durationMs: 10_000,
    isQuestionEligible: () => true,
    prepare: (participants) => ({
      // Seuls les pupitres impairs jouent : exerce la liste des joueurs autorisés.
      playerIds: participants.filter((item) => item.podium % 2 === 1).map((item) => item.id),
      extra: { label: 'x' },
    }),
    score: (answering) => answering.choices.map((choice) => choiceRecord(answering, choice, 1)),
    endEvents: (answering, extra, records, at) => [
      {
        type: 'player_eliminated',
        at,
        payload: { label: extra.label, count: records.length, questionId: answering.question.id },
      },
    ],
  })

  it('keeps definition fields and opens with the prepared players', () => {
    const step = game.start(question, PARTICIPANTS, 1000, questionContext(question))

    expect(game.id).toBe(MINI_GAME_QUICK_ANSWER)
    expect(step.events).toEqual([])
    expect(step.answers).toBeUndefined()
    expect(step.state).toMatchObject({
      kind: MINI_GAME_QUICK_ANSWER,
      status: 'answering',
      extra: { label: 'x' },
      answering: { playerIds: [1, 3], startedAt: 1000, deadline: 11_000, choices: [] },
    })
  })

  it('closes immediately when nobody may answer', () => {
    const step = game.start(question, [PARTICIPANTS[1]!], 1000, questionContext(question))

    expect(step.state.status).toBe('done')
    expect(step.answers).toEqual([])
    expect(step.endedAt).toBe(1000)
    expect(step.events).toEqual([
      expect.objectContaining({
        type: 'player_eliminated',
        payload: expect.objectContaining({ count: 0 }),
      }),
    ])
  })

  it('ends early when everybody answered, with answer_locked then end events', () => {
    const { state } = game.start(question, PARTICIPANTS, 1000, questionContext(question))
    const first = game.press(state, { participantId: 1, button: 0, at: 2000 })
    const ignored = game.press(first.state, { participantId: 2, button: 0, at: 2100 })
    const last = game.press(ignored.state, { participantId: 3, button: 1, at: 2500 })

    expect(first.answers).toBeUndefined()
    expect(ignored.state).toBe(first.state)
    expect(ignored.events).toEqual([])
    expect(last.state.status).toBe('done')
    expect(last.endedAt).toBe(2500)
    expect(last.answers).toHaveLength(2)
    expect(last.events.map((event) => event.type)).toEqual(['answer_locked', 'player_eliminated'])
    // États reçus intacts.
    expect(state.answering.choices).toEqual([])
    expect(first.state.status).toBe('answering')
    expect(first.state.answering.choices).toHaveLength(1)
  })

  it('ends at the deadline through tick and ignores presses afterwards', () => {
    const { state } = game.start(question, PARTICIPANTS, 1000, questionContext(question))
    const pressed = game.press(state, { participantId: 1, button: 1, at: 2000 })

    expect(game.tick(pressed.state, 10_999).state).toBe(pressed.state)

    const ended = game.tick(pressed.state, 11_000)

    expect(ended.state.status).toBe('done')
    expect(ended.endedAt).toBe(11_000)
    expect(ended.answers).toEqual([expect.objectContaining({ participantId: 1, points: 1 })])
    expect(game.press(ended.state, { participantId: 3, button: 0, at: 11_000 }).state).toBe(
      ended.state
    )
    expect(game.tick(ended.state, 20_000)).toEqual({ state: ended.state, events: [] })
  })
})
