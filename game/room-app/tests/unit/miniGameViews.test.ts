import { type ButtonIndex, getMiniGameQuestion } from '@quizzup/game-engine'
import {
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_ESTIMATE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_STREAK,
  MINI_GAME_SUDDEN_DEATH,
  MINI_GAME_TRUE_FALSE,
  type MiniGame,
} from '@quizzup/shared'

import { getMiniGameView } from '@/game/miniGameViews'
import { toEngineParticipants } from '@/game/registrations'
import { getRevealView } from '@/game/selectors'
import { createMemorySessionStorage, GameSession } from '@/game/session'

import { driveToQuestion } from '../_helpers/drive'
import {
  baseSetup,
  createManualClock,
  REGISTRATIONS,
  SIX_REGISTRATIONS,
} from '../_helpers/fixtures'

function startOn(miniGame: MiniGame) {
  const clock = createManualClock()
  const session = GameSession.create(baseSetup({ miniGames: [miniGame] }), REGISTRATIONS, {
    storage: createMemorySessionStorage(),
    now: clock.now,
  })
  session.start()
  driveToQuestion(session, clock)
  return { session, clock }
}

/** Partie à 6 pupitres sur un seul mini-jeu, jusqu'à la première question. */
function startSixOn(miniGame: MiniGame) {
  const clock = createManualClock()
  const session = GameSession.create(
    baseSetup({
      miniGames: [miniGame],
      participants: toEngineParticipants(SIX_REGISTRATIONS),
    }),
    SIX_REGISTRATIONS,
    { storage: createMemorySessionStorage(), now: clock.now }
  )
  session.start()
  driveToQuestion(session, clock)
  return { session, clock }
}

function correctIndex(session: GameSession): ButtonIndex {
  const { phase } = session.state
  if (phase.name !== 'question') {
    throw new Error(`not in question: ${phase.name}`)
  }
  return getMiniGameQuestion(phase.miniGameState).answers.findIndex(
    (answer) => answer.isCorrect
  ) as ButtonIndex
}

describe('getMiniGameView', () => {
  it('ne décrit ni le blind test ni une phase hors question', () => {
    const { session } = startOn(MINI_GAME_FLASH_BLIND_TEST)
    expect(getMiniGameView(session.state, 0)).toBeNull()

    const other = startOn(MINI_GAME_QUICK_ANSWER)
    other.clock.advance(60_000)
    other.session.tick()
    expect(getMiniGameView(other.session.state, other.clock.value)).toBeNull()
  })

  it.each([MINI_GAME_QUICK_ANSWER, MINI_GAME_TRUE_FALSE, MINI_GAME_ESTIMATE])(
    '%s : tout le monde répond, le choix reste secret',
    (miniGame) => {
      const { session, clock } = startOn(miniGame)
      const view = getMiniGameView(session.state, clock.value)

      expect(view).toMatchObject({ mode: 'answer_all', miniGame, answeredIds: [] })
      expect(view?.mode === 'answer_all' && view.remainingRatio).toBe(1)

      clock.advance(1000)
      session.press(2, 0)
      const after = getMiniGameView(session.state, clock.value)
      expect(after).toMatchObject({ answeredIds: [2], playerIds: [1, 2, 3] })
    }
  )

  it('vrai/faux : A = Vrai, B = Faux', () => {
    const { session, clock } = startOn(MINI_GAME_TRUE_FALSE)
    const view = getMiniGameView(session.state, clock.value)

    expect(view?.question.answers.map((answer) => answer.text)).toEqual(['Vrai', 'Faux'])
  })

  it('série : affiche le multiplicateur de chaque joueur', () => {
    const { session, clock } = startOn(MINI_GAME_STREAK)
    const view = getMiniGameView(session.state, clock.value)

    expect(view?.mode === 'answer_all' && view.tags[1]).toEqual({ kind: 'multiplier', value: 1 })
  })

  it('mort subite : les éliminés ne répondent plus', () => {
    const { session, clock } = startOn(MINI_GAME_SUDDEN_DEATH)
    const right = correctIndex(session)
    const wrong = ((right + 1) % 4) as ButtonIndex
    session.press(1, right)
    session.press(2, right)
    session.press(3, wrong)
    clock.advance(10_000)
    session.tick()

    const view = getMiniGameView(session.state, clock.value)
    expect(view).toMatchObject({ mode: 'answer_all', playerIds: [1, 2], eliminatedIds: [3] })
  })

  it('quitte ou double : mises puis réponses avec les mises affichées', () => {
    const { session, clock } = startOn(MINI_GAME_DOUBLE_OR_NOTHING)
    expect(getMiniGameView(session.state, clock.value)).toMatchObject({ mode: 'bet', betIds: [] })

    session.press(1, 0)
    session.press(2, 2)
    expect(getMiniGameView(session.state, clock.value)).toMatchObject({ betIds: [1, 2] })
    session.press(3, 3)

    const view = getMiniGameView(session.state, clock.value)
    expect(view).toMatchObject({ mode: 'answer_all' })
    expect(view?.mode === 'answer_all' && view.tags).toEqual({
      1: { kind: 'pass', value: 0 },
      2: { kind: 'stake', value: 200 },
      3: { kind: 'all_in', value: 300 },
    })
  })

  it('vol de points : le plus rapide des bons choisit sa cible', () => {
    const { session, clock } = startOn(MINI_GAME_POINT_STEAL)
    const right = correctIndex(session)
    session.press(2, right)
    session.press(1, right)
    session.press(3, right)

    expect(getMiniGameView(session.state, clock.value)).toMatchObject({
      mode: 'steal',
      thiefId: 2,
      targetIds: [1, 3],
      targeting: 'direct',
      highlightedId: null,
    })

    session.press(2, 0) // A = pupitre 1
    const reveal = getRevealView(session.state)
    expect(reveal?.results).toEqual([
      // Léa n'avait que les 50 points de la question : c'est tout ce qu'on peut lui voler.
      { participantId: 1, isCorrect: true, points: 0 },
      { participantId: 2, isCorrect: true, points: 100 },
      { participantId: 3, isCorrect: true, points: 50 },
    ])
  })

  it('vol de points à 6 pupitres : la cible défile avec A et B, C ou D valide', () => {
    const { session, clock } = startSixOn(MINI_GAME_POINT_STEAL)
    const right = correctIndex(session)
    const wrong = ((right + 1) % 4) as ButtonIndex
    // 5 est le plus rapide des bons (le voleur) ; 2 et 6 ont aussi gagné 50 points.
    session.press(5, right)
    session.press(2, right)
    session.press(6, right)
    for (const desk of [1, 3, 4]) {
      session.press(desk, wrong)
    }

    // Cible automatique en surbrillance : à égalité, le plus petit pupitre.
    expect(getMiniGameView(session.state, clock.value)).toMatchObject({
      mode: 'steal',
      thiefId: 5,
      targetIds: [2, 6],
      targeting: 'scroll',
      highlightedId: 2,
    })

    session.press(2, 1) // pas le voleur : ignoré
    expect(getMiniGameView(session.state, clock.value)).toMatchObject({ highlightedId: 2 })
    session.press(5, 1) // B : suivant
    expect(getMiniGameView(session.state, clock.value)).toMatchObject({ highlightedId: 6 })
    session.press(5, 1) // B : retour au début
    expect(getMiniGameView(session.state, clock.value)).toMatchObject({ highlightedId: 2 })
    session.press(5, 0) // A : précédent
    expect(getMiniGameView(session.state, clock.value)).toMatchObject({ highlightedId: 6 })

    session.press(5, 3) // D : valide le pupitre 6
    const reveal = getRevealView(session.state)
    expect(reveal?.results.find((result) => result.participantId === 5)?.points).toBe(100)
    expect(reveal?.results.find((result) => result.participantId === 6)?.points).toBe(0)
    expect(reveal?.results.find((result) => result.participantId === 2)?.points).toBe(50)
  })

  it('vol de points à 6 pupitres : sans validation, la cible automatique est volée', () => {
    const { session, clock } = startSixOn(MINI_GAME_POINT_STEAL)
    const right = correctIndex(session)
    const wrong = ((right + 1) % 4) as ButtonIndex
    session.press(5, right)
    session.press(2, right)
    session.press(6, right)
    for (const desk of [1, 3, 4]) {
      session.press(desk, wrong)
    }
    session.press(5, 1)

    clock.advance(9000)
    session.tick()

    const reveal = getRevealView(session.state)
    expect(reveal?.results.find((result) => result.participantId === 2)?.points).toBe(0)
    expect(reveal?.results.find((result) => result.participantId === 5)?.points).toBe(100)
  })

  it.each([MINI_GAME_FIRST_BUZZ, MINI_GAME_PROGRESSIVE_REVEAL])(
    '%s : buzz, réponse seule, joueur bloqué après une erreur',
    (miniGame) => {
      const { session, clock } = startOn(miniGame)
      const open = getMiniGameView(session.state, clock.value)
      expect(open).toMatchObject({ mode: 'buzz', status: 'open', progress: 0 })
      expect(open?.mode === 'buzz' && open.pointsAtStake).toBe(
        miniGame === MINI_GAME_PROGRESSIVE_REVEAL ? 100 : null
      )

      clock.advance(2000)
      session.press(3, 0)
      const answering = getMiniGameView(session.state, clock.value)
      expect(answering).toMatchObject({ status: 'answering', answeringParticipantId: 3 })

      const wrong = ((correctIndex(session) + 1) % 4) as ButtonIndex
      session.press(3, wrong)
      expect(getMiniGameView(session.state, clock.value)).toMatchObject({
        status: 'open',
        lockedOutIds: [3],
      })
    }
  )
})
