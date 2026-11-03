import {
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PODIUMS,
  GAME_THEMES_OFFERED_PER_ROUND,
  MINI_GAMES,
  type MiniGame,
} from '@quizzup/shared'

import {
  drawOfferedThemes,
  drawRoundChooser,
  drawRoundQuestions,
  getLeaderIds,
  type ScoreLine,
} from './draws'
import { MINI_GAME_DEFINITIONS, type MiniGameState, type QuestionStep } from './miniGames'
import { createRandom, pickOne, type Random } from './random'
import type {
  EngineTheme,
  GameCommand,
  GameEvent,
  GameSetup,
  GameTimings,
  PendingEvent,
  ResolvedSetup,
  RoundRecord,
} from './types'

export const DEFAULT_GAME_TIMINGS: GameTimings = {
  roundIntroMs: 4000,
  themeChoiceMs: 15_000,
  revealMs: 5000,
  roundSummaryMs: 8000,
}

export type GamePhase =
  | { name: 'lobby' }
  | { name: 'round_intro'; deadline: number }
  | { name: 'theme_choice'; deadline: number }
  | { name: 'question'; questionIndex: number; miniGameState: MiniGameState }
  | { name: 'reveal'; questionIndex: number; deadline: number }
  | { name: 'round_summary'; deadline: number }
  | { name: 'finished'; reason: 'completed' | 'no_content' }
  | { name: 'aborted'; reason: string }

export type GameState = {
  setup: ResolvedSetup
  randomState: number
  seq: number
  phase: GamePhase
  /** Scores, dans l'ordre des pupitres. */
  scores: ScoreLine[]
  rounds: RoundRecord[]
  usedThemeIds: number[]
  usedQuestionIds: number[]
}

export type GameStep = {
  state: GameState
  events: GameEvent[]
}

/** Garde-fou contre une boucle de transitions infinie dans un même tick. */
const MAX_TRANSITIONS_PER_COMMAND = 10_000

/**
 * Copie de travail d'une commande : `reduceGame` clone l'état reçu, puis les
 * fonctions internes ci-dessous font évoluer CE clone. L'état de l'appelant
 * n'est jamais modifié.
 */
type Context = {
  state: GameState
  events: GameEvent[]
  random: Random
}

export class GameSetupError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'GameSetupError'
  }
}

function assertIntegerInRange(value: number, min: number, max: number, code: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new GameSetupError(code)
  }
}

function resolveSetup(setup: GameSetup): ResolvedSetup {
  const roundsCount = setup.roundsCount ?? GAME_DEFAULT_ROUNDS
  const questionsPerRound = setup.questionsPerRound ?? GAME_DEFAULT_QUESTIONS_PER_ROUND
  const miniGames = setup.miniGames ?? [...MINI_GAMES]

  assertIntegerInRange(roundsCount, 1, GAME_MAX_ROUNDS, 'rounds_count_invalid')
  assertIntegerInRange(
    questionsPerRound,
    1,
    GAME_MAX_QUESTIONS_PER_ROUND,
    'questions_per_round_invalid'
  )

  if (!Number.isFinite(setup.seed)) {
    throw new GameSetupError('seed_invalid')
  }

  if (setup.participants.length === 0 || setup.participants.length > GAME_PODIUMS) {
    throw new GameSetupError('participants_count_invalid')
  }

  const podiums = new Set(setup.participants.map((participant) => participant.podium))
  const ids = new Set(setup.participants.map((participant) => participant.id))

  if (podiums.size !== setup.participants.length || ids.size !== setup.participants.length) {
    throw new GameSetupError('participants_duplicated')
  }

  for (const participant of setup.participants) {
    assertIntegerInRange(participant.podium, 1, GAME_PODIUMS, 'participant_podium_invalid')
  }

  if (miniGames.length === 0 || miniGames.some((miniGame) => !MINI_GAMES.includes(miniGame))) {
    throw new GameSetupError('mini_games_invalid')
  }

  return {
    seed: setup.seed,
    participants: [...setup.participants].sort((first, second) => first.podium - second.podium),
    themes: setup.themes,
    roundsCount,
    questionsPerRound,
    miniGames,
    timings: { ...DEFAULT_GAME_TIMINGS, ...setup.timings },
  }
}

/** Crée une partie en attente de la commande `start`. Lève `GameSetupError` si la config est invalide. */
export function createGame(setup: GameSetup): GameState {
  const resolved = resolveSetup(setup)

  return {
    setup: resolved,
    randomState: Math.trunc(resolved.seed) | 0,
    seq: 0,
    phase: { name: 'lobby' },
    scores: resolved.participants.map((participant) => ({
      participantId: participant.id,
      score: 0,
    })),
    rounds: [],
    usedThemeIds: [],
    usedQuestionIds: [],
  }
}

function emit(context: Context, events: PendingEvent[]): void {
  const { state } = context

  for (const event of events) {
    context.events.push({ ...event, seq: state.seq })
    state.seq += 1
  }
}

function getCurrentRound(state: GameState): RoundRecord | undefined {
  return state.rounds.at(-1)
}

function getPlayableThemes(themes: EngineTheme[], miniGame: MiniGame): EngineTheme[] {
  const definition = MINI_GAME_DEFINITIONS[miniGame]

  return themes.filter((theme) =>
    theme.questions.some((question) => definition.isQuestionEligible(question))
  )
}

function finishGame(context: Context, at: number, reason: 'completed' | 'no_content'): void {
  const { state } = context

  state.phase = { name: 'finished', reason }
  emit(context, [
    {
      type: 'game_ended',
      at,
      payload: {
        reason,
        scores: context.state.scores,
        winnerIds: getLeaderIds(context.state.scores),
      },
    },
  ])
}

function beginRound(context: Context, at: number): void {
  const { state } = context
  const position = state.rounds.length + 1
  const previousMiniGame = getCurrentRound(state)?.miniGame
  const playableMiniGames = state.setup.miniGames.filter(
    (miniGame) => getPlayableThemes(state.setup.themes, miniGame).length > 0
  )
  // Pas deux fois le même mini-jeu d'affilée quand on a le choix.
  const candidates =
    playableMiniGames.length > 1
      ? playableMiniGames.filter((miniGame) => miniGame !== previousMiniGame)
      : playableMiniGames
  const miniGame = pickOne(candidates, context.random)
  const chooser = drawRoundChooser(state.scores, position, context.random)

  if (!miniGame || !chooser) {
    finishGame(context, at, 'no_content')
    return
  }

  const offeredThemes = drawOfferedThemes(
    getPlayableThemes(state.setup.themes, miniGame),
    state.usedThemeIds,
    GAME_THEMES_OFFERED_PER_ROUND,
    context.random
  )

  state.rounds.push({
    position,
    miniGame,
    offeredThemeIds: offeredThemes.map((theme) => theme.id),
    chooserParticipantId: chooser.participantId,
    chooserReason: chooser.reason,
    themeId: null,
    questions: [],
    answers: [],
  })
  state.phase = { name: 'round_intro', deadline: at + state.setup.timings.roundIntroMs }
  emit(context, [{ type: 'round_started', at, payload: { position, miniGame } }])
}

function enterThemeChoice(context: Context, at: number): void {
  const { state } = context
  const round = getCurrentRound(state) as RoundRecord

  state.phase = {
    name: 'theme_choice',
    deadline: at + state.setup.timings.themeChoiceMs,
  }
  emit(context, [
    {
      type: 'round_themes_offered',
      at,
      payload: { position: round.position, themeIds: round.offeredThemeIds },
    },
    {
      type: 'round_chooser_selected',
      at,
      payload: {
        position: round.position,
        participantId: round.chooserParticipantId,
        reason: round.chooserReason,
      },
    },
  ])
}

function startQuestion(context: Context, questionIndex: number, at: number): void {
  const { state } = context
  const round = getCurrentRound(state) as RoundRecord
  const question = round.questions[questionIndex]

  if (!question) {
    endRound(context, at)
    return
  }

  const step = MINI_GAME_DEFINITIONS[round.miniGame].start(question, state.setup.participants, at)

  emit(context, [
    {
      type: 'question_started',
      at,
      payload: {
        position: round.position,
        questionIndex,
        questionId: question.id,
        miniGame: round.miniGame,
      },
    },
  ])
  state.phase = { name: 'question', questionIndex, miniGameState: step.state }
  applyQuestionStep(context, step, at)
}

function selectTheme(context: Context, themeId: number, at: number, automatic: boolean): void {
  const { state } = context
  const round = getCurrentRound(state) as RoundRecord
  const theme = state.setup.themes.find((candidate) => candidate.id === themeId) as EngineTheme
  const definition = MINI_GAME_DEFINITIONS[round.miniGame]
  const questions = drawRoundQuestions(
    theme.questions.filter((question) => definition.isQuestionEligible(question)),
    state.usedQuestionIds,
    state.setup.questionsPerRound,
    context.random
  )

  round.themeId = themeId
  round.questions = structuredClone(questions)
  state.usedThemeIds = [...new Set([...state.usedThemeIds, themeId])]
  state.usedQuestionIds = [
    ...new Set([...state.usedQuestionIds, ...questions.map((question) => question.id)]),
  ]

  emit(context, [
    {
      type: 'round_theme_selected',
      at,
      payload: {
        position: round.position,
        themeId,
        participantId: round.chooserParticipantId,
        automatic,
        questionIds: questions.map((question) => question.id),
      },
    },
  ])
  startQuestion(context, 0, at)
}

function applyQuestionStep(context: Context, step: QuestionStep<MiniGameState>, at: number): void {
  const { state } = context

  if (state.phase.name !== 'question') {
    return
  }

  emit(context, step.events)

  if (!step.answers) {
    state.phase = { ...state.phase, miniGameState: step.state }
    return
  }

  const round = getCurrentRound(state) as RoundRecord
  const questionIndex = state.phase.questionIndex
  const question = round.questions[questionIndex]
  const pointEvents: PendingEvent[] = []
  const endedAt = step.endedAt ?? at

  round.answers.push(...step.answers)

  for (const answer of step.answers) {
    if (answer.points === 0) {
      continue
    }

    const line = state.scores.find((candidate) => candidate.participantId === answer.participantId)

    if (line) {
      line.score += answer.points
      pointEvents.push({
        type: 'points_awarded',
        at: endedAt,
        payload: { participantId: answer.participantId, points: answer.points, total: line.score },
      })
    }
  }

  emit(context, [
    ...pointEvents,
    {
      type: 'question_ended',
      at: endedAt,
      payload: {
        questionId: question?.id ?? null,
        winnerIds: step.answers
          .filter((answer) => answer.isCorrect)
          .map((answer) => answer.participantId),
        correctAnswerIds:
          question?.answers.filter((answer) => answer.isCorrect).map((answer) => answer.id) ?? [],
      },
    },
  ])
  state.phase = { name: 'reveal', questionIndex, deadline: endedAt + state.setup.timings.revealMs }
}

function endRound(context: Context, at: number): void {
  const { state } = context
  const round = getCurrentRound(state) as RoundRecord

  state.phase = {
    name: 'round_summary',
    deadline: at + state.setup.timings.roundSummaryMs,
  }
  emit(context, [
    {
      type: 'round_ended',
      at,
      payload: { position: round.position, scores: context.state.scores },
    },
  ])
}

/** Applique les échéances dépassées. Renvoie `true` si une transition a eu lieu. */
function advanceTimers(context: Context, at: number): boolean {
  const { state } = context
  const { phase } = state

  switch (phase.name) {
    case 'round_intro': {
      if (at < phase.deadline) {
        return false
      }

      enterThemeChoice(context, phase.deadline)
      return true
    }

    case 'theme_choice': {
      if (at < phase.deadline) {
        return false
      }

      const round = getCurrentRound(state) as RoundRecord
      const themeId = pickOne(round.offeredThemeIds, context.random) as number

      selectTheme(context, themeId, phase.deadline, true)
      return true
    }

    case 'question': {
      const round = getCurrentRound(state) as RoundRecord
      const step = MINI_GAME_DEFINITIONS[round.miniGame].tick(phase.miniGameState, at)

      if (step.events.length === 0 && !step.answers) {
        return false
      }

      applyQuestionStep(context, step, at)
      return true
    }

    case 'reveal': {
      if (at < phase.deadline) {
        return false
      }

      startQuestion(context, phase.questionIndex + 1, phase.deadline)
      return true
    }

    case 'round_summary': {
      if (at < phase.deadline) {
        return false
      }

      if (state.rounds.length >= state.setup.roundsCount) {
        finishGame(context, phase.deadline, 'completed')
      } else {
        beginRound(context, phase.deadline)
      }

      return true
    }

    default: {
      return false
    }
  }
}

function handlePress(context: Context, podium: number, button: number, at: number): void {
  const { state } = context
  const participant = state.setup.participants.find((candidate) => candidate.podium === podium)

  if (!participant || !Number.isInteger(button) || button < 0 || button > 3) {
    return
  }

  if (state.phase.name === 'theme_choice') {
    const round = getCurrentRound(state) as RoundRecord
    const themeId = round.offeredThemeIds[button]

    if (participant.id === round.chooserParticipantId && themeId !== undefined) {
      selectTheme(context, themeId, at, false)
    }

    return
  }

  if (state.phase.name === 'question') {
    const round = getCurrentRound(state) as RoundRecord
    const step = MINI_GAME_DEFINITIONS[round.miniGame].press(state.phase.miniGameState, {
      participantId: participant.id,
      button: button as 0 | 1 | 2 | 3,
      at,
    })

    applyQuestionStep(context, step, at)
  }
}

/**
 * Applique une commande à la partie. Fonction pure : l'état reçu n'est pas
 * modifié, un nouvel état et les événements émis sont renvoyés.
 */
export function reduceGame(state: GameState, command: GameCommand): GameStep {
  const context: Context = {
    state: structuredClone(state),
    events: [],
    random: createRandom(state.randomState),
  }
  const { phase } = context.state
  const isOver = phase.name === 'finished' || phase.name === 'aborted'

  if (!isOver) {
    switch (command.type) {
      case 'start': {
        if (phase.name === 'lobby') {
          emit(context, [
            {
              type: 'game_started',
              at: command.at,
              payload: {
                seed: state.setup.seed,
                participantIds: state.scores.map((line) => line.participantId),
              },
            },
          ])
          beginRound(context, command.at)
        }
        break
      }

      case 'abort': {
        context.state.phase = { name: 'aborted', reason: command.reason }
        emit(context, [
          { type: 'game_aborted', at: command.at, payload: { reason: command.reason } },
        ])
        break
      }

      case 'press': {
        // Les échéances passées s'appliquent avant l'appui (ex. palier terminé).
        runTimers(context, command.at)
        handlePress(context, command.podium, command.button, command.at)
        break
      }

      case 'tick': {
        break
      }
    }

    if (context.state.phase.name !== 'lobby') {
      runTimers(context, command.at)
    }
  }

  context.state.randomState = context.random.state()

  return { state: context.state, events: context.events }
}

function runTimers(context: Context, at: number): void {
  for (let iteration = 0; iteration < MAX_TRANSITIONS_PER_COMMAND; iteration += 1) {
    if (!advanceTimers(context, at)) {
      return
    }
  }

  throw new Error('game_engine_transition_loop')
}

/** Applique une suite de commandes (utile pour rejouer une partie depuis l'historique). */
export function replayGame(setup: GameSetup, commands: GameCommand[]): GameStep {
  let state = createGame(setup)
  const events: GameEvent[] = []

  for (const command of commands) {
    const step = reduceGame(state, command)
    state = step.state
    events.push(...step.events)
  }

  return { state, events }
}
