import {
  createGame,
  DEFAULT_GAME_TIMINGS,
  GameSetupError,
  type GameState,
  type GameStep,
  reduceGame,
  replayGame,
} from '@engine/engine'
import { getMiniGameQuestion } from '@engine/miniGames'
import type { ButtonIndex, GameCommand, GameEvent, GameSetup } from '@engine/types'
import {
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAMES,
  ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { audioTheme, baseSetup, PARTICIPANTS, textQuestion } from './_helpers/fixtures'

/** Pilote une partie et garde la trace des commandes et événements. */
function createDriver(setup: GameSetup) {
  let state = createGame(setup)
  const events: GameEvent[] = []
  const commands: GameCommand[] = []

  const send = (command: GameCommand): GameStep => {
    const step = reduceGame(state, command)
    state = step.state
    events.push(...step.events)
    commands.push(command)
    return step
  }

  return {
    send,
    events,
    commands,
    get state(): GameState {
      return state
    },
  }
}

type Driver = ReturnType<typeof createDriver>

function podiumOf(participantId: number | null): number {
  return PARTICIPANTS.find((participant) => participant.id === participantId)?.podium ?? 0
}

function getDeadline(state: GameState): number {
  const { phase } = state
  return 'deadline' in phase ? phase.deadline : Number.NaN
}

function correctButton(state: GameState): ButtonIndex {
  if (state.phase.name !== 'question') {
    throw new Error(`not in a question: ${state.phase.name}`)
  }

  return getMiniGameQuestion(state.phase.miniGameState).answers.findIndex(
    (answer) => answer.isCorrect
  ) as ButtonIndex
}

/** Joue une partie complète : le chooser choisit A, le pupitre `winnerOf(question)` trouve tout de suite. */
function playFullGame(driver: Driver, winnerOf: (questionIndex: number, round: number) => number) {
  let at = 0
  driver.send({ type: 'start', at })

  while (driver.state.phase.name !== 'finished') {
    const { phase } = driver.state

    if (phase.name === 'theme_choice') {
      at += 1000
      const round = driver.state.rounds.at(-1)
      driver.send({
        type: 'press',
        at,
        podium: podiumOf(round?.chooserParticipantId ?? null),
        button: 0,
      })
    } else if (phase.name === 'question') {
      const podium = winnerOf(phase.questionIndex, driver.state.rounds.length)
      at += 400
      driver.send({ type: 'press', at, podium, button: 0 })
      at += 600
      driver.send({ type: 'press', at, podium, button: correctButton(driver.state) })
    } else {
      at = getDeadline(driver.state)
      driver.send({ type: 'tick', at })
    }
  }

  return at
}

function firstOfferedThemes(seed: number): number[] | undefined {
  const driver = createDriver(baseSetup({ seed }))
  driver.send({ type: 'start', at: 0 })
  driver.send({ type: 'tick', at: 4000 })
  return driver.state.rounds[0]?.offeredThemeIds
}

describe('createGame', () => {
  it('starts in the lobby with zero scores, sorted by podium', () => {
    const state = createGame(baseSetup({ participants: [...PARTICIPANTS].reverse() }))

    expect(state.phase).toEqual({ name: 'lobby' })
    expect(state.scores.map((line) => line.participantId)).toEqual([1, 2, 3, 4])
    expect(state.scores.every((line) => line.score === 0)).toBe(true)
    expect(state.setup.timings).toEqual(DEFAULT_GAME_TIMINGS)
  })

  it('applies the default 10 x 10 format', () => {
    const state = createGame({ seed: 1, participants: PARTICIPANTS, themes: [] })

    expect(state.setup.roundsCount).toBe(10)
    expect(state.setup.questionsPerRound).toBe(10)
    expect(state.setup.miniGames).toEqual([...MINI_GAMES])
  })

  it('accepts up to 6 participants on pupitres 1 to 6, sorted by podium', () => {
    const six = [6, 3, 1, 5, 2, 4].map((podium) => ({
      id: podium * 10,
      podium,
      displayName: `Joueur ${podium}`,
    }))
    const state = createGame(baseSetup({ participants: six }))

    expect(state.scores.map((line) => line.participantId)).toEqual([10, 20, 30, 40, 50, 60])
    expect(createGame(baseSetup({ participants: six.slice(0, 5) })).scores).toHaveLength(5)
  })

  it.each([
    [{ participants: [] }, 'participants_count_invalid'],
    [
      {
        participants: [
          ...PARTICIPANTS,
          { id: 5, podium: 5, displayName: 'X' },
          { id: 6, podium: 6, displayName: 'Y' },
          { id: 7, podium: 4, displayName: 'Z' },
        ],
      },
      'participants_count_invalid',
    ],
    [
      { participants: [PARTICIPANTS[0]!, { ...PARTICIPANTS[1]!, podium: 1 }] },
      'participants_duplicated',
    ],
    [
      { participants: [PARTICIPANTS[0]!, { ...PARTICIPANTS[1]!, id: 1 }] },
      'participants_duplicated',
    ],
    [{ participants: [{ id: 1, podium: 7, displayName: 'X' }] }, 'participant_podium_invalid'],
    [{ roundsCount: 0 }, 'rounds_count_invalid'],
    [{ roundsCount: 21 }, 'rounds_count_invalid'],
    [{ questionsPerRound: 1.5 }, 'questions_per_round_invalid'],
    [{ seed: Number.NaN }, 'seed_invalid'],
    [{ seed: 5.9 }, 'seed_invalid'],
    [{ seed: -1 }, 'seed_invalid'],
    [{ seed: 2 ** 32 }, 'seed_invalid'],
    [{ timings: { themeChoiceMs: undefined } }, 'timings_invalid'],
    [{ timings: { revealMs: -1 } }, 'timings_invalid'],
    [{ timings: { unknownMs: 10 } as GameSetup['timings'] }, 'timings_invalid'],
    [{ miniGames: [] }, 'mini_games_invalid'],
    [{ miniGames: ['unknown' as typeof MINI_GAME_FLASH_BLIND_TEST] }, 'mini_games_invalid'],
  ])('rejects an invalid setup (%o)', (overrides, code) => {
    expect(() => createGame(baseSetup(overrides))).toThrow(new GameSetupError(code))
  })
})

describe('reduceGame — round flow', () => {
  it('announces the mini game, then lets the designated player choose among 4 themes', () => {
    const driver = createDriver(baseSetup())
    const start = driver.send({ type: 'start', at: 0 })

    expect(start.events.map((event) => event.type)).toEqual(['game_started', 'round_started'])
    expect(start.events[1]?.payload).toEqual({ position: 1, miniGame: MINI_GAME_FLASH_BLIND_TEST })
    expect(driver.state.phase).toEqual({
      name: 'round_intro',
      deadline: DEFAULT_GAME_TIMINGS.roundIntroMs,
    })

    const choice = driver.send({ type: 'tick', at: DEFAULT_GAME_TIMINGS.roundIntroMs })
    const round = driver.state.rounds[0]!

    expect(choice.events.map((event) => event.type)).toEqual([
      'round_themes_offered',
      'round_chooser_selected',
    ])
    expect(driver.state.phase.name).toBe('theme_choice')
    expect(round.offeredThemeIds).toHaveLength(4)
    expect(new Set(round.offeredThemeIds).size).toBe(4)
    expect(round.chooserReason).toBe(ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM)
  })

  it('ignores theme presses from other players and accepts the chooser one', () => {
    const driver = createDriver(baseSetup())
    driver.send({ type: 'start', at: 0 })
    driver.send({ type: 'tick', at: 4000 })

    const round = driver.state.rounds[0]!
    const otherPodium = PARTICIPANTS.find(
      (participant) => participant.id !== round.chooserParticipantId
    )!.podium

    expect(driver.send({ type: 'press', at: 4100, podium: otherPodium, button: 1 }).events).toEqual(
      []
    )

    const chosen = driver.send({
      type: 'press',
      at: 4200,
      podium: podiumOf(round.chooserParticipantId),
      button: 1,
    })
    const updatedRound = driver.state.rounds[0]!

    expect(updatedRound.themeId).toBe(round.offeredThemeIds[1])
    expect(updatedRound.questions).toHaveLength(3)
    expect(chosen.events.map((event) => event.type)).toEqual([
      'round_theme_selected',
      'question_started',
      'blind_test_stage_started',
    ])
    expect(chosen.events[0]?.payload).toMatchObject({ automatic: false })
  })

  it('picks a theme automatically when the chooser does not answer in time', () => {
    const driver = createDriver(baseSetup())
    driver.send({ type: 'start', at: 0 })
    driver.send({ type: 'tick', at: 4000 })
    const timeout = 4000 + DEFAULT_GAME_TIMINGS.themeChoiceMs

    const step = driver.send({ type: 'tick', at: timeout })
    const round = driver.state.rounds[0]!

    expect(step.events[0]).toMatchObject({
      type: 'round_theme_selected',
      at: timeout,
      payload: { automatic: true },
    })
    expect(round.offeredThemeIds).toContain(round.themeId)
  })

  it('ignores presses in the lobby and on unknown podiums or buttons', () => {
    const driver = createDriver(baseSetup())

    expect(driver.send({ type: 'press', at: 0, podium: 1, button: 0 }).events).toEqual([])
    expect(driver.send({ type: 'tick', at: 100_000 }).events).toEqual([])
    expect(driver.state.phase.name).toBe('lobby')

    driver.send({ type: 'start', at: 0 })
    driver.send({ type: 'tick', at: 4000 })

    expect(driver.send({ type: 'press', at: 4100, podium: 9, button: 0 }).events).toEqual([])
    expect(
      driver.send({ type: 'press', at: 4100, podium: 1, button: 7 as ButtonIndex }).events
    ).toEqual([])
  })

  it('scores the round, then shows the summary before the next round', () => {
    const driver = createDriver(baseSetup({ roundsCount: 2, questionsPerRound: 1 }))
    driver.send({ type: 'start', at: 0 })
    driver.send({ type: 'tick', at: 4000 })
    const round = driver.state.rounds[0]!
    driver.send({
      type: 'press',
      at: 4100,
      podium: podiumOf(round.chooserParticipantId),
      button: 0,
    })
    driver.send({ type: 'press', at: 4500, podium: 2, button: 0 })

    const answer = driver.send({
      type: 'press',
      at: 5000,
      podium: 2,
      button: correctButton(driver.state),
    })

    expect(answer.events.map((event) => event.type)).toEqual([
      'answer_correct',
      'points_awarded',
      'question_ended',
    ])
    expect(driver.state.scores.find((line) => line.participantId === 2)?.score).toBe(100)
    expect(driver.state.phase).toEqual({ name: 'reveal', questionIndex: 0, deadline: 10_000 })

    const summary = driver.send({ type: 'tick', at: 10_000 })
    expect(summary.events.map((event) => event.type)).toEqual(['round_ended'])

    const next = driver.send({ type: 'tick', at: 10_000 + DEFAULT_GAME_TIMINGS.roundSummaryMs })
    expect(next.events.map((event) => event.type)).toEqual(['round_started'])
    // Le leader (pupitre 2) ne peut pas choisir la manche 2.
    expect(driver.state.rounds[1]?.chooserParticipantId).not.toBe(2)
  })
})

describe('reduceGame — full game', () => {
  it('plays 10 rounds of 10 questions without repeating themes or questions', () => {
    const themes = Array.from({ length: 12 }, (_item, index) => audioTheme(index + 1, 10))
    const driver = createDriver({ seed: 2026, participants: PARTICIPANTS, themes })

    playFullGame(driver, (questionIndex) => (questionIndex % 4) + 1)

    const { rounds, scores, phase } = driver.state
    const questionIds = rounds.flatMap((round) => round.questions.map((question) => question.id))

    expect(phase).toEqual({ name: 'finished', reason: 'completed' })
    expect(rounds).toHaveLength(10)
    expect(rounds.every((round) => round.questions.length === 10)).toBe(true)
    expect(new Set(rounds.map((round) => round.themeId)).size).toBe(10)
    expect(new Set(questionIds).size).toBe(100)
    expect(scores.reduce((total, line) => total + line.score, 0)).toBe(100 * 100)
    expect(rounds.flatMap((round) => round.answers)).toHaveLength(100)
    expect(driver.events.at(-1)?.type).toBe('game_ended')
  })

  it('numbers events with a gapless sequence', () => {
    const driver = createDriver(baseSetup())
    playFullGame(driver, () => 1)

    expect(driver.events.map((event) => event.seq)).toEqual(
      driver.events.map((_item, index) => index)
    )
  })

  it('never lets a leader choose after the first round', () => {
    const driver = createDriver(baseSetup({ roundsCount: 6, questionsPerRound: 2 }))
    const leadersBefore: number[][] = []
    let at = 0
    driver.send({ type: 'start', at })

    while (driver.state.phase.name !== 'finished') {
      const { phase } = driver.state

      if (phase.name === 'theme_choice') {
        const round = driver.state.rounds.at(-1)!
        if (round.position > 1) {
          const best = Math.max(...driver.state.scores.map((line) => line.score))
          leadersBefore.push(
            driver.state.scores
              .filter((line) => line.score === best)
              .map((line) => line.participantId)
          )
          expect(leadersBefore.at(-1)).not.toContain(round.chooserParticipantId)
        }
        at += 100
        driver.send({ type: 'press', at, podium: podiumOf(round.chooserParticipantId), button: 0 })
      } else if (phase.name === 'question') {
        at += 100
        driver.send({ type: 'press', at, podium: 1, button: 0 })
        at += 100
        driver.send({ type: 'press', at, podium: 1, button: correctButton(driver.state) })
      } else {
        at = getDeadline(driver.state)
        driver.send({ type: 'tick', at })
      }
    }

    expect(leadersBefore).toHaveLength(5)
  })

  it('lets a whole game run out on a single far tick when nobody plays', () => {
    const driver = createDriver(baseSetup({ roundsCount: 2, questionsPerRound: 2 }))
    driver.send({ type: 'start', at: 0 })
    driver.send({ type: 'tick', at: 10_000_000 })

    expect(driver.state.phase).toEqual({ name: 'finished', reason: 'completed' })
    expect(driver.state.scores.every((line) => line.score === 0)).toBe(true)
    expect(driver.state.rounds.every((round) => round.answers.length === 0)).toBe(true)
  })

  it('ends with "no_content" when no theme has a playable question', () => {
    const driver = createDriver(
      baseSetup({
        themes: [{ id: 1, name: 'Vide', questions: [{ ...textQuestion(1), answers: [] }] }],
      })
    )
    const step = driver.send({ type: 'start', at: 0 })

    expect(driver.state.phase).toEqual({ name: 'finished', reason: 'no_content' })
    expect(step.events.at(-1)).toMatchObject({
      type: 'game_ended',
      payload: { reason: 'no_content' },
    })
  })

  it('reoffers already played themes when there are fewer themes than rounds', () => {
    const driver = createDriver(
      baseSetup({ themes: [audioTheme(1, 2)], roundsCount: 3, questionsPerRound: 2 })
    )
    playFullGame(driver, () => 1)

    expect(driver.state.rounds.map((round) => round.themeId)).toEqual([1, 1, 1])
    expect(driver.state.rounds.every((round) => round.questions.length === 2)).toBe(true)
  })

  it('aborts and then ignores further commands', () => {
    const driver = createDriver(baseSetup())
    driver.send({ type: 'start', at: 0 })
    const abort = driver.send({ type: 'abort', at: 50, reason: 'operator' })

    expect(abort.events).toEqual([
      expect.objectContaining({ type: 'game_aborted', payload: { reason: 'operator' } }),
    ])
    expect(driver.send({ type: 'tick', at: 1_000_000 }).events).toEqual([])
    expect(driver.send({ type: 'start', at: 1 }).events).toEqual([])
  })
})

describe('reduceGame — purity and determinism', () => {
  it('does not mutate the state it receives', () => {
    const state = createGame(baseSetup())
    const snapshot = structuredClone(state)

    reduceGame(state, { type: 'start', at: 0 })

    expect(state).toEqual(snapshot)
  })

  it('replays the exact same game from the same seed and commands', () => {
    const driver = createDriver(baseSetup())
    playFullGame(driver, (questionIndex, round) => ((questionIndex + round) % 4) + 1)

    const replay = replayGame(baseSetup(), driver.commands)

    expect(replay.events).toEqual(driver.events)
    expect(replay.state).toEqual(driver.state)
  })

  it('draws differently with another seed', () => {
    const results = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(firstOfferedThemes(seed)))
    )

    expect(results.size).toBeGreaterThan(1)
  })
})

/** Démarre une partie et amène la 1re question (palier 1 lancé à 4000). */
function startFirstQuestion(setup: GameSetup = baseSetup()): Driver {
  const driver = createDriver(setup)
  driver.send({ type: 'start', at: 0 })
  driver.send({ type: 'tick', at: 4000 })
  const round = driver.state.rounds[0]
  driver.send({
    type: 'press',
    at: 4000,
    podium: podiumOf(round?.chooserParticipantId ?? null),
    button: 0,
  })
  return driver
}

describe('reduceGame — host clock robustness', () => {
  it('ignores commands whose time is not finite', () => {
    const driver = startFirstQuestion()
    const before = driver.state

    expect(driver.send({ type: 'press', at: Number.NaN, podium: 1, button: 0 }).events).toEqual([])
    expect(driver.send({ type: 'tick', at: Number.POSITIVE_INFINITY }).events).toEqual([])
    expect(driver.state).toEqual(before)
  })

  it('ignores a late tick and clamps a late press to the last known time', () => {
    const driver = startFirstQuestion()
    driver.send({ type: 'tick', at: 4300 })

    expect(driver.send({ type: 'tick', at: 4100 }).events).toEqual([])

    driver.send({ type: 'press', at: 4200, podium: 1, button: 0 })
    driver.send({ type: 'press', at: 4250, podium: 1, button: correctButton(driver.state) })

    const answer = driver.state.rounds[0]?.answers[0]
    expect(answer?.responseTimeMs).toBe(300)
    expect(driver.state.lastAt).toBe(4300)
  })

  it('stores whole milliseconds when the host clock is fractional', () => {
    const driver = startFirstQuestion()
    driver.send({ type: 'press', at: 4300.489, podium: 1, button: 0 })
    driver.send({ type: 'press', at: 4400.1, podium: 1, button: correctButton(driver.state) })

    expect(driver.state.rounds[0]?.answers[0]?.responseTimeMs).toBe(300)
  })
})

describe('reduceGame — content snapshots', () => {
  it('shuffles answers with the seed, keeping every answer', () => {
    const orders = new Set<string>()

    for (let seed = 0; seed < 20; seed += 1) {
      const driver = startFirstQuestion(baseSetup({ seed }))
      const question = driver.state.rounds[0]?.questions[0]
      const ids = question?.answers.map((answer) => answer.id) ?? []

      expect(ids.toSorted()).toEqual(
        ids.toSorted().map((_id, index) => (question?.id ?? 0) * 10 + index)
      )
      orders.add(JSON.stringify(ids))
    }

    expect(orders.size).toBeGreaterThan(1)
  })

  it('keeps its own copy of the themes and of the scores it emits', () => {
    const setup = baseSetup()
    const state = createGame(setup)
    setup.themes[0]!.name = 'Modifié'

    expect(state.setup.themes[0]?.name).not.toBe('Modifié')

    const driver = createDriver(baseSetup({ roundsCount: 1, questionsPerRound: 1 }))
    playFullGame(driver, () => 1)
    const ended = driver.events.find((event) => event.type === 'game_ended')

    expect(ended?.payload.scores).toEqual(driver.state.scores)
    expect(ended?.payload.scores).not.toBe(driver.state.scores)
  })
})
