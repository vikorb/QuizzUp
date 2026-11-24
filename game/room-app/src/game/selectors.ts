import {
  type EngineParticipant,
  type EngineQuestion,
  FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS,
  FLASH_BLIND_TEST_BUZZ_WINDOW_MS,
  FLASH_BLIND_TEST_STAGE_POINTS,
  type GameState,
  getFlashBlindTestStageDurationsMs,
  type RoundRecord,
} from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST, type MiniGame } from '@quizzup/shared'

/**
 * Lecture de l'état du moteur pour l'affichage. Fonctions pures : l'écran ne
 * calcule jamais de règle du jeu lui-même, il lit l'état et l'heure courante.
 */

/** Paliers du blind test d'une question : les durées suivent son effet audio. */
export function getBlindTestStages(question: Pick<EngineQuestion, 'audioEffect'>) {
  return getFlashBlindTestStageDurationsMs(question).map((durationMs, index) => ({
    stage: index + 1,
    durationMs,
    points: FLASH_BLIND_TEST_STAGE_POINTS[index] ?? 0,
  }))
}

/** Paliers par défaut (sans effet) : écran d'intro de manche, la question n'y est pas connue. */
export const BLIND_TEST_STAGES = getBlindTestStages({})

export function getCurrentRound(state: GameState): RoundRecord | undefined {
  return state.rounds.at(-1)
}

export function getParticipant(
  state: GameState,
  participantId: number | null | undefined
): EngineParticipant | undefined {
  return state.setup.participants.find((participant) => participant.id === participantId)
}

export function getThemeName(state: GameState, themeId: number | null | undefined): string {
  return state.setup.themes.find((theme) => theme.id === themeId)?.name ?? ''
}

/** Temps restant avant une échéance, borné à [0, total]. */
export function getRemaining(deadline: number, now: number): number {
  return Math.max(0, deadline - now)
}

export type LeaderboardLine = {
  participantId: number
  podium: number
  displayName: string
  score: number
  /** Rang avec ex-aequo (1, 1, 3…). */
  rank: number
  /** Points marqués pendant la manche en cours. */
  roundPoints: number
}

export function getRoundPoints(round: RoundRecord | undefined, participantId: number): number {
  if (!round) {
    return 0
  }

  return round.answers
    .filter((answer) => answer.participantId === participantId)
    .reduce((total, answer) => total + answer.points, 0)
}

export function getLeaderboard(state: GameState): LeaderboardLine[] {
  const round = getCurrentRound(state)
  const lines = state.scores.map((line) => {
    const participant = getParticipant(state, line.participantId)
    return {
      participantId: line.participantId,
      podium: participant?.podium ?? 0,
      displayName: participant?.displayName ?? '',
      score: line.score,
      rank: 0,
      roundPoints: getRoundPoints(round, line.participantId),
    }
  })

  lines.sort((first, second) => second.score - first.score || first.podium - second.podium)

  for (const [index, line] of lines.entries()) {
    const previous = lines[index - 1]
    line.rank = previous && previous.score === line.score ? previous.rank : index + 1
  }

  return lines
}

export type BlindTestStatus = 'listening' | 'buzz_window' | 'answering'

export type BlindTestView = {
  question: EngineQuestion
  questionIndex: number
  questionsCount: number
  /** Palier 1-based. */
  stage: number
  /** Les paliers de la question (durées selon son effet audio). */
  stages: ReturnType<typeof getBlindTestStages>
  status: BlindTestStatus
  /** Avancement du palier (écoute + fenêtre de buzz), de 0 à 1. */
  stageProgress: number
  /** Temps restant pour buzzer (écoute comprise), en ms. */
  stageRemainingMs: number
  answeringParticipantId: number | null
  answerRemainingMs: number
  lockedOutIds: number[]
}

export function getBlindTestView(state: GameState, now: number): BlindTestView | null {
  const { phase } = state

  if (phase.name !== 'question' || phase.miniGameState.kind !== MINI_GAME_FLASH_BLIND_TEST) {
    return null
  }

  const mini = phase.miniGameState
  const stages = getBlindTestStages(mini.question)
  const extractMs = getFlashBlindTestStageDurationsMs(mini.question)[mini.stageIndex] ?? 0
  const totalMs = extractMs + FLASH_BLIND_TEST_BUZZ_WINDOW_MS
  const reference = mini.status === 'answering' && mini.pausedAt !== null ? mini.pausedAt : now
  const elapsed = Math.min(totalMs, Math.max(0, reference - mini.stageStartedAt))

  let status: BlindTestStatus = elapsed < extractMs ? 'listening' : 'buzz_window'
  if (mini.status === 'answering') {
    status = 'answering'
  }

  return {
    question: mini.question,
    questionIndex: phase.questionIndex,
    questionsCount: getCurrentRound(state)?.questions.length ?? 0,
    stage: mini.stageIndex + 1,
    stages,
    status,
    stageProgress: totalMs > 0 ? elapsed / totalMs : 1,
    stageRemainingMs: totalMs - elapsed,
    answeringParticipantId: mini.answeringParticipantId,
    answerRemainingMs:
      mini.answerDeadline === null
        ? 0
        : Math.min(FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS, getRemaining(mini.answerDeadline, now)),
    lockedOutIds: mini.lockedOutIds,
  }
}

export type RevealResult = {
  participantId: number
  isCorrect: boolean
  /** Points de la question (négatifs : pénalité, mise perdue, points volés). */
  points: number
}

export type RevealView = {
  miniGame: MiniGame
  question: EngineQuestion
  correctAnswerIds: number[]
  /** Premier joueur juste (le seul au blind test et au premier buzz). */
  winnerId: number | null
  points: number
  stage: number | null
  /** Bilan de la question par joueur, dans l'ordre des pupitres (lignes jouées seulement). */
  results: RevealResult[]
}

export function getRevealView(state: GameState): RevealView | null {
  const { phase } = state

  if (phase.name !== 'reveal') {
    return null
  }

  const round = getCurrentRound(state)
  const question = round?.questions[phase.questionIndex]

  if (!round || !question) {
    return null
  }

  const answers = round.answers.filter((answer) => answer.questionId === question.id)
  const winning = answers.find((answer) => answer.isCorrect)
  const results = state.setup.participants.flatMap((participant) => {
    const answer = answers.find((candidate) => candidate.participantId === participant.id)
    return answer
      ? [{ participantId: participant.id, isCorrect: answer.isCorrect, points: answer.points }]
      : []
  })

  return {
    miniGame: round.miniGame,
    question,
    correctAnswerIds: question.answers
      .filter((answer) => answer.isCorrect)
      .map((answer) => answer.id),
    winnerId: winning?.participantId ?? null,
    points: winning?.points ?? 0,
    stage: winning?.stage ?? null,
    results,
  }
}

/** Numéro de la question affichée (1-based), quelle que soit la phase. */
export function getQuestionNumber(state: GameState): number | null {
  const { phase } = state
  if (phase.name === 'question' || phase.name === 'reveal') {
    return phase.questionIndex + 1
  }
  return null
}

/** Identifiant de la question en cours de jeu (phase `question`), `null` ailleurs. */
export function getLiveQuestionId(state: GameState): number | null {
  const { phase } = state
  if (phase.name !== 'question') {
    return null
  }
  return getCurrentRound(state)?.questions[phase.questionIndex]?.id ?? null
}
