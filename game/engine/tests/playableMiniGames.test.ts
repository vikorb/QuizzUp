import { createGame, getPlayableMiniGames, reduceGame } from '@engine/engine'
import {
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  MINI_GAMES,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { audioTheme, baseSetup, PARTICIPANTS, textQuestion, themeOf } from './_helpers/fixtures'

const SOLO = [PARTICIPANTS[0]!]
const DUO = PARTICIPANTS.slice(0, 2)
const TEXT_THEMES = [1, 2].map((id) => themeOf(id, (questionId) => textQuestion(questionId)))
// Audio + texte : de quoi jouer le blind test comme les mini-jeux sans média.
const MIXED_THEMES = [audioTheme(9), ...TEXT_THEMES]

describe('getPlayableMiniGames', () => {
  it('keeps the chosen mini-games, in their order, when everything is playable', () => {
    const setup = baseSetup({
      participants: DUO,
      themes: MIXED_THEMES,
      miniGames: [MINI_GAME_POINT_STEAL, MINI_GAME_FLASH_BLIND_TEST],
    })

    expect(getPlayableMiniGames(setup)).toEqual([MINI_GAME_POINT_STEAL, MINI_GAME_FLASH_BLIND_TEST])
  })

  it('considers every mini-game when none is chosen', () => {
    const playable = getPlayableMiniGames(baseSetup({ participants: DUO, themes: MIXED_THEMES }))

    expect(playable).toContain(MINI_GAME_FLASH_BLIND_TEST)
    expect(playable).toContain(MINI_GAME_POINT_STEAL)
    expect(playable.every((miniGame) => MINI_GAMES.includes(miniGame))).toBe(true)
  })

  it('drops point steal with a single participant', () => {
    const setup = baseSetup({
      participants: SOLO,
      themes: MIXED_THEMES,
      miniGames: [MINI_GAME_POINT_STEAL, MINI_GAME_FIRST_BUZZ],
    })

    expect(getPlayableMiniGames(setup)).not.toContain(MINI_GAME_POINT_STEAL)
    expect(getPlayableMiniGames(setup)).toContain(MINI_GAME_FIRST_BUZZ)
    expect(getPlayableMiniGames({ ...setup, participants: DUO })).toContain(MINI_GAME_POINT_STEAL)
  })

  it('is empty when the only chosen mini-game needs more participants', () => {
    expect(
      getPlayableMiniGames(baseSetup({ participants: SOLO, miniGames: [MINI_GAME_POINT_STEAL] }))
    ).toEqual([])
  })

  it('drops the blind test when no theme has an eligible audio question', () => {
    const setup = baseSetup({ themes: TEXT_THEMES, miniGames: [MINI_GAME_FLASH_BLIND_TEST] })

    expect(getPlayableMiniGames(setup)).toEqual([])
    expect(getPlayableMiniGames({ ...setup, themes: [audioTheme(9)] })).toEqual([
      MINI_GAME_FLASH_BLIND_TEST,
    ])
  })

  it('is empty without any theme', () => {
    expect(getPlayableMiniGames(baseSetup({ themes: [] }))).toEqual([])
  })

  it('does not modify its input', () => {
    const setup = baseSetup({ participants: SOLO, miniGames: [MINI_GAME_POINT_STEAL] })
    const copy = structuredClone(setup)

    getPlayableMiniGames(setup)

    expect(setup).toEqual(copy)
  })

  it.each([
    [
      'unplayable',
      baseSetup({ participants: SOLO, themes: MIXED_THEMES, miniGames: [MINI_GAME_POINT_STEAL] }),
    ],
    [
      'playable',
      baseSetup({ participants: DUO, themes: MIXED_THEMES, miniGames: [MINI_GAME_POINT_STEAL] }),
    ],
    [
      'text-only blind test',
      baseSetup({ themes: TEXT_THEMES, miniGames: [MINI_GAME_FLASH_BLIND_TEST] }),
    ],
  ])('agrees with what the engine does at start (%s)', (_label, setup) => {
    const { state } = reduceGame(createGame(setup), { type: 'start', at: 0 })
    const endsWithoutContent =
      state.phase.name === 'finished' && state.phase.reason === 'no_content'

    expect(endsWithoutContent).toBe(getPlayableMiniGames(setup).length === 0)
  })
})
