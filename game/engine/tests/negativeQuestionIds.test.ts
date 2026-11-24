import { createGame, type GameState, reduceGame, replayGame } from '@engine/engine'
import { getMiniGameQuestion } from '@engine/miniGames'
import type {
  ButtonIndex,
  EngineQuestion,
  EngineTheme,
  GameCommand,
  GameSetup,
} from '@engine/types'
import { MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { audioQuestion, baseSetup, PARTICIPANTS } from './_helpers/fixtures'

/**
 * Les questions tirées d'une playlist ont l'identifiant `-idDuTitre` (leurs réponses aussi).
 * Le moteur ne doit rien supposer du signe : tirage, questions déjà posées, scores, rejeu.
 */
function playlistQuestion(trackId: number): EngineQuestion {
  const question = audioQuestion(-trackId)
  return { ...question, text: 'Quel est ce titre ?' }
}

function playlistTheme(id: number, trackIds: number[]): EngineTheme {
  return {
    id,
    name: `Playlist ${id}`,
    questions: trackIds.map((trackId) => playlistQuestion(trackId)),
  }
}

/** Deux manches de 3 questions tirées d'un seul thème de 6 titres : chaque titre sort une fois. */
function playlistSetup(themes: EngineTheme[]): GameSetup {
  return baseSetup({ themes, miniGames: [MINI_GAME_FLASH_BLIND_TEST] })
}

function podiumOf(participantId: number | null): number {
  return PARTICIPANTS.find((participant) => participant.id === participantId)?.podium ?? 0
}

function correctButton(state: GameState): ButtonIndex {
  if (state.phase.name !== 'question') {
    throw new Error(`not in a question: ${state.phase.name}`)
  }

  return getMiniGameQuestion(state.phase.miniGameState).answers.findIndex(
    (answer) => answer.isCorrect
  ) as ButtonIndex
}

/** Joue la partie jusqu'au bout : le pupitre 1 buzze puis répond juste à chaque question. */
function playFullGame(setup: GameSetup) {
  let state = createGame(setup)
  const commands: GameCommand[] = []
  const send = (command: GameCommand) => {
    state = reduceGame(state, command).state
    commands.push(command)
  }
  let at = 0
  send({ type: 'start', at })

  while (state.phase.name !== 'finished') {
    const { phase } = state

    if (phase.name === 'theme_choice') {
      at += 1000
      const chooser = state.rounds.at(-1)?.chooserParticipantId ?? null
      send({ type: 'press', at, podium: podiumOf(chooser), button: 0 })
    } else if (phase.name === 'question') {
      at += 400
      send({ type: 'press', at, podium: 1, button: 0 })
      at += 600
      send({ type: 'press', at, podium: 1, button: correctButton(state) })
    } else {
      at = 'deadline' in phase ? phase.deadline : at + 1000
      send({ type: 'tick', at })
    }
  }

  return { state, commands }
}

describe('identifiants de question négatifs (titres de playlist)', () => {
  const setup = playlistSetup([playlistTheme(1, [1, 2, 3, 4, 5, 6])])

  it('tire chaque titre une seule fois et les note tous dans usedQuestionIds', () => {
    const { state } = playFullGame(setup)
    const asked = state.rounds.flatMap((round) => round.questions.map((question) => question.id))

    expect(state.rounds).toHaveLength(2)
    expect(asked).toHaveLength(6)
    expect(asked.every((id) => id < 0)).toBe(true)
    expect(new Set(asked).size).toBe(6)
    expect([...state.usedQuestionIds].sort((left, right) => left - right)).toEqual([
      -6, -5, -4, -3, -2, -1,
    ])
  })

  it('compte les points d’une bonne réponse, sans score négatif ni perdu', () => {
    const { state } = playFullGame(setup)
    const scores = new Map(state.scores.map((line) => [line.participantId, line.score]))

    // Pupitre 1 : 6 bonnes réponses au 1er palier (100 points chacune, cf. blind test éclair).
    expect(scores.get(1)).toBe(600)
    expect(
      state.scores.filter((line) => line.participantId !== 1).every((line) => line.score === 0)
    ).toBe(true)
    expect(state.rounds.flatMap((round) => round.answers).every((answer) => answer.isCorrect)).toBe(
      true
    )
  })

  it('rejoue la même partie à l’identique avec la même graine', () => {
    const first = playFullGame(setup)
    const replayed = replayGame(setup, first.commands)

    expect(replayed.state).toEqual(first.state)
  })

  it('n’en repose pas tant qu’il reste des titres jamais posés, même mêlés à des positifs', () => {
    const classic: EngineTheme = {
      id: 2,
      name: 'Classique',
      questions: [11, 12, 13].map((id) => audioQuestion(id)),
    }
    const { state } = playFullGame(playlistSetup([playlistTheme(1, [1, 2, 3]), classic]))
    const asked = state.rounds.flatMap((round) => round.questions.map((question) => question.id))

    expect(new Set(asked).size).toBe(asked.length)
    expect(asked.some((id) => id < 0)).toBe(true)
    expect(asked.some((id) => id > 0)).toBe(true)
  })
})
