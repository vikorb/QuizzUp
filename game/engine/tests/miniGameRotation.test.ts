import { createGame, type GameState, type GameStep, reduceGame, replayGame } from '@engine/engine'
import { getMiniGameDefinition, getMiniGameQuestion } from '@engine/miniGames'
import { parseLeadingNumber } from '@engine/miniGames/questionRules'
import { TRUE_FALSE_REVEAL_MS } from '@engine/miniGames/trueFalse'
import type {
  ButtonIndex,
  EngineParticipant,
  GameCommand,
  GameEvent,
  GameSetup,
  RoundRecord,
} from '@engine/types'
import {
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_ESTIMATE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_SUDDEN_DEATH,
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

/** Thèmes mixtes : QCM, vrai/faux, estimation, image, audio, et un thème mélangé. */
function mixedThemes() {
  return [
    themeOf(1, (id, index) => qcmQuestion(id, index % 4)),
    themeOf(2, (id, index) => trueFalseQuestion(id, index % 2 === 0)),
    themeOf(3, (id) => estimateQuestion(id)),
    themeOf(4, (id, index) => imageQuestion(id, (index + 1) % 4)),
    audioTheme(5),
    themeOf(
      6,
      (id, index) => {
        const builders = [
          () => qcmQuestion(id, 2),
          () => trueFalseQuestion(id, false),
          () => estimateQuestion(id),
          () => imageQuestion(id, 3),
          () => audioTheme(0, 1).questions[0]!,
        ]
        const question = builders[index % builders.length]!()
        return { ...question, id }
      },
      15
    ),
  ]
}

function mixedSetup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    seed: 7,
    participants: PARTICIPANTS,
    themes: mixedThemes(),
    roundsCount: 20,
    questionsPerRound: 3,
    ...overrides,
  }
}

type Outcome = 'correct' | 'wrong'
type Strategy = (participantId: number, round: number, questionIndex: number) => Outcome

/** Pilote une partie ; peut vérifier que `reduceGame` ne modifie jamais l'état reçu. */
function createDriver(setup: GameSetup, checkImmutability = false) {
  let state = createGame(setup)
  const events: GameEvent[] = []
  const commands: GameCommand[] = []

  const send = (command: GameCommand): GameStep => {
    const before = checkImmutability ? JSON.stringify(state) : ''
    const step = reduceGame(state, command)

    if (checkImmutability) {
      expect(JSON.stringify(state)).toBe(before)
    }

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

function getDeadline(state: GameState): number {
  const { phase } = state
  return 'deadline' in phase ? phase.deadline : Number.NaN
}

function questionKey(state: GameState): string | null {
  return state.phase.name === 'question'
    ? `${state.rounds.length}:${state.phase.questionIndex}`
    : null
}

/** Bouton qu'un joueur appuie selon l'état du mini-jeu et l'issue voulue. */
function buttonFor(state: GameState, outcome: Outcome): ButtonIndex {
  if (state.phase.name !== 'question') {
    throw new Error(`not in a question: ${state.phase.name}`)
  }

  const miniGameState = state.phase.miniGameState

  if (miniGameState.kind === MINI_GAME_DOUBLE_OR_NOTHING && miniGameState.status === 'betting') {
    // Tapis pour tout le monde : les pertes doivent rester bornées au score.
    return 3
  }

  const answers = getMiniGameQuestion(miniGameState).answers
  const correctIndex = answers.findIndex((answer) => answer.isCorrect)

  if (outcome === 'correct') {
    return correctIndex as ButtonIndex
  }

  // Estimation : la fourchette la plus éloignée, pour ne pas toucher les points « voisins ».
  return (
    miniGameState.kind === MINI_GAME_ESTIMATE
      ? correctIndex >= answers.length / 2
        ? 0
        : answers.length - 1
      : answers.findIndex((answer) => !answer.isCorrect)
  ) as ButtonIndex
}

/**
 * Joue une partie complète : le chooser prend A ; à chaque question, chacun appuie
 * à tour de rôle (buzz, mise, réponse, cible) selon la stratégie, puis le temps passe.
 */
function playGame(driver: Driver, strategy: Strategy): void {
  const participants = driver.state.setup.participants
  let at = 0
  driver.send({ type: 'start', at })

  while (driver.state.phase.name !== 'finished') {
    const { phase } = driver.state

    if (phase.name === 'theme_choice') {
      const chooser = driver.state.rounds.at(-1)?.chooserParticipantId
      const podium = participants.find((participant) => participant.id === chooser)?.podium ?? 0
      at += 1000
      driver.send({ type: 'press', at, podium, button: 0 })
    } else if (phase.name === 'question') {
      const key = questionKey(driver.state)
      const round = driver.state.rounds.length
      const questionIndex = phase.questionIndex

      for (let pass = 0; pass < 8 && questionKey(driver.state) === key; pass += 1) {
        for (const participant of participants) {
          if (questionKey(driver.state) !== key) {
            break
          }

          at += 100
          const outcome = strategy(participant.id, round, questionIndex)
          driver.send({
            type: 'press',
            at,
            podium: participant.podium,
            button: buttonFor(driver.state, outcome),
          })
        }
      }

      while (questionKey(driver.state) === key) {
        at += 1000
        driver.send({ type: 'tick', at })
      }
    } else {
      at = Math.max(at, getDeadline(driver.state))
      driver.send({ type: 'tick', at })
    }
  }
}

function playedGame(setup: GameSetup, strategy: Strategy, checkImmutability = false): Driver {
  const driver = createDriver(setup, checkImmutability)
  playGame(driver, strategy)
  return driver
}

/** Une issue variée mais déterministe selon le joueur, la manche et la question. */
const mixedStrategy: Strategy = (participantId, round, questionIndex) =>
  (participantId + round * 3 + questionIndex) % 3 === 0 ? 'correct' : 'wrong'

const everybodyWrong: Strategy = () => 'wrong'

function miniGamesOf(state: GameState): MiniGame[] {
  return state.rounds.map((round) => round.miniGame)
}

function questionStartsOf(events: GameEvent[], position: number): GameEvent[] {
  return events.filter(
    (event) => event.type === 'question_started' && event.payload.position === position
  )
}

/** Durée de la révélation après une question où personne ne répond. */
function revealOf(miniGame: MiniGame): number {
  const driver = createDriver(mixedSetup({ miniGames: [miniGame], roundsCount: 1 }))
  driver.send({ type: 'start', at: 0 })
  driver.send({ type: 'tick', at: 4000 })
  driver.send({ type: 'tick', at: 4000 + 15_000 })
  // Personne ne répond : la question se clôt à son échéance.
  driver.send({ type: 'tick', at: 200_000 })

  const ended = driver.events.find((event) => event.type === 'question_ended') as GameEvent
  const nextStart = questionStartsOf(driver.events, 1)[1] as GameEvent

  return nextStart.at - ended.at
}

function expectNeverNegative(events: GameEvent[]) {
  for (const event of events) {
    if (event.type === 'points_awarded') {
      expect(event.payload.total as number).toBeGreaterThanOrEqual(0)
    }
  }
}

describe('mini game rotation', () => {
  it('draws varied mini games and never the same twice in a row', () => {
    const drawn = new Set<MiniGame>()

    for (const seed of [1, 7, 42, 1234]) {
      const driver = playedGame(mixedSetup({ seed }), mixedStrategy)
      const miniGames = miniGamesOf(driver.state)

      expect(driver.state.phase).toEqual({ name: 'finished', reason: 'completed' })
      expect(miniGames).toHaveLength(20)
      expect(new Set(miniGames).size).toBeGreaterThanOrEqual(6)

      for (const [index, miniGame] of miniGames.entries()) {
        expect(miniGame).not.toBe(miniGames[index - 1])
        drawn.add(miniGame)
      }
    }

    expect([...drawn].sort()).toEqual([...MINI_GAMES].sort())
  })

  it('only plays questions and offers themes that suit the mini game of the round', () => {
    const driver = playedGame(mixedSetup(), mixedStrategy)
    const { themes } = driver.state.setup

    for (const round of driver.state.rounds) {
      const definition = getMiniGameDefinition(round.miniGame)

      expect(round.questions.length).toBeGreaterThan(0)
      expect(round.questions.every((question) => definition.isQuestionEligible(question))).toBe(
        true
      )

      for (const themeId of round.offeredThemeIds) {
        const theme = themes.find((candidate) => candidate.id === themeId)
        expect(theme?.questions.some((question) => definition.isQuestionEligible(question))).toBe(
          true
        )
      }
    }
  })

  it('only draws mini games that have a playable theme', () => {
    const audioOnly = playedGame(
      mixedSetup({ themes: [audioTheme(1), audioTheme(2)], roundsCount: 3 }),
      mixedStrategy
    )
    // Un seul mini-jeu jouable : il peut revenir à chaque manche.
    expect(miniGamesOf(audioOnly.state)).toEqual([
      MINI_GAME_FLASH_BLIND_TEST,
      MINI_GAME_FLASH_BLIND_TEST,
      MINI_GAME_FLASH_BLIND_TEST,
    ])

    const trueFalseOnly = playedGame(
      mixedSetup({
        themes: [themeOf(1, (id, index) => trueFalseQuestion(id, index % 2 === 1))],
      }),
      mixedStrategy
    )
    const drawn = new Set(miniGamesOf(trueFalseOnly.state))

    expect(drawn.has(MINI_GAME_TRUE_FALSE)).toBe(true)
    expect(drawn.has(MINI_GAME_FLASH_BLIND_TEST)).toBe(false)
    expect(drawn.has(MINI_GAME_ESTIMATE)).toBe(false)
    expect(drawn.has(MINI_GAME_PROGRESSIVE_REVEAL)).toBe(false)
  })

  it('replays the exact same mixed game from its seed and commands', () => {
    const driver = playedGame(mixedSetup({ seed: 99 }), mixedStrategy)
    const replay = replayGame(mixedSetup({ seed: 99 }), driver.commands)

    expect(replay.state).toEqual(driver.state)
    expect(replay.events).toEqual(driver.events)
    expect(replay.events.map((event) => event.seq)).toEqual(
      replay.events.map((_event, index) => index)
    )
  })

  it('restricts the draw to setup.miniGames', () => {
    const allowed: MiniGame[] = [MINI_GAME_FIRST_BUZZ, MINI_GAME_POINT_STEAL, MINI_GAME_ESTIMATE]
    const driver = playedGame(mixedSetup({ miniGames: allowed, roundsCount: 10 }), mixedStrategy)
    const miniGames = miniGamesOf(driver.state)

    expect(miniGames.every((miniGame) => allowed.includes(miniGame))).toBe(true)
    expect(new Set(miniGames).size).toBe(3)

    const single = playedGame(
      mixedSetup({ miniGames: [MINI_GAME_ESTIMATE], roundsCount: 3 }),
      mixedStrategy
    )
    expect(miniGamesOf(single.state)).toEqual([
      MINI_GAME_ESTIMATE,
      MINI_GAME_ESTIMATE,
      MINI_GAME_ESTIMATE,
    ])
  })

  it('never draws point steal with a single participant', () => {
    const solo: EngineParticipant[] = [PARTICIPANTS[1]!]

    for (const seed of [1, 2, 3, 4, 5]) {
      const driver = playedGame(mixedSetup({ seed, participants: solo }), mixedStrategy)

      expect(driver.state.phase).toEqual({ name: 'finished', reason: 'completed' })
      expect(miniGamesOf(driver.state)).not.toContain(MINI_GAME_POINT_STEAL)
    }

    const onlySteal = createDriver(
      mixedSetup({ participants: solo, miniGames: [MINI_GAME_POINT_STEAL] })
    )
    onlySteal.send({ type: 'start', at: 0 })
    expect(onlySteal.state.phase).toEqual({ name: 'finished', reason: 'no_content' })

    // À deux, le vol de points redevient possible.
    const duo = createDriver(
      mixedSetup({ participants: PARTICIPANTS.slice(0, 2), miniGames: [MINI_GAME_POINT_STEAL] })
    )
    duo.send({ type: 'start', at: 0 })
    expect(duo.state.rounds[0]?.miniGame).toBe(MINI_GAME_POINT_STEAL)
  })
})

describe('mini game specifics in the engine', () => {
  it('keeps the true/false order (A = true) instead of shuffling', () => {
    const driver = playedGame(
      mixedSetup({ miniGames: [MINI_GAME_TRUE_FALSE], roundsCount: 4 }),
      mixedStrategy
    )
    const questions = driver.state.rounds.flatMap((round) => round.questions)

    expect(questions.length).toBe(12)
    for (const question of questions) {
      expect(question.answers.map((answer) => answer.text)).toEqual(['Vrai', 'Faux'])
    }
    // Le catalogue d'origine garde son ordre de saisie (Faux, Vrai).
    expect(driver.state.setup.themes[1]?.questions[0]?.answers[0]?.text).toBe('Faux')
  })

  it('keeps estimate ranges in increasing order', () => {
    const driver = playedGame(
      mixedSetup({ miniGames: [MINI_GAME_ESTIMATE], roundsCount: 4 }),
      mixedStrategy
    )
    const questions = driver.state.rounds.flatMap((round) => round.questions)

    expect(questions.length).toBe(12)
    for (const question of questions) {
      const values = question.answers.map((answer) => parseLeadingNumber(answer.text) as number)
      expect(values).toEqual([...values].sort((first, second) => first - second))
    }

    // Les vraies questions d'estimation, saisies dans le désordre, sont remises dans l'ordre.
    const ranges = questions.filter((question) => question.text.startsWith('Combien'))
    expect(ranges.length).toBeGreaterThan(0)
    for (const question of ranges) {
      expect(question.answers.map((answer) => answer.text)).toEqual([
        'Moins de 100',
        '100 à 199',
        '200 à 299',
        '1 000 ou plus',
      ])
    }
  })

  it('uses the short true/false reveal and the default reveal elsewhere', () => {
    expect(TRUE_FALSE_REVEAL_MS).toBe(2500)
    expect(revealOf(MINI_GAME_TRUE_FALSE)).toBe(2500)
    expect(revealOf(MINI_GAME_QUICK_ANSWER)).toBe(5000)
  })

  it('ends a sudden death round as soon as a single survivor remains', () => {
    // Seul le joueur 1 trouve : il est le dernier debout dès la première question.
    const driver = playedGame(
      mixedSetup({
        miniGames: [MINI_GAME_SUDDEN_DEATH],
        themes: [themeOf(1, (id, index) => qcmQuestion(id, index % 4))],
        roundsCount: 2,
        questionsPerRound: 5,
      }),
      (participantId) => (participantId === 1 ? 'correct' : 'wrong')
    )
    const round = driver.state.rounds[0] as RoundRecord

    expect(round.questions).toHaveLength(5)
    expect(questionStartsOf(driver.events, 1)).toHaveLength(1)
    expect(new Set(round.answers.map((answer) => answer.questionId)).size).toBe(1)
    expect(driver.events).toContainEqual(
      expect.objectContaining({
        type: 'player_eliminated',
        payload: expect.objectContaining({ eliminatedIds: [2, 3, 4], survivorIds: [1] }),
      })
    )
    // Bonus du survivant : 50 + 200 par manche.
    expect(driver.state.scores[0]).toEqual({ participantId: 1, score: 500 })

    const roundEnded = driver.events.find((event) => event.type === 'round_ended') as GameEvent
    const ended = driver.events.find((event) => event.type === 'question_ended') as GameEvent
    expect(roundEnded.at).toBe(ended.at + driver.state.setup.timings.revealMs)
  })

  it('passes the game scores to the mini game, bounding first buzz penalties', () => {
    const driver = createDriver(
      mixedSetup({
        miniGames: [MINI_GAME_FIRST_BUZZ],
        themes: [themeOf(1, (id) => qcmQuestion(id, 0))],
        roundsCount: 1,
        questionsPerRound: 2,
      })
    )
    const answer = (podium: number, at: number, outcome: Outcome) => {
      driver.send({ type: 'press', at, podium, button: 0 })
      driver.send({ type: 'press', at: at + 100, podium, button: buttonFor(driver.state, outcome) })
    }

    driver.send({ type: 'start', at: 0 })
    driver.send({ type: 'tick', at: 4000 })
    driver.send({ type: 'tick', at: 19_000 })
    answer(1, 19_500, 'correct')
    driver.send({ type: 'tick', at: 30_000 })
    answer(1, 30_500, 'wrong')
    answer(2, 31_000, 'wrong')
    // Les points de la question tombent à sa clôture (fin de la fenêtre).
    driver.send({ type: 'tick', at: 100_000 })

    const awarded = driver.events
      .filter((event) => event.type === 'points_awarded')
      .map((event) => event.payload)

    // Joueur 1 : +100, puis -25 ; joueur 2 n'avait rien : pas de pénalité.
    expect(awarded).toEqual([
      { participantId: 1, points: 100, total: 100 },
      { participantId: 1, points: -25, total: 75 },
    ])
  })
})

describe('scores across mixed games', () => {
  it('never goes below zero when everybody is always wrong', () => {
    for (const seed of [3, 11]) {
      const driver = playedGame(mixedSetup({ seed }), everybodyWrong)

      expect(driver.state.phase).toEqual({ name: 'finished', reason: 'completed' })
      expect(driver.state.scores.every((line) => line.score === 0)).toBe(true)
      expectNeverNegative(driver.events)
    }
  })

  it('never goes below zero with mixed results and keeps one answer line per player', () => {
    for (const seed of [5, 8, 13]) {
      const driver = playedGame(mixedSetup({ seed }), mixedStrategy)

      expectNeverNegative(driver.events)
      expect(driver.state.scores.every((line) => line.score >= 0)).toBe(true)
      expect(driver.state.scores.some((line) => line.score > 0)).toBe(true)

      for (const round of driver.state.rounds) {
        const keys = round.answers.map((answer) => `${answer.questionId}:${answer.participantId}`)
        expect(new Set(keys).size).toBe(keys.length)
      }

      // Les scores sont la somme des points des réponses.
      for (const line of driver.state.scores) {
        const total = driver.state.rounds
          .flatMap((round) => round.answers)
          .filter((answer) => answer.participantId === line.participantId)
          .reduce((sum, answer) => sum + answer.points, 0)
        expect(line.score).toBe(total)
      }
    }
  })

  it('does not mutate the setup it receives', () => {
    const setup = mixedSetup({ roundsCount: 6 })
    const snapshot = structuredClone(setup)

    // Vérifie aussi, commande par commande, que l'état reçu n'est jamais modifié.
    playedGame(setup, mixedStrategy, true)

    expect(setup).toEqual(snapshot)
  })
})

describe('games with 5 and 6 podiums', () => {
  const sixPlayers: EngineParticipant[] = [1, 2, 3, 4, 5, 6].map((podium) => ({
    id: podium * 10,
    podium,
    displayName: `Joueur ${podium}`,
  }))

  it.each([5, 6])('plays complete mixed games with %i players, whatever the mini game', (count) => {
    const participants = sixPlayers.slice(0, count)

    for (const seed of [3, 11, 2026]) {
      const driver = playedGame(
        mixedSetup({ seed, participants, roundsCount: 12 }),
        mixedStrategy,
        true
      )

      expect(driver.state.phase).toEqual({ name: 'finished', reason: 'completed' })
      expect(driver.state.scores).toHaveLength(count)
      expect(driver.state.scores.map((line) => line.participantId)).toEqual(
        participants.map((participant) => participant.id)
      )
      expect(driver.state.scores.every((line) => line.score >= 0)).toBe(true)
      expectNeverNegative(driver.events)
      // La partie a bien distribué des points.
      expect(driver.state.scores.some((line) => line.score > 0)).toBe(true)
    }
  })

  it('replays a 6-player game exactly from its seed and commands', () => {
    const setup = mixedSetup({ seed: 77, participants: sixPlayers, roundsCount: 8 })
    const driver = playedGame(setup, mixedStrategy)
    const replay = replayGame(setup, driver.commands)

    expect(replay.state).toEqual(driver.state)
    expect(replay.events).toEqual(driver.events)
  })

  it('draws the theme choosers among the 6 players', () => {
    const driver = playedGame(
      mixedSetup({ seed: 5, participants: sixPlayers, roundsCount: 20 }),
      mixedStrategy
    )
    const choosers = new Set(driver.state.rounds.map((round) => round.chooserParticipantId))

    expect(choosers.size).toBeGreaterThanOrEqual(4)
    for (const chooser of choosers) {
      expect(sixPlayers.map((participant) => participant.id)).toContain(chooser)
    }
  })

  it('steals points by scrolling the target in a 6-player point steal game', () => {
    const driver = playedGame(
      mixedSetup({
        seed: 9,
        participants: sixPlayers,
        miniGames: [MINI_GAME_POINT_STEAL],
        roundsCount: 10,
      }),
      mixedStrategy,
      true
    )
    const requests = driver.events.filter((event) => event.type === 'steal_target_requested')
    const steals = driver.events.filter((event) => event.type === 'points_stolen')

    expect(driver.state.phase).toEqual({ name: 'finished', reason: 'completed' })
    expect(requests.length).toBeGreaterThan(0)
    // Le voleur valide lui-même dans certaines questions, sinon le temps tranche.
    expect(steals.some((event) => event.payload.automatic === false)).toBe(true)
    expectNeverNegative(driver.events)
  })

  it('plays a point steal game with only 4 players on pupitres 1 to 4 as before', () => {
    const driver = playedGame(
      mixedSetup({ seed: 9, miniGames: [MINI_GAME_POINT_STEAL], roundsCount: 6 }),
      mixedStrategy
    )
    const steals = driver.events.filter((event) => event.type === 'points_stolen')

    expect(driver.state.phase).toEqual({ name: 'finished', reason: 'completed' })
    expect(steals.length).toBeGreaterThan(0)
  })
})
