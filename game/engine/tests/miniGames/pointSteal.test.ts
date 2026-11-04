import type { QuestionStep } from '@engine/miniGames/miniGame'
import {
  getPointStealTargeting,
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
    expect(pointSteal.isQuestionEligible(imageQuestion(1))).toBe(false)
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

// ── 5 et 6 pupitres : le voleur fait défiler la cible (A précédent, B suivant, C ou D valide) ──

const SIX: EngineParticipant[] = [1, 2, 3, 4, 5, 6].map((podium) => ({
  id: podium,
  podium,
  displayName: `Joueur ${podium}`,
}))

function startMany(
  scoreValues: number[],
  participants: EngineParticipant[] = SIX
): QuestionStep<PointStealState> {
  return pointSteal.start(
    question,
    participants,
    0,
    questionContext(question, {
      scores: participants.map((participant, index) => ({
        participantId: participant.id,
        score: scoreValues[index] ?? 0,
      })),
    })
  )
}

/** Joueur 1 trouve le premier ; tous les autres se trompent : on arrive au choix de la cible. */
function reachTargeting(
  scoreValues: number[],
  participants: EngineParticipant[] = SIX
): QuestionStep<PointStealState> {
  let step: QuestionStep<PointStealState> = startMany(scoreValues, participants)
  step = press(step.state, 1, 0, 100)

  for (const [index, participant] of participants.slice(1).entries()) {
    step = press(step.state, participant.id, 1, 200 + index)
  }

  return step
}

describe('pointSteal targeting mode', () => {
  it('uses the buttons directly while every podium is 1 to 4', () => {
    expect(getPointStealTargeting(PARTICIPANTS)).toBe('direct')
    expect(getPointStealTargeting([PARTICIPANTS[0]!, PARTICIPANTS[3]!])).toBe('direct')
    expect(start().state.targeting).toBe('direct')
  })

  it('scrolls as soon as a podium is the 5th or the 6th, even with few players', () => {
    expect(getPointStealTargeting(SIX)).toBe('scroll')
    expect(getPointStealTargeting(SIX.slice(0, 5))).toBe('scroll')
    expect(getPointStealTargeting([SIX[0]!, SIX[5]!])).toBe('scroll')
    expect(getPointStealTargeting([SIX[4]!, SIX[5]!])).toBe('scroll')
  })

  it('never highlights anything in direct mode', () => {
    const asked = answer(start([0, 200, 0, 0]).state, [[1, 0]])
    const { state } = pointSteal.tick(asked.state, ANSWER_END)

    expect(state.targeting).toBe('direct')
    expect(state.highlightedId).toBeNull()
  })
})

/** Le voleur avance deux fois puis valide : même suite d'appuis, même résultat. */
function scrollAndValidate() {
  const { state } = reachTargeting([0, 50, 400, 120, 90, 0])

  return press(press(press(state, 1, 1, 1000).state, 1, 1, 1100).state, 1, 3, 1200)
}

describe('pointSteal with 5 or 6 podiums', () => {
  it('asks the thief for a target and highlights the automatic one (the richest)', () => {
    const step = reachTargeting([0, 50, 400, 120, 400, 0])

    expect(step.state.status).toBe('targeting')
    expect(step.state.targeting).toBe('scroll')
    expect(step.state.thiefId).toBe(1)
    // 400 à égalité entre 3 et 5 : le plus petit pupitre.
    expect(step.state.highlightedId).toBe(3)
    expect(step.events.at(-1)).toEqual({
      type: 'steal_target_requested',
      at: 204,
      payload: { questionId: 4, participantId: 1, targetIds: [2, 3, 4, 5] },
    })
  })

  it('moves forward with B and back with A, in podium order, looping around', () => {
    // Cibles possibles (hors voleur 1, sans les pupitres à 0 point) : 2, 3, 4, 5.
    const { state } = reachTargeting([0, 50, 400, 120, 90, 0])
    expect(state.highlightedId).toBe(3)

    const next = press(state, 1, 1, 1000)
    expect(next.state.highlightedId).toBe(4)
    expect(next.events).toEqual([])
    expect(next.state.status).toBe('targeting')

    const further = press(press(next.state, 1, 1, 1100).state, 1, 1, 1200)
    // 4 -> 5 -> 2 (retour au début de la liste).
    expect(further.state.highlightedId).toBe(2)

    // A recule : 2 -> 5 (fin de liste).
    expect(press(further.state, 1, 0, 1300).state.highlightedId).toBe(5)
    expect(press(state, 1, 0, 1000).state.highlightedId).toBe(2)
  })

  it('skips opponents without points and the thief', () => {
    // Joueur 6 a 80 points, les autres 0 sauf le joueur 4 (60) : cibles 4 et 6.
    const { state } = reachTargeting([0, 0, 0, 60, 0, 80])

    expect(state.highlightedId).toBe(6)
    expect(press(state, 1, 1, 1000).state.highlightedId).toBe(4)
    expect(press(press(state, 1, 1, 1000).state, 1, 1, 1100).state.highlightedId).toBe(6)
  })

  it.each([2, 3] as ButtonIndex[])('validates the highlighted target with button %i', (button) => {
    const { state } = reachTargeting([0, 50, 400, 120, 90, 0])
    const moved = press(press(state, 1, 1, 1000).state, 1, 1, 1100).state

    expect(moved.highlightedId).toBe(5)

    const stolen = press(moved, 1, button, 1500)

    expect(stolen.state.status).toBe('done')
    expect(stolen.state.highlightedId).toBeNull()
    expect(stolen.endedAt).toBe(1500)
    expect(stolen.events).toEqual([
      {
        type: 'points_stolen',
        at: 1500,
        payload: { questionId: 4, thiefId: 1, targetId: 5, points: 90, automatic: false },
      },
    ])
    expect(stolen.answers?.find((record) => record.participantId === 1)?.points).toBe(
      POINT_STEAL_POINTS + 90
    )
    expect(stolen.answers?.find((record) => record.participantId === 5)?.points).toBe(-90)
  })

  it('validates the automatic target as is when the thief just presses C', () => {
    const { state } = reachTargeting([0, 50, 400, 120, 90, 0])
    const stolen = press(state, 1, 2, 1000)

    expect(stolen.events[0]?.payload).toMatchObject({
      targetId: 3,
      points: POINT_STEAL_AMOUNT,
      automatic: false,
    })
  })

  it('reaches pupitres 5 and 6, which no direct button can designate', () => {
    const { state } = reachTargeting([0, 0, 0, 0, 0, 300])
    const stolen = press(state, 1, 3, 1000)

    expect(stolen.events[0]?.payload).toMatchObject({ targetId: 6, points: 100 })
  })

  it('ignores presses from other players and from the thief while not targeting', () => {
    const { state } = reachTargeting([0, 50, 400, 120, 90, 0])

    for (const participantId of [2, 3, 4, 5, 6]) {
      for (const button of [0, 1, 2, 3] as ButtonIndex[]) {
        expect(press(state, participantId, button, 1000)).toEqual({ state, events: [] })
      }
    }

    const answering = startMany([0, 50, 400, 120, 90, 0]).state
    expect(press(answering, 1, 1, 100).state.highlightedId).toBeNull()
    expect(answering.status).toBe('answering')
  })

  it('steals from the richest opponent at the end of the time, wherever the cursor is', () => {
    const { state } = reachTargeting([0, 50, 400, 120, 90, 0])
    const moved = press(press(state, 1, 1, 1000).state, 1, 1, 1100).state

    expect(moved.highlightedId).toBe(5)
    // Tous ont répondu à 204 ms : le choix dure 8 s à partir de là.
    const deadline = 204 + POINT_STEAL_TARGET_MS
    expect(moved.targetDeadline).toBe(deadline)
    expect(pointSteal.tick(moved, deadline - 1).events).toEqual([])

    const auto = pointSteal.tick(moved, deadline + 5000)

    expect(auto.state.status).toBe('done')
    expect(auto.endedAt).toBe(deadline)
    expect(auto.events).toEqual([
      {
        type: 'points_stolen',
        at: deadline,
        payload: { questionId: 4, thiefId: 1, targetId: 3, points: 100, automatic: true },
      },
    ])
  })

  it('also scrolls with 3 players when one of them sits on pupitre 6', () => {
    const trio = [SIX[0]!, SIX[1]!, SIX[5]!]
    const { state } = reachTargeting([0, 100, 250], trio)

    expect(state.targeting).toBe('scroll')
    expect(state.highlightedId).toBe(6)
    expect(press(state, 1, 1, 1000).state.highlightedId).toBe(2)
    expect(press(state, 1, 0, 1000).state.highlightedId).toBe(2)
  })

  it('skips the target phase when no opponent has points', () => {
    const step = reachTargeting([0, 0, 0, 0, 0, 0])

    expect(step.state.status).toBe('done')
    expect(step.state.highlightedId).toBeNull()
    expect(step.events.some((event) => event.type === 'steal_target_requested')).toBe(false)
  })

  it('does not move the cursor of a lone opponent, and still validates', () => {
    const duo = [SIX[0]!, SIX[4]!]
    const { state } = reachTargeting([0, 70], duo)

    expect(state.highlightedId).toBe(5)
    expect(press(state, 1, 1, 1000).state.highlightedId).toBe(5)
    expect(press(state, 1, 0, 1000).state.highlightedId).toBe(5)
    expect(press(state, 1, 2, 1000).events[0]?.payload).toMatchObject({ targetId: 5, points: 70 })
  })

  it('does not mutate the state it receives', () => {
    const { state } = reachTargeting([0, 50, 400, 120, 90, 0])
    const snapshot = structuredClone(state)

    press(state, 1, 1, 1000)
    press(state, 1, 0, 1000)
    press(state, 1, 3, 1000)
    pointSteal.tick(state, 204 + POINT_STEAL_TARGET_MS)

    expect(state).toEqual(snapshot)
  })

  it('is deterministic: the same presses give the same result', () => {
    expect(scrollAndValidate()).toEqual(scrollAndValidate())
  })

  it('ignores the buttons if the highlighted target is gone', () => {
    const { state } = reachTargeting([0, 50, 400, 120, 90, 0])
    const lost = { ...state, highlightedId: null }

    for (const button of [0, 1, 2, 3] as ButtonIndex[]) {
      expect(press(lost, 1, button, 1000)).toEqual({ state: lost, events: [] })
    }
  })
})
