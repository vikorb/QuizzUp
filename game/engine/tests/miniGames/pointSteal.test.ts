import type { QuestionStep } from '@engine/miniGames/miniGame'
import {
  pickAutomaticTarget,
  POINT_STEAL_AMOUNT,
  POINT_STEAL_ANSWER_MS,
  POINT_STEAL_POINTS,
  POINT_STEAL_TARGET_MS,
  pointSteal,
  type PointStealState,
} from '@engine/miniGames/pointSteal'
import type { ButtonIndex, EngineParticipant } from '@engine/types'
import { MINI_GAME_POINT_STEAL } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  questionContext,
} from '../_helpers/fixtures'

// Bonne réponse en A (index 0).
const question = qcmQuestion(4, 0)
const ANSWER_END = POINT_STEAL_ANSWER_MS

function start(
  scoreValues: number[] = [0, 0, 0, 0],
  participants: EngineParticipant[] = PARTICIPANTS
): QuestionStep<PointStealState> {
  return pointSteal.start(
    question,
    participants,
    0,
    questionContext(question, {
      scores: PARTICIPANTS.map((participant, index) => ({
        participantId: participant.id,
        score: scoreValues[index] ?? 0,
      })),
    })
  )
}

function press(state: PointStealState, participantId: number, button: ButtonIndex, at: number) {
  return pointSteal.press(state, { participantId, button, at })
}

/** Réponses jouées dans l'ordre donné : [joueur, bouton]. */
function answer(state: PointStealState, plays: [number, ButtonIndex][]) {
  let step: QuestionStep<PointStealState> = { state, events: [] }

  for (const [index, [participantId, button]] of plays.entries()) {
    step = press(step.state, participantId, button, 1000 * (index + 1))
  }

  return step
}

function pointsOf(step: QuestionStep<PointStealState>) {
  return step.answers?.map((record) => [record.participantId, record.points])
}

describe('pointSteal definition', () => {
  it('needs an opponent and plays readable multiple choice questions', () => {
    expect(pointSteal.id).toBe(MINI_GAME_POINT_STEAL)
    expect(pointSteal.minParticipants).toBe(2)
    expect(pointSteal.isQuestionEligible(question)).toBe(true)
    expect(pointSteal.isQuestionEligible(imageQuestion(1))).toBe(true)
    expect(pointSteal.isQuestionEligible(audioQuestion(2))).toBe(false)
  })

  it('starts in the answering phase with copies of participants and scores', () => {
    const step = start([10, 20, 30, 40])

    expect(step.events).toEqual([])
    expect(step.state).toMatchObject({
      kind: MINI_GAME_POINT_STEAL,
      status: 'answering',
      thiefId: null,
      targetDeadline: null,
      records: [],
    })
    expect(step.state.participants).toEqual(PARTICIPANTS)
    expect(step.state.participants[0]).not.toBe(PARTICIPANTS[0])
    expect(step.state.answering.deadline).toBe(POINT_STEAL_ANSWER_MS)
  })
})

describe('pointSteal answers', () => {
  it('gives 50 points to correct answers and asks the fastest one for a target', () => {
    // 2 répond faux d'abord, puis 3 juste (le plus rapide des bons), puis 1 juste.
    const step = answer(start([0, 0, 0, 300]).state, [
      [2, 1],
      [3, 0],
      [1, 0],
      [4, 2],
    ])

    expect(step.answers).toBeUndefined()
    expect(step.state.status).toBe('targeting')
    expect(step.state.thiefId).toBe(3)
    expect(step.state.targetDeadline).toBe(4000 + POINT_STEAL_TARGET_MS)
    expect(step.state.records.map((record) => [record.participantId, record.points])).toEqual([
      [2, 0],
      [3, POINT_STEAL_POINTS],
      [1, POINT_STEAL_POINTS],
      [4, 0],
    ])
    expect(step.events.map((event) => event.type)).toEqual([
      'answer_locked',
      'steal_target_requested',
    ])
    // Joueur 2 n'a aucun point : il n'est pas une cible.
    expect(step.events[1]).toEqual({
      type: 'steal_target_requested',
      at: 4000,
      payload: { questionId: 4, participantId: 3, targetIds: [1, 4] },
    })
  })

  it('lets the thief choose a target by podium (A = podium 1) and steal 100 points', () => {
    const asked = answer(start([0, 0, 0, 300]).state, [
      [3, 0],
      [1, 1],
      [2, 1],
      [4, 1],
    ])

    // D = pupitre 4.
    const stolen = press(asked.state, 3, 3, 6000)

    expect(stolen.state.status).toBe('done')
    expect(stolen.endedAt).toBe(6000)
    expect(pointsOf(stolen)).toEqual([
      [3, POINT_STEAL_POINTS + POINT_STEAL_AMOUNT],
      [1, 0],
      [2, 0],
      [4, -POINT_STEAL_AMOUNT],
    ])
    expect(stolen.events).toEqual([
      {
        type: 'points_stolen',
        at: 6000,
        payload: { questionId: 4, thiefId: 3, targetId: 4, points: 100, automatic: false },
      },
    ])
  })

  it('steals at most what the target has, including the points just won', () => {
    // Joueur 2 avait 30 points et vient d'en gagner 50 : 80 volables.
    const asked = answer(start([0, 30, 0, 0]).state, [
      [1, 0],
      [2, 0],
    ])
    const end = pointSteal.tick(asked.state, ANSWER_END)

    expect(end.state.status).toBe('targeting')
    const stolen = press(end.state, 1, 1, ANSWER_END + 100)

    expect(stolen.events[0]?.payload).toMatchObject({ targetId: 2, points: 80 })
    expect(pointsOf(stolen)).toEqual([
      [1, 130],
      [2, -30],
    ])
  })

  it('adds a single loss line for a target who did not answer', () => {
    const asked = answer(start([0, 0, 250, 0]).state, [[1, 0]])
    const end = pointSteal.tick(asked.state, ANSWER_END)
    const stolen = press(end.state, 1, 2, ANSWER_END + 10)

    expect(stolen.answers).toEqual([
      expect.objectContaining({ participantId: 1, points: 150 }),
      {
        participantId: 3,
        questionId: 4,
        answerId: null,
        isCorrect: false,
        points: -100,
        responseTimeMs: null,
        stage: null,
      },
    ])
    // Une seule ligne par joueur.
    const ids = stolen.answers?.map((record) => record.participantId) ?? []
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ignores invalid target presses', () => {
    const asked = answer(start([0, 200, 0, 0]).state, [[1, 0]])
    const { state } = pointSteal.tick(asked.state, ANSWER_END)

    // Pas le voleur, lui-même, un pupitre sans points.
    expect(press(state, 2, 0, ANSWER_END + 1)).toEqual({ state, events: [] })
    expect(press(state, 1, 0, ANSWER_END + 1)).toEqual({ state, events: [] })
    expect(press(state, 1, 2, ANSWER_END + 1)).toEqual({ state, events: [] })
  })

  it('ignores a button pointing to an empty podium', () => {
    const duo = [PARTICIPANTS[0]!, PARTICIPANTS[1]!]
    const asked = answer(start([0, 200], duo).state, [[1, 0]])
    const { state } = pointSteal.tick(asked.state, ANSWER_END)

    expect(press(state, 1, 3, ANSWER_END + 1)).toEqual({ state, events: [] })
    expect(press(state, 1, 1, ANSWER_END + 1).events[0]?.payload).toMatchObject({ targetId: 2 })
  })

  it('targets the richest opponent automatically when the thief does not choose', () => {
    const asked = answer(start([0, 120, 400, 400]).state, [[1, 0]])
    const { state } = pointSteal.tick(asked.state, ANSWER_END)

    expect(pickAutomaticTarget(state)).toBe(3)
    expect(pointSteal.tick(state, ANSWER_END + POINT_STEAL_TARGET_MS - 1).events).toEqual([])

    const auto = pointSteal.tick(state, ANSWER_END + POINT_STEAL_TARGET_MS + 5000)

    expect(auto.state.status).toBe('done')
    expect(auto.endedAt).toBe(ANSWER_END + POINT_STEAL_TARGET_MS)
    // Égalité 3 / 4 : le plus petit pupitre.
    expect(auto.events).toEqual([
      {
        type: 'points_stolen',
        at: ANSWER_END + POINT_STEAL_TARGET_MS,
        payload: { questionId: 4, thiefId: 1, targetId: 3, points: 100, automatic: true },
      },
    ])
  })

  // Bug : la cible automatique suit l'ordre des participants reçus, pas le numéro de pupitre.
  it('breaks automatic target ties by the smallest podium, whatever the input order', () => {
    const reversed = [...PARTICIPANTS].reverse()
    const asked = answer(start([0, 0, 400, 400], reversed).state, [[1, 0]])
    const { state } = pointSteal.tick(asked.state, ANSWER_END)

    expect(pickAutomaticTarget(state)).toBe(3)
  })

  it('returns no automatic target when nobody can be robbed', () => {
    const { state } = start()

    expect(pickAutomaticTarget({ ...state, thiefId: 1 })).toBeNull()
  })

  it('skips the target phase when no opponent has points', () => {
    const step = answer(start([0, 0, 0, 0]).state, [
      [2, 0],
      [1, 1],
      [3, 2],
      [4, 3],
    ])

    expect(step.state.status).toBe('done')
    expect(step.endedAt).toBe(4000)
    expect(step.events.map((event) => event.type)).toEqual(['answer_locked'])
    expect(pointsOf(step)).toEqual([
      [2, 50],
      [1, 0],
      [3, 0],
      [4, 0],
    ])
  })

  it('ends without a steal when nobody answers correctly', () => {
    const asked = answer(start([100, 100, 100, 100]).state, [
      [1, 1],
      [2, 2],
    ])
    const end = pointSteal.tick(asked.state, ANSWER_END)

    expect(end.state.status).toBe('done')
    expect(end.state.thiefId).toBeNull()
    expect(end.endedAt).toBe(ANSWER_END)
    expect(end.events).toEqual([])
    expect(pointsOf(end)).toEqual([
      [1, 0],
      [2, 0],
    ])
  })

  it('ignores late, duplicated or unknown answers and presses once done', () => {
    const { state } = start()
    const first = press(state, 1, 1, 100)

    expect(press(first.state, 1, 0, 200)).toEqual({ state: first.state, events: [] })
    expect(press(state, 99, 0, 200)).toEqual({ state, events: [] })
    expect(press(state, 1, 0, ANSWER_END)).toEqual({ state, events: [] })
    expect(pointSteal.tick(state, ANSWER_END - 1)).toEqual({ state, events: [] })

    const done = pointSteal.tick(state, ANSWER_END)
    expect(done.state.status).toBe('done')
    expect(press(done.state, 1, 0, 99_999)).toEqual({ state: done.state, events: [] })
    expect(pointSteal.tick(done.state, 99_999)).toEqual({ state: done.state, events: [] })
  })

  it('does not mutate the state it receives', () => {
    const asked = answer(start([0, 300, 0, 0]).state, [[1, 0]])
    const { state } = pointSteal.tick(asked.state, ANSWER_END)
    const snapshot = structuredClone(state)

    press(state, 1, 1, ANSWER_END + 10)
    pointSteal.tick(state, ANSWER_END + POINT_STEAL_TARGET_MS)

    expect(state).toEqual(snapshot)
  })
})
