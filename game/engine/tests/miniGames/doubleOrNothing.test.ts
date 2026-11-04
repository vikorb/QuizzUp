import {
  DOUBLE_OR_NOTHING_ALL_IN_MIN,
  DOUBLE_OR_NOTHING_ANSWER_MS,
  DOUBLE_OR_NOTHING_BET_MS,
  doubleOrNothing,
  type DoubleOrNothingState,
  getStake,
} from '@engine/miniGames/doubleOrNothing'
import type { QuestionStep } from '@engine/miniGames/miniGame'
import type { ButtonIndex } from '@engine/types'
import { MINI_GAME_DOUBLE_OR_NOTHING } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  questionContext,
} from '../_helpers/fixtures'

// Bonne réponse en C (index 2).
const question = qcmQuestion(9, 2)
const BET_END = 1000 + DOUBLE_OR_NOTHING_BET_MS

function start(scoreValues: number[] = [0, 0, 0, 0]): QuestionStep<DoubleOrNothingState> {
  return doubleOrNothing.start(
    question,
    PARTICIPANTS,
    1000,
    questionContext(question, {
      scores: PARTICIPANTS.map((participant, index) => ({
        participantId: participant.id,
        score: scoreValues[index] ?? 0,
      })),
    })
  )
}

function press(
  state: DoubleOrNothingState,
  participantId: number,
  button: ButtonIndex,
  at: number
) {
  return doubleOrNothing.press(state, { participantId, button, at })
}

/** Tous misent avec les boutons donnés (dans l'ordre des pupitres). */
function betAll(state: DoubleOrNothingState, buttons: ButtonIndex[], at = 2000) {
  let step: QuestionStep<DoubleOrNothingState> = { state, events: [] }

  for (const [index, participant] of PARTICIPANTS.entries()) {
    step = press(step.state, participant.id, buttons[index] ?? 1, at + index)
  }

  return step
}

describe('getStake', () => {
  it.each([
    [0, 500, 0],
    [1, 500, 100],
    [2, 500, 200],
    [3, 0, 300],
    [3, 299, 300],
    [3, 300, 300],
    [3, 1200, 1200],
  ] as const)('button %i with score %i stakes %i', (button, score, stake) => {
    expect(getStake(button, score)).toBe(stake)
  })

  it('stakes nothing on an unknown button', () => {
    expect(getStake(7 as ButtonIndex, 500)).toBe(0)
    expect(DOUBLE_OR_NOTHING_ALL_IN_MIN).toBe(300)
  })
})

describe('doubleOrNothing definition', () => {
  it('plays readable multiple choice questions', () => {
    expect(doubleOrNothing.id).toBe(MINI_GAME_DOUBLE_OR_NOTHING)
    expect(doubleOrNothing.isQuestionEligible(question)).toBe(true)
    expect(doubleOrNothing.isQuestionEligible(imageQuestion(1))).toBe(false)
    expect(doubleOrNothing.isQuestionEligible(audioQuestion(2))).toBe(false)
  })
})

describe('doubleOrNothing betting', () => {
  it('starts with a betting phase, the question not open yet', () => {
    const step = start([10, 20, 30, 40])

    expect(step.events).toEqual([])
    expect(step.state).toMatchObject({
      kind: MINI_GAME_DOUBLE_OR_NOTHING,
      status: 'betting',
      participantIds: [1, 2, 3, 4],
      betDeadline: BET_END,
      bets: [],
    })
    expect(step.state.scoresAtStart.map((line) => line.score)).toEqual([10, 20, 30, 40])
    // Une réponse pendant les mises est une mise, pas une réponse.
    const bet = press(step.state, 1, 2, 1500)
    expect(bet.state.answering.choices).toEqual([])
  })

  it('keeps bets secret until closing and ignores a second bet', () => {
    const first = press(start([500, 0, 0, 0]).state, 1, 3, 1500)

    expect(first.events).toEqual([
      { type: 'bet_placed', at: 1500, payload: { questionId: 9, participantId: 1 } },
    ])
    expect(first.state.bets).toEqual([{ participantId: 1, button: 3, stake: 500 }])

    const again = press(first.state, 1, 0, 1600)
    expect(again).toEqual({ state: first.state, events: [] })
    expect(press(first.state, 99, 0, 1600)).toEqual({ state: first.state, events: [] })
  })

  it('closes bets at the deadline, defaulting to B (100) for those who did not bet', () => {
    const { state } = press(start([0, 0, 600, 0]).state, 3, 3, 1500)

    expect(doubleOrNothing.tick(state, BET_END - 1)).toEqual({ state, events: [] })

    const closed = doubleOrNothing.tick(state, BET_END + 300)

    expect(closed.state.status).toBe('answering')
    expect(closed.state.bets).toEqual([
      { participantId: 1, button: 1, stake: 100 },
      { participantId: 2, button: 1, stake: 100 },
      { participantId: 3, button: 3, stake: 600 },
      { participantId: 4, button: 1, stake: 100 },
    ])
    expect(closed.events).toEqual([
      {
        type: 'bets_closed',
        at: BET_END,
        payload: { questionId: 9, bets: closed.state.bets },
      },
    ])
    expect(closed.events[0]?.payload.bets).not.toBe(closed.state.bets)
    expect(closed.state.answering.startedAt).toBe(BET_END)
    expect(closed.state.answering.deadline).toBe(BET_END + DOUBLE_OR_NOTHING_ANSWER_MS)
  })

  it('closes bets early once everybody has bet', () => {
    const step = betAll(start().state, [0, 1, 2, 3])

    expect(step.state.status).toBe('answering')
    expect(step.events.map((event) => event.type)).toEqual(['bet_placed', 'bets_closed'])
    expect(step.events[1]?.at).toBe(2003)
    expect(step.state.answering.startedAt).toBe(2003)
    expect(step.state.bets.map((bet) => bet.stake)).toEqual([0, 100, 200, 300])
  })
})

describe('doubleOrNothing answers', () => {
  it('wins the stake on a correct answer and loses it on a wrong one', () => {
    const bets = betAll(start([1000, 1000, 1000, 1000]).state, [1, 2, 3, 0])
    let { state } = bets
    const t0 = state.answering.startedAt

    state = press(state, 1, 2, t0 + 1000).state
    state = press(state, 2, 0, t0 + 2000).state
    state = press(state, 3, 2, t0 + 3000).state
    const last = press(state, 4, 1, t0 + 4000)

    expect(last.state.status).toBe('done')
    expect(last.endedAt).toBe(t0 + 4000)
    expect(last.events.map((event) => event.type)).toEqual(['answer_locked'])
    expect(last.answers).toEqual([
      expect.objectContaining({ participantId: 1, isCorrect: true, points: 100 }),
      expect.objectContaining({ participantId: 2, isCorrect: false, points: -200 }),
      expect.objectContaining({ participantId: 3, isCorrect: true, points: 1000 }),
      // Mise nulle : la ligne existe (il a répondu) mais ne rapporte rien.
      expect.objectContaining({ participantId: 4, isCorrect: false, points: 0 }),
    ])
    expect(last.answers?.[0]?.responseTimeMs).toBe(1000)
  })

  it('caps a loss to the score at question start', () => {
    const bets = betAll(start([50, 0, 150, 400]).state, [1, 3, 2, 3])
    let { state } = bets
    const t0 = state.answering.startedAt

    let last: QuestionStep<DoubleOrNothingState> | undefined

    for (const participant of PARTICIPANTS) {
      last = press(state, participant.id, 0, t0 + participant.id * 100)
      state = last.state
    }

    expect(state.status).toBe('done')
    // Tapis à 0 point = 300 en jeu, mais on ne perd que ce qu'on a.
    expect(last?.answers?.map((answer) => answer.points)).toEqual([-50, 0, -150, -400])
  })

  it('makes a player who bet but did not answer lose the stake', () => {
    const bets = betAll(start([80, 500, 500, 500]).state, [1, 2, 0, 3])
    const t0 = bets.state.answering.startedAt
    const answered = press(bets.state, 2, 2, t0 + 500)

    expect(doubleOrNothing.tick(answered.state, t0 + DOUBLE_OR_NOTHING_ANSWER_MS - 1).answers).toBe(
      undefined
    )

    const end = doubleOrNothing.tick(answered.state, t0 + DOUBLE_OR_NOTHING_ANSWER_MS + 999)

    expect(end.state.status).toBe('done')
    expect(end.endedAt).toBe(t0 + DOUBLE_OR_NOTHING_ANSWER_MS)
    // Joueur 3 a passé (A) sans répondre : aucune ligne.
    expect(end.answers).toEqual([
      {
        participantId: 1,
        questionId: 9,
        answerId: null,
        isCorrect: false,
        points: -80,
        responseTimeMs: null,
        stage: null,
      },
      expect.objectContaining({ participantId: 2, isCorrect: true, points: 200 }),
      expect.objectContaining({ participantId: 4, answerId: null, points: -500 }),
    ])
  })

  it('plays 100 points by default after a silent betting phase', () => {
    const { state } = start([0, 300, 0, 0])
    const closed = doubleOrNothing.tick(state, BET_END)
    const t0 = closed.state.answering.startedAt
    const answered = press(closed.state, 2, 2, t0 + 100)
    // Un seul appel de tick suffit à clore mises et réponses, au moment voulu.
    const end = doubleOrNothing.tick(answered.state, t0 + DOUBLE_OR_NOTHING_ANSWER_MS)

    expect(end.answers?.map((answer) => [answer.participantId, answer.points])).toEqual([
      [1, 0],
      [2, 100],
      [3, 0],
      [4, 0],
    ])
  })

  it('ignores answers after the deadline, invalid buttons and presses once done', () => {
    const shortQuestion = qcmQuestion(3, 0, 2)
    const { state } = doubleOrNothing.start(
      shortQuestion,
      PARTICIPANTS,
      0,
      questionContext(shortQuestion)
    )
    const closed = doubleOrNothing.tick(state, DOUBLE_OR_NOTHING_BET_MS)

    expect(press(closed.state, 1, 3, DOUBLE_OR_NOTHING_BET_MS + 10).events).toEqual([])
    expect(press(closed.state, 99, 0, DOUBLE_OR_NOTHING_BET_MS + 10).events).toEqual([])
    expect(
      press(closed.state, 1, 0, DOUBLE_OR_NOTHING_BET_MS + DOUBLE_OR_NOTHING_ANSWER_MS).events
    ).toEqual([])

    const done = doubleOrNothing.tick(
      closed.state,
      DOUBLE_OR_NOTHING_BET_MS + DOUBLE_OR_NOTHING_ANSWER_MS
    )
    expect(done.state.status).toBe('done')
    expect(press(done.state, 1, 0, 99_999)).toEqual({ state: done.state, events: [] })
    expect(doubleOrNothing.tick(done.state, 99_999)).toEqual({ state: done.state, events: [] })
  })

  it('does not mutate the state it receives', () => {
    const { state } = start([100, 100, 100, 100])
    const snapshot = structuredClone(state)
    const bets = betAll(state, [3, 3, 3, 3])
    const betsSnapshot = structuredClone(bets.state)

    press(bets.state, 1, 2, 5000)
    doubleOrNothing.tick(bets.state, 99_999)

    expect(state).toEqual(snapshot)
    expect(bets.state).toEqual(betsSnapshot)
  })
})
