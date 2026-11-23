import { createGame, type GameState, reduceGame, replayGame } from '@engine/engine'
import { getMiniGameQuestion } from '@engine/miniGames'
import { STREAK_BASE_POINTS } from '@engine/miniGames/streak'
import type { ButtonIndex, EngineQuestion, GameCommand, GameEvent, GameSetup } from '@engine/types'
import {
  MINI_GAME_ESTIMATE,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_STREAK,
  MINI_GAME_SUDDEN_DEATH,
  MINI_GAME_TRUE_FALSE,
  MINI_GAMES,
  type MiniGame,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  baseSetup,
  estimateQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  themeOf,
  trueFalseQuestion,
} from './_helpers/fixtures'

/** Question jouable par le mini-jeu (le flash blind test veut de l'audio, etc.). */
function questionFor(miniGame: MiniGame): (id: number) => EngineQuestion {
  switch (miniGame) {
    case MINI_GAME_FLASH_BLIND_TEST: {
      return (id) => audioQuestion(id)
    }
    case MINI_GAME_TRUE_FALSE: {
      return (id) => trueFalseQuestion(id, true)
    }
    case MINI_GAME_ESTIMATE: {
      return estimateQuestion
    }
    case MINI_GAME_PROGRESSIVE_REVEAL: {
      return (id) => imageQuestion(id)
    }
    default: {
      return (id) => qcmQuestion(id)
    }
  }
}

function setupFor(miniGame: MiniGame, overrides: Partial<GameSetup> = {}): GameSetup {
  const build = questionFor(miniGame)

  return baseSetup({
    miniGames: [miniGame],
    themes: [1, 2, 3, 4, 5].map((id) => themeOf(id, (questionId) => build(questionId))),
    ...overrides,
  })
}

/** Pilote une partie en gardant les commandes et les événements. */
function createDriver(setup: GameSetup) {
  let state = createGame(setup)
  const events: GameEvent[] = []
  const commands: GameCommand[] = []

  return {
    send(command: GameCommand): GameEvent[] {
      const step = reduceGame(state, command)
      state = step.state
      events.push(...step.events)
      commands.push(command)
      return step.events
    },
    events,
    commands,
    get state(): GameState {
      return state
    },
  }
}

type Driver = ReturnType<typeof createDriver>

function chooserPodium(driver: Driver): number {
  const chooser = driver.state.rounds.at(-1)?.chooserParticipantId
  return PARTICIPANTS.find((participant) => participant.id === chooser)?.podium ?? 0
}

/** Lance la partie jusqu'à la 1re question (le chooser prend le thème A à 4000). */
function startFirstQuestion(setup: GameSetup): Driver {
  const driver = createDriver(setup)
  driver.send({ type: 'start', at: 0 })
  driver.send({ type: 'tick', at: 4000 })
  driver.send({ type: 'press', at: 4000, podium: chooserPodium(driver), button: 0 })
  return driver
}

function correctButton(state: GameState): ButtonIndex {
  if (state.phase.name !== 'question') {
    throw new Error(`not in a question: ${state.phase.name}`)
  }

  return getMiniGameQuestion(state.phase.miniGameState).answers.findIndex(
    (answer) => answer.isCorrect
  ) as ButtonIndex
}

function scoresOf(state: GameState): number[] {
  return state.scores.map((line) => line.score)
}

describe('skip : commande', () => {
  it('ends the question with no point and no answer, then moves on like a question without winner', () => {
    const driver = startFirstQuestion(setupFor(MINI_GAME_FLASH_BLIND_TEST))
    const scoresBefore = scoresOf(driver.state)

    expect(driver.state.phase.name).toBe('question')

    const events = driver.send({ type: 'skip', at: 4500 })

    expect(events.map((event) => event.type)).toEqual(['question_ended'])
    expect(events[0]).toMatchObject({
      at: 4500,
      payload: { winnerIds: [], skipped: true },
    })
    expect(scoresOf(driver.state)).toEqual(scoresBefore)
    expect(driver.state.rounds[0]?.answers).toEqual([])
    expect(driver.state.rounds[0]?.skippedQuestionIds).toEqual([
      driver.state.rounds[0]?.questions[0]?.id,
    ])
    expect(driver.state.phase).toEqual({ name: 'reveal', questionIndex: 0, deadline: 9500 })

    const next = driver.send({ type: 'tick', at: 9500 })

    expect(next.map((event) => event.type)).toContain('question_started')
    expect(driver.state.phase).toMatchObject({ name: 'question', questionIndex: 1 })
  })

  it('leaves no trace of "skipped" on a question that ends normally', () => {
    const driver = startFirstQuestion(setupFor(MINI_GAME_FLASH_BLIND_TEST))
    const events = driver.send({ type: 'tick', at: 4000 + 60_000 })
    const ended = events.find((event) => event.type === 'question_ended')

    expect(ended).toBeDefined()
    expect(ended?.payload).not.toHaveProperty('skipped')
    expect(driver.state.rounds[0]?.skippedQuestionIds).toBeUndefined()
  })

  it.each([
    ['the lobby', (): Driver => createDriver(baseSetup())],
    [
      'the round intro',
      (): Driver => {
        const driver = createDriver(baseSetup())
        driver.send({ type: 'start', at: 0 })
        return driver
      },
    ],
    [
      'the theme choice',
      (): Driver => {
        const driver = createDriver(baseSetup())
        driver.send({ type: 'start', at: 0 })
        driver.send({ type: 'tick', at: 4000 })
        return driver
      },
    ],
    [
      'the reveal',
      (): Driver => {
        const driver = startFirstQuestion(setupFor(MINI_GAME_FLASH_BLIND_TEST))
        driver.send({ type: 'skip', at: 4500 })
        return driver
      },
    ],
    [
      'a finished game',
      (): Driver => {
        const driver = createDriver(baseSetup({ roundsCount: 1, questionsPerRound: 1 }))
        driver.send({ type: 'start', at: 0 })
        driver.send({ type: 'tick', at: 10_000_000 })
        return driver
      },
    ],
    [
      'an aborted game',
      (): Driver => {
        const driver = startFirstQuestion(setupFor(MINI_GAME_FLASH_BLIND_TEST))
        driver.send({ type: 'abort', at: 4100, reason: 'operator' })
        return driver
      },
    ],
  ])('has no effect in %s', (_label, build) => {
    const driver = build()
    const phaseBefore = driver.state.phase
    const scoresBefore = scoresOf(driver.state)
    const roundsBefore = structuredClone(driver.state.rounds)
    const at = driver.state.lastAt ?? 0

    // Même instant que le dernier événement : aucune échéance ne passe à cause du skip.
    expect(driver.send({ type: 'skip', at }).map((event) => event.type)).toEqual([])
    expect(driver.state.phase).toEqual(phaseBefore)
    expect(scoresOf(driver.state)).toEqual(scoresBefore)
    expect(driver.state.rounds).toEqual(roundsBefore)
  })

  it('lets the deadlines pass first : only the question live at that instant is skipped', () => {
    const driver = startFirstQuestion(setupFor(MINI_GAME_FLASH_BLIND_TEST))
    const events = driver.send({ type: 'skip', at: 4000 + 60_000 })
    const ended = events.filter((event) => event.type === 'question_ended')
    const round = driver.state.rounds[0]

    // La 1re question est arrivée à son terme normalement, la suivante est passée.
    expect(ended).toHaveLength(2)
    expect(ended[0]?.payload).not.toHaveProperty('skipped')
    expect(ended[1]?.payload).toMatchObject({ skipped: true })
    expect(round?.skippedQuestionIds).toEqual([round?.questions[1]?.id])
  })

  it('ignores a skip whose time is not finite', () => {
    const driver = startFirstQuestion(setupFor(MINI_GAME_FLASH_BLIND_TEST))

    expect(driver.send({ type: 'skip', at: Number.NaN })).toEqual([])
    expect(driver.state.phase.name).toBe('question')
  })

  it('does not mutate the state it receives', () => {
    const driver = startFirstQuestion(setupFor(MINI_GAME_FLASH_BLIND_TEST))
    const snapshot = structuredClone(driver.state)

    reduceGame(driver.state, { type: 'skip', at: 4500 })

    expect(driver.state).toEqual(snapshot)
  })
})

describe('skip : chaque mini-jeu', () => {
  it.each([...MINI_GAMES])('%s : 0 point, pas de pénalité, la partie enchaîne', (miniGame) => {
    const driver = startFirstQuestion(setupFor(miniGame))

    expect(driver.state.rounds[0]?.miniGame).toBe(miniGame)
    expect(driver.state.phase.name).toBe('question')

    // État interne en cours (appuis de deux pupitres) avant de passer la question.
    driver.send({ type: 'press', at: 4100, podium: 1, button: 0 })
    driver.send({ type: 'press', at: 4150, podium: 2, button: 1 })
    expect(driver.state.phase.name).toBe('question')

    const scoresBefore = scoresOf(driver.state)
    const answersBefore = driver.state.rounds[0]?.answers.length
    const events = driver.send({ type: 'skip', at: 4200 })
    const ended = events.filter((event) => event.type === 'question_ended')

    expect(ended).toHaveLength(1)
    expect(ended[0]?.payload).toMatchObject({ skipped: true, winnerIds: [] })
    expect(events.map((event) => event.type)).not.toContain('points_awarded')
    expect(scoresOf(driver.state)).toEqual(scoresBefore)
    expect(driver.state.rounds[0]?.answers).toHaveLength(answersBefore ?? -1)
    expect(driver.state.phase).toMatchObject({ name: 'reveal', questionIndex: 0 })

    // Suite normale : la question suivante démarre sans état résiduel.
    driver.send({ type: 'tick', at: (driver.state.phase as { deadline: number }).deadline })

    expect(driver.state.phase).toMatchObject({ name: 'question', questionIndex: 1 })
    expect(scoresOf(driver.state)).toEqual(scoresBefore)
  })
})

describe('skip : historique de la manche', () => {
  it('streak : une question passée ne brise pas la série', () => {
    const driver = startFirstQuestion(setupFor(MINI_GAME_STREAK))
    const answerAll = () => {
      for (const podium of [1, 2, 3, 4]) {
        driver.send({
          type: 'press',
          at: (driver.state.lastAt ?? 0) + 10,
          podium,
          button: correctButton(driver.state),
        })
      }
    }

    answerAll()
    expect(scoresOf(driver.state)).toEqual(Array(4).fill(STREAK_BASE_POINTS))
    driver.send({ type: 'tick', at: (driver.state.phase as { deadline: number }).deadline })

    driver.send({ type: 'skip', at: (driver.state.lastAt ?? 0) + 10 })
    driver.send({ type: 'tick', at: (driver.state.phase as { deadline: number }).deadline })
    expect(driver.state.phase).toMatchObject({ name: 'question', questionIndex: 2 })

    answerAll()

    // Série de 1 conservée : la 3e question vaut ×2.
    expect(scoresOf(driver.state)).toEqual(Array(4).fill(STREAK_BASE_POINTS * 3))
  })

  it("sudden_death : une question passée n'élimine personne, même en solo", () => {
    const solo = [PARTICIPANTS[0]!]
    const driver = startFirstQuestion(setupFor(MINI_GAME_SUDDEN_DEATH, { participants: solo }))

    driver.send({ type: 'press', at: 4100, podium: 1, button: correctButton(driver.state) })
    driver.send({ type: 'tick', at: (driver.state.phase as { deadline: number }).deadline })
    driver.send({ type: 'skip', at: (driver.state.lastAt ?? 0) + 10 })
    driver.send({ type: 'tick', at: (driver.state.phase as { deadline: number }).deadline })

    // Sans l'exclusion de la question passée, le survivant solo serait éliminé : fin de manche.
    expect(driver.state.phase).toMatchObject({ name: 'question', questionIndex: 2 })
    expect(driver.state.rounds[0]?.skippedQuestionIds).toHaveLength(1)
  })
})

describe('skip : rejouabilité', () => {
  it('replays the same game from the same commands, skip included', () => {
    const setup = setupFor(MINI_GAME_STREAK)
    const driver = startFirstQuestion(setup)

    driver.send({ type: 'press', at: 4100, podium: 1, button: correctButton(driver.state) })
    driver.send({ type: 'skip', at: 4200 })
    driver.send({ type: 'tick', at: 100_000_000 })

    const replay = replayGame(setup, driver.commands)

    expect(replay.events).toEqual(driver.events)
    expect(replay.state).toEqual(driver.state)
    expect(driver.state.phase.name).toBe('finished')
  })
})
