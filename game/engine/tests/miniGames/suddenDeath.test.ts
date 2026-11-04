import {
  eliminate,
  getSurvivors,
  isSuddenDeathOver,
  SUDDEN_DEATH_DURATION_MS,
  SUDDEN_DEATH_POINTS,
  SUDDEN_DEATH_SURVIVOR_BONUS,
  suddenDeath,
  type SuddenDeathState,
} from '@engine/miniGames/suddenDeath'
import type { AnswerRecord, EngineParticipant } from '@engine/types'
import { MINI_GAME_SUDDEN_DEATH } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  questionContext,
} from '../_helpers/fixtures'

// Manche de 5 questions, bonne réponse toujours en B (index 1).
const ROUND = Array.from({ length: 5 }, (_item, index) => qcmQuestion(200 + index, 1))
const WIN = SUDDEN_DEATH_POINTS + SUDDEN_DEATH_SURVIVOR_BONUS

function record(participantId: number, questionIndex: number, isCorrect: boolean): AnswerRecord {
  return {
    participantId,
    questionId: ROUND[questionIndex]!.id,
    answerId: null,
    isCorrect,
    points: 0,
    responseTimeMs: 0,
    stage: null,
  }
}

function startAt(
  questionIndex: number,
  roundAnswers: AnswerRecord[],
  participants: EngineParticipant[] = PARTICIPANTS
) {
  const question = ROUND[questionIndex]!

  return suddenDeath.start(
    question,
    participants,
    0,
    questionContext(question, {
      questionIndex,
      questionsCount: ROUND.length,
      roundQuestions: ROUND,
      roundAnswers,
    })
  )
}

function press(state: SuddenDeathState, participantId: number, button: 0 | 1 | 2 | 3, at: number) {
  return suddenDeath.press(state, { participantId, button, at })
}

/** Fait répondre les joueurs dans l'ordre, puis clôt à l'échéance si besoin. */
function play(state: SuddenDeathState, presses: [number, 0 | 1 | 2 | 3][]) {
  let current = state
  let step = suddenDeath.tick(state, 0)

  presses.forEach(([participantId, button], index) => {
    step = press(current, participantId, button, (index + 1) * 100)
    current = step.state
  })

  return current.status === 'done' ? step : suddenDeath.tick(current, SUDDEN_DEATH_DURATION_MS)
}

// Après la question 0 : 1 et 2 ont bien répondu, 3 s'est trompé, 4 n'a pas répondu.
const AFTER_FIRST = [record(1, 0, true), record(2, 0, true), record(3, 0, false)]

describe('suddenDeath helpers', () => {
  it('eliminates wrong players, except when every survivor is wrong', () => {
    expect(eliminate([1, 2, 3], [1, 3])).toEqual([1, 3])
    expect(eliminate([1, 2, 3], [4])).toEqual([1, 2, 3])
    expect(eliminate([1, 2, 3], [])).toEqual([1, 2, 3])
    // En solo, l'erreur élimine.
    expect(eliminate([1], [])).toEqual([])
    expect(eliminate([1], [1])).toEqual([1])
  })

  it('replays the round to find the survivors', () => {
    expect(getSurvivors([1, 2, 3, 4], [], [])).toEqual([1, 2, 3, 4])
    expect(getSurvivors([1, 2, 3, 4], ROUND.slice(0, 1), AFTER_FIRST)).toEqual([1, 2])
    expect(
      getSurvivors([1, 2, 3, 4], ROUND.slice(0, 2), [
        ...AFTER_FIRST,
        record(1, 1, false),
        record(2, 1, false),
      ])
    ).toEqual([1, 2])
    expect(
      getSurvivors([1, 2, 3, 4], ROUND.slice(0, 2), [...AFTER_FIRST, record(2, 1, true)])
    ).toEqual([2])
  })

  it('is over with nobody left, or a single survivor among several players', () => {
    expect(isSuddenDeathOver(4, 1)).toBe(true)
    expect(isSuddenDeathOver(4, 2)).toBe(false)
    expect(isSuddenDeathOver(4, 0)).toBe(true)
    expect(isSuddenDeathOver(1, 1)).toBe(false)
    expect(isSuddenDeathOver(1, 0)).toBe(true)
  })
})

describe('suddenDeath.isQuestionEligible', () => {
  it('accepts multiple choice questions only', () => {
    expect(suddenDeath.id).toBe(MINI_GAME_SUDDEN_DEATH)
    expect(suddenDeath.isQuestionEligible(ROUND[0]!)).toBe(true)
    expect(suddenDeath.isQuestionEligible(imageQuestion(1))).toBe(false)
    expect(suddenDeath.isQuestionEligible(audioQuestion(1))).toBe(false)
    expect(suddenDeath.isQuestionEligible(qcmQuestion(1, 7))).toBe(false)
  })
})

describe('suddenDeath.isRoundOver', () => {
  const isRoundOver = suddenDeath.isRoundOver!

  it('continues while several players survive', () => {
    expect(
      isRoundOver({
        participants: PARTICIPANTS,
        playedQuestions: ROUND.slice(0, 1),
        roundAnswers: AFTER_FIRST,
      })
    ).toBe(false)
    expect(isRoundOver({ participants: PARTICIPANTS, playedQuestions: [], roundAnswers: [] })).toBe(
      false
    )
  })

  it('stops when one player is left standing', () => {
    expect(
      isRoundOver({
        participants: PARTICIPANTS,
        playedQuestions: ROUND.slice(0, 2),
        roundAnswers: [...AFTER_FIRST, record(1, 1, true), record(2, 1, false)],
      })
    ).toBe(true)
  })

  it('does not stop when every survivor was wrong', () => {
    expect(
      isRoundOver({
        participants: PARTICIPANTS,
        playedQuestions: ROUND.slice(0, 1),
        roundAnswers: PARTICIPANTS.map((participant) => record(participant.id, 0, false)),
      })
    ).toBe(false)
  })

  it('stops a solo round at the first mistake', () => {
    const solo = [PARTICIPANTS[0]!]

    expect(
      isRoundOver({
        participants: solo,
        playedQuestions: ROUND.slice(0, 2),
        roundAnswers: [record(1, 0, true), record(1, 1, true)],
      })
    ).toBe(false)
    expect(
      isRoundOver({
        participants: solo,
        playedQuestions: ROUND.slice(0, 3),
        roundAnswers: [record(1, 0, true), record(1, 1, true), record(1, 2, false)],
      })
    ).toBe(true)
  })
})

describe('suddenDeath play', () => {
  it('lets only the survivors answer', () => {
    const { state } = startAt(1, AFTER_FIRST)

    expect(state.answering.playerIds).toEqual([1, 2])
    expect(state.extra).toEqual({ participantsCount: 4, isLastQuestion: false })
    expect(press(state, 3, 1, 100).state).toBe(state)
    expect(press(state, 4, 1, 100).events).toEqual([])
  })

  it('eliminates wrong and silent players, survivors get the base points', () => {
    const step = play(startAt(0, []).state, [
      [1, 1],
      [2, 1],
      [3, 0],
    ])

    expect(step.endedAt).toBe(SUDDEN_DEATH_DURATION_MS)
    expect(step.answers).toEqual([
      expect.objectContaining({ participantId: 1, isCorrect: true, points: SUDDEN_DEATH_POINTS }),
      expect.objectContaining({ participantId: 2, isCorrect: true, points: SUDDEN_DEATH_POINTS }),
      expect.objectContaining({ participantId: 3, isCorrect: false, points: 0 }),
    ])
    expect(step.events).toEqual([
      {
        type: 'player_eliminated',
        at: SUDDEN_DEATH_DURATION_MS,
        payload: { questionId: ROUND[0]!.id, eliminatedIds: [3, 4], survivorIds: [1, 2] },
      },
    ])
  })

  it('eliminates nobody when every survivor is wrong', () => {
    const step = play(startAt(1, AFTER_FIRST).state, [
      [1, 0],
      [2, 3],
    ])

    expect(step.endedAt).toBe(200)
    expect(step.answers?.map((answer) => answer.points)).toEqual([0, 0])
    expect(step.events.map((event) => event.type)).toEqual(['answer_locked'])
  })

  it('gives the bonus to the last player standing and emits the elimination at the end', () => {
    const step = play(startAt(1, AFTER_FIRST).state, [
      [2, 0],
      [1, 1],
    ])

    expect(step.state.status).toBe('done')
    expect(step.endedAt).toBe(200)
    expect(step.answers).toEqual([
      expect.objectContaining({ participantId: 2, isCorrect: false, points: 0 }),
      expect.objectContaining({ participantId: 1, isCorrect: true, points: WIN }),
    ])
    expect(step.events).toEqual([
      expect.objectContaining({ type: 'answer_locked', at: 200 }),
      {
        type: 'player_eliminated',
        at: 200,
        payload: { questionId: ROUND[1]!.id, eliminatedIds: [2], survivorIds: [1] },
      },
    ])
  })

  it('gives the bonus to every right survivor on the last question', () => {
    const { state } = startAt(4, AFTER_FIRST)

    expect(state.extra.isLastQuestion).toBe(true)

    const step = play(state, [
      [1, 1],
      [2, 1],
    ])

    expect(step.answers?.map((answer) => answer.points)).toEqual([WIN, WIN])
    expect(step.events.map((event) => event.type)).toEqual(['answer_locked'])
  })

  it('plays solo as far as possible: bonus only at the end, first mistake eliminates', () => {
    const solo = [PARTICIPANTS[0]!]

    const right = play(startAt(0, [], solo).state, [[1, 1]])

    expect(right.answers).toEqual([expect.objectContaining({ points: SUDDEN_DEATH_POINTS })])
    expect(right.events.map((event) => event.type)).toEqual(['answer_locked'])

    const wrong = play(startAt(1, [record(1, 0, true)], solo).state, [[1, 2]])

    expect(wrong.answers).toEqual([expect.objectContaining({ isCorrect: false, points: 0 })])
    expect(wrong.events.at(-1)).toEqual(
      expect.objectContaining({
        type: 'player_eliminated',
        payload: expect.objectContaining({ eliminatedIds: [1], survivorIds: [] }),
      })
    )

    const allRight = ROUND.slice(0, 4).map((_question, index) => record(1, index, true))
    const last = play(startAt(4, allRight, solo).state, [[1, 1]])

    expect(last.answers).toEqual([expect.objectContaining({ points: WIN })])
  })

  it('closes at once when nobody survives', () => {
    const solo = [PARTICIPANTS[0]!]
    const step = startAt(1, [record(1, 0, false)], solo)

    expect(step.state.status).toBe('done')
    expect(step.answers).toEqual([])
    expect(step.events).toEqual([])
  })

  it('counts one press per survivor, ignores late presses and keeps input state intact', () => {
    const { state } = startAt(0, [])
    const snapshot = structuredClone(state)
    const first = press(state, 1, 0, 100)

    expect(press(first.state, 1, 1, 200).state).toBe(first.state)
    expect(press(state, 2, 1, SUDDEN_DEATH_DURATION_MS).state).toBe(state)
    suddenDeath.tick(first.state, SUDDEN_DEATH_DURATION_MS)
    expect(state).toEqual(snapshot)
  })
})
