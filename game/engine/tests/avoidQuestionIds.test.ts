import { createGame, type GameState, reduceGame, replayGame } from '@engine/engine'
import type { GameCommand, GameSetup } from '@engine/types'
import { describe, expect, it } from 'vitest'

import { baseSetup } from './_helpers/fixtures'

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

const drawnQuestionIds = (state: GameState) => state.rounds[0]?.questions.map(({ id }) => id) ?? []

describe('GameSetup.avoidQuestionIds', () => {
  it('starts without any question marked as played when nothing is to avoid', () => {
    expect(createGame(baseSetup()).usedQuestionIds).toEqual([])
    expect(createGame(baseSetup({ avoidQuestionIds: [] })).usedQuestionIds).toEqual([])
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

  it('completes with avoided questions only after the fresh ones of the theme', () => {
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

  it('is deterministic: same setup and commands give the same game, and a replay matches', () => {
    const setup = baseSetup({ avoidQuestionIds: [100, 101, 102, 103, 200, 201] })

    const first = playUntilFirstQuestion(setup)
    const second = playUntilFirstQuestion(setup)
    const replay = replayGame(setup, first.commands)

    expect(second.state).toEqual(first.state)
    expect(replay.state).toEqual(first.state)
  })

  it('stores the list as a serializable set without touching the setup it was given', () => {
    const avoidQuestionIds = [101, 100, 101]
    const state = createGame(baseSetup({ avoidQuestionIds }))

    expect(state.usedQuestionIds).toEqual([101, 100])
    expect(avoidQuestionIds).toEqual([101, 100, 101])
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})
