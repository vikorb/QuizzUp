import { drawRoundQuestions } from '@engine/draws'
import { createGame, type GameState, reduceGame, replayGame } from '@engine/engine'
import { createRandom } from '@engine/random'
import type { GameCommand, GameSetup } from '@engine/types'
import { describe, expect, it } from 'vitest'

import { audioTheme, baseSetup } from './_helpers/fixtures'

/** Joue le début d'une partie : annonce, choix du 1er thème proposé, 1re manche tirée. */
function playUntilFirstQuestion(setup: GameSetup): { state: GameState; commands: GameCommand[] } {
  const commands: GameCommand[] = [
    { type: 'start', at: 0 },
    { type: 'tick', at: 4000 },
  ]
  let state = createGame(setup)

  for (const command of commands) {
    state = reduceGame(state, command).state
  }
  const chooser = state.rounds[0]?.chooserParticipantId
  const press: GameCommand = { type: 'press', at: 4000, podium: chooser as number, button: 0 }

  commands.push(press)

  return { state: reduceGame(state, press).state, commands }
}

/** Partie entière sans aucune réponse : les manches s'enchaînent sur un seul tick lointain. */
function playWholeGame(setup: GameSetup): { state: GameState; commands: GameCommand[] } {
  const commands: GameCommand[] = [
    { type: 'start', at: 0 },
    { type: 'tick', at: 10_000_000 },
  ]
  const { state } = replayGame(setup, commands)

  return { state, commands }
}

const drawnQuestionIds = (state: GameState, round = 0) =>
  state.rounds[round]?.questions.map(({ id }) => id) ?? []

describe('GameSetup.avoidQuestionIds', () => {
  it('has nothing to avoid by default', () => {
    expect(createGame(baseSetup()).setup.avoidQuestionIds).toEqual([])
    expect(createGame(baseSetup({ avoidQuestionIds: [] })).setup.avoidQuestionIds).toEqual([])
  })

  it('does not count the avoided questions as asked in the game', () => {
    expect(createGame(baseSetup({ avoidQuestionIds: [100, 101] })).usedQuestionIds).toEqual([])
  })

  it('keeps the avoided questions out of the draw while others remain in the theme', () => {
    const reference = playUntilFirstQuestion(baseSetup()).state
    const seen = drawnQuestionIds(reference)

    const { state } = playUntilFirstQuestion(baseSetup({ avoidQuestionIds: seen }))

    // Même graine : même thème proposé et choisi, mais d'autres questions.
    expect(state.rounds[0]?.themeId).toBe(reference.rounds[0]?.themeId)
    expect(drawnQuestionIds(state)).toHaveLength(3)
    expect(drawnQuestionIds(state).some((id) => seen.includes(id))).toBe(false)
  })

  it('still draws from a theme whose questions were all seen, never emptying it', () => {
    const reference = playUntilFirstQuestion(baseSetup()).state
    const theme = baseSetup().themes.find(({ id }) => id === reference.rounds[0]?.themeId)
    const everyQuestion = theme?.questions.map(({ id }) => id) ?? []

    const { state } = playUntilFirstQuestion(baseSetup({ avoidQuestionIds: everyQuestion }))

    expect(drawnQuestionIds(state)).toHaveLength(3)
    expect(drawnQuestionIds(state).every((id) => everyQuestion.includes(id))).toBe(true)
  })

  it('completes with seen questions only after the fresh ones of the theme', () => {
    const reference = playUntilFirstQuestion(baseSetup()).state
    const theme = baseSetup().themes.find(({ id }) => id === reference.rounds[0]?.themeId)
    const everyQuestion = theme?.questions.map(({ id }) => id) ?? []
    // Deux questions neuves seulement : la manche de 3 en prend 2, puis 1 déjà vue.
    const fresh = everyQuestion.slice(0, 2)
    const avoid = everyQuestion.slice(2)

    const { state } = playUntilFirstQuestion(baseSetup({ avoidQuestionIds: avoid }))
    const drawn = drawnQuestionIds(state)

    expect(drawn).toHaveLength(3)
    expect(fresh.every((id) => drawn.includes(id))).toBe(true)
    expect(drawn.filter((id) => avoid.includes(id))).toHaveLength(1)
  })

  describe('a theme too small for two rounds', () => {
    // 10 questions (ids 100 à 109), 5 par manche, 8 déjà vues la semaine dernière (102 à 109) :
    // la manche 1 prend les 2 neuves et 3 vues, la manche 2 doit prendre les 5 vues restantes.
    const setup = baseSetup({
      themes: [audioTheme(1, 10)],
      roundsCount: 2,
      questionsPerRound: 5,
      avoidQuestionIds: [102, 103, 104, 105, 106, 107, 108, 109],
    })

    it('draws the seen questions not yet asked before repeating one asked in this game', () => {
      const { state } = playWholeGame(setup)
      const first = drawnQuestionIds(state, 0)
      const second = drawnQuestionIds(state, 1)

      expect(first).toHaveLength(5)
      expect(second).toHaveLength(5)
      expect(first).toEqual(expect.arrayContaining([100, 101]))
      expect(first.some((id) => second.includes(id))).toBe(false)
    })

    it('repeats a question asked in this game only once every other one has been asked', () => {
      const { state } = playWholeGame({ ...setup, roundsCount: 3 })
      const [first, second, third] = [0, 1, 2].map((round) => drawnQuestionIds(state, round))

      // 10 questions pour 15 places : la 3e manche reprend 5 questions déjà posées.
      expect(new Set([...(first ?? []), ...(second ?? [])]).size).toBe(10)
      expect(third).toHaveLength(5)
    })

    it('is deterministic, and a replay of the saved setup and commands gives the same game', () => {
      const first = playWholeGame(setup)
      const second = playWholeGame(setup)
      const saved = JSON.parse(JSON.stringify({ setup, commands: first.commands })) as {
        setup: GameSetup
        commands: GameCommand[]
      }

      expect(second.state).toEqual(first.state)
      expect(replayGame(saved.setup, saved.commands).state).toEqual(first.state)
    })
  })

  it('draws like before the list existed when there is nothing to avoid', () => {
    // Valeurs relevées sur le tirage d'avant le lot (même graine, mêmes données).
    const questions = audioTheme(1, 10).questions

    expect(
      [1, 2, 3].map((seed) =>
        drawRoundQuestions(questions, [100, 101, 102], 6, createRandom(seed)).map(({ id }) => id)
      )
    ).toEqual([
      [107, 104, 103, 109, 106, 108],
      [108, 105, 106, 103, 109, 107],
      [108, 104, 107, 106, 109, 103],
    ])

    const none = playUntilFirstQuestion(baseSetup({ roundsCount: 3, questionsPerRound: 4 })).state
    const empty = playUntilFirstQuestion(
      baseSetup({ roundsCount: 3, questionsPerRound: 4, avoidQuestionIds: [] })
    ).state

    expect(drawnQuestionIds(none)).toEqual([602, 606, 608, 601])
    expect(drawnQuestionIds(empty)).toEqual([602, 606, 608, 601])
  })

  it('stores the list without duplicates in the setup, without touching the one it was given', () => {
    const avoidQuestionIds = [101, 100, 101]
    const state = createGame(baseSetup({ avoidQuestionIds }))

    expect(state.setup.avoidQuestionIds).toEqual([101, 100])
    expect(avoidQuestionIds).toEqual([101, 100, 101])
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})
