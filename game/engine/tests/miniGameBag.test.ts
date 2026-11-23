import {
  createGame,
  type GameState,
  getPlayableMiniGames,
  reduceGame,
  replayGame,
} from '@engine/engine'
import type { GameCommand, GameSetup } from '@engine/types'
import {
  MINI_GAME_ESTIMATE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_TRUE_FALSE,
  MINI_GAMES,
  type MiniGame,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioTheme,
  estimateQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  themeOf,
  trueFalseQuestion,
} from './_helpers/fixtures'

/** Contenu qui rend les dix mini-jeux jouables : QCM, vrai/faux, estimation, image, audio. */
function setupOf(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    seed: 7,
    participants: PARTICIPANTS,
    themes: [
      themeOf(1, (id, index) => qcmQuestion(id, index % 4)),
      themeOf(2, (id, index) => trueFalseQuestion(id, index % 2 === 0)),
      themeOf(3, (id) => estimateQuestion(id)),
      themeOf(4, (id, index) => imageQuestion(id, (index + 1) % 4)),
      audioTheme(5),
    ],
    roundsCount: 20,
    questionsPerRound: 2,
    ...overrides,
  }
}

/** Fait avancer le temps, sans aucune réponse, jusqu'à ce que `until` soit vrai. */
function advance(
  initial: GameState,
  commands: GameCommand[],
  until: (state: GameState) => boolean,
  startAt: number
): { state: GameState; at: number } {
  let state = initial
  let at = startAt

  for (let guard = 0; guard < 100_000 && !until(state); guard += 1) {
    const { phase } = state
    at = 'deadline' in phase ? Math.max(at + 1, phase.deadline) : at + 5000
    const command: GameCommand = { type: 'tick', at }
    commands.push(command)
    state = reduceGame(state, command).state
  }

  return { state, at }
}

function playToEnd(setup: GameSetup): { state: GameState; commands: GameCommand[] } {
  const commands: GameCommand[] = [{ type: 'start', at: 0 }]
  const started = reduceGame(createGame(setup), commands[0] as GameCommand).state
  const { state } = advance(started, commands, (current) => current.phase.name === 'finished', 0)

  return { state, commands }
}

function miniGamesOf(state: GameState): MiniGame[] {
  return state.rounds.map((round) => round.miniGame)
}

/** Chaque tranche de `size` manches alignée sur le sac contient chaque mini-jeu une fois. */
function expectBagWindows(miniGames: MiniGame[], size: number) {
  for (let from = 0; from + size <= miniGames.length; from += size) {
    const window = miniGames.slice(from, from + size)

    expect([...window].sort()).toEqual([...new Set(window)].sort())
    expect(new Set(window).size).toBe(size)
  }
}

describe('mini game bag (draw without replacement)', () => {
  it('plays every playable mini-game once before any comes back (all ten)', () => {
    const setup = setupOf()
    const size = getPlayableMiniGames(setup).length
    const { state } = playToEnd(setup)

    expect(size).toBe(MINI_GAMES.length)
    expect(state.phase).toEqual({ name: 'finished', reason: 'completed' })
    expect(miniGamesOf(state)).toHaveLength(20)
    expectBagWindows(miniGamesOf(state), size)
  })

  it.each([3, 4, 7])('keeps the bag windows with %i mini-games over many bags', (size) => {
    for (const seed of [1, 7, 42, 1234]) {
      const miniGames = MINI_GAMES.slice(0, size)
      const { state } = playToEnd(setupOf({ seed, miniGames, roundsCount: 20 }))
      const drawn = miniGamesOf(state)

      expect(drawn).toHaveLength(20)
      expectBagWindows(drawn, size)
    }
  })

  it('never repeats a mini-game at the junction of two bags', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const miniGames = [MINI_GAME_QUICK_ANSWER, MINI_GAME_TRUE_FALSE, MINI_GAME_ESTIMATE]
      const drawn = miniGamesOf(playToEnd(setupOf({ seed, miniGames })).state)

      for (const [index, miniGame] of drawn.entries()) {
        expect(miniGame).not.toBe(drawn[index - 1])
      }
    }
  })

  it('avoids the junction repeat with only two mini-games (strict alternation)', () => {
    const drawn = miniGamesOf(
      playToEnd(setupOf({ miniGames: [MINI_GAME_QUICK_ANSWER, MINI_GAME_TRUE_FALSE] })).state
    )

    expect(drawn.slice(0, 2)).not.toEqual([drawn[0], drawn[0]])
    for (const [index, miniGame] of drawn.entries()) {
      expect(miniGame).not.toBe(drawn[index - 1])
    }
  })

  it('repeats the only admissible mini-game every round', () => {
    const single = miniGamesOf(
      playToEnd(setupOf({ miniGames: [MINI_GAME_ESTIMATE], roundsCount: 4 })).state
    )
    expect(single).toEqual(Array.from({ length: 4 }, () => MINI_GAME_ESTIMATE))

    // Point steal exige deux joueurs : seul le premier buzz reste admissible.
    const solo = playToEnd(
      setupOf({
        participants: [PARTICIPANTS[0]!],
        miniGames: [MINI_GAME_POINT_STEAL, MINI_GAME_FIRST_BUZZ],
        roundsCount: 4,
      })
    ).state

    expect(miniGamesOf(solo)).toEqual(Array.from({ length: 4 }, () => MINI_GAME_FIRST_BUZZ))
    expect(solo.miniGameBag).toEqual([])
  })

  it('drops a mini-game that becomes inadmissible mid-game, without repeating the others', () => {
    const size = 4
    const miniGames = MINI_GAMES.slice(0, size)
    const commands: GameCommand[] = [{ type: 'start', at: 0 }]
    const started = reduceGame(createGame(setupOf({ miniGames, roundsCount: 20 })), commands[0]!)
    const [removed] = started.state.miniGameBag as [MiniGame]

    // Le sac vient de perdre le premier mini-jeu ; on en retire un autre du sac, comme si
    // son contenu ou ses pupitres venaient à manquer.
    expect(started.state.miniGameBag).toHaveLength(size - 1)
    expect(miniGamesOf(started.state)).not.toContain(removed)

    const mutated: GameState = structuredClone(started.state)
    mutated.setup.miniGames = mutated.setup.miniGames!.filter((miniGame) => miniGame !== removed)

    const rest = advance(mutated, commands, (state) => state.phase.name === 'finished', 0).state
    const drawn = miniGamesOf(rest)

    expect(drawn).toHaveLength(20)
    expect(drawn.slice(1)).not.toContain(removed)
    // Le sac restant (size - 2 mini-jeux) est joué sans doublon avant le remplissage suivant.
    expect(new Set(drawn.slice(0, size - 1)).size).toBe(size - 1)
    expectBagWindows(drawn.slice(size - 1), size - 1)
  })

  it('is deterministic by seed and differs between seeds', () => {
    const first = playToEnd(setupOf({ seed: 99 }))
    const second = playToEnd(setupOf({ seed: 99 }))
    const replay = replayGame(setupOf({ seed: 99 }), first.commands)

    expect(miniGamesOf(second.state)).toEqual(miniGamesOf(first.state))
    expect(second.state).toEqual(first.state)
    expect(replay.state).toEqual(first.state)

    const sequences = new Set(
      [1, 2, 3, 4].map((seed) => miniGamesOf(playToEnd(setupOf({ seed })).state).join())
    )
    expect(sequences.size).toBeGreaterThan(1)
  })

  it('keeps the bag in the serializable state: a JSON copy continues identically', () => {
    const commands: GameCommand[] = [{ type: 'start', at: 0 }]
    const started = reduceGame(createGame(setupOf()), commands[0]!).state
    const midway = advance(started, commands, (state) => state.rounds.length === 4, 0)
    const copy = JSON.parse(JSON.stringify(midway.state)) as GameState

    expect(copy.miniGameBag).toEqual(midway.state.miniGameBag)
    expect(copy.miniGameBag).toHaveLength(MINI_GAMES.length - 4)

    const finish = (state: GameState) =>
      advance(state, [], (current) => current.phase.name === 'finished', midway.at).state

    expect(miniGamesOf(finish(copy))).toEqual(miniGamesOf(finish(midway.state)))
  })
})
