import {
  DOUBLE_OR_NOTHING_BET_MS,
  type EngineQuestion,
  FIRST_BUZZ_ANSWER_TIMEOUT_MS,
  type GameState,
  getBuzzElapsedMs,
  getProgressiveRevealPoints,
  type MiniGameState,
  POINT_STEAL_TARGET_MS,
  PROGRESSIVE_REVEAL_ANSWER_TIMEOUT_MS,
  type SimultaneousAnswering,
} from '@quizzup/game-engine'
import {
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_STREAK,
  MINI_GAME_SUDDEN_DEATH,
  type MiniGame,
} from '@quizzup/shared'

import { getCurrentRound, getRemaining } from '@/game/selectors'

/**
 * Vues d'affichage des mini-jeux autres que le blind test. Comme `selectors.ts` :
 * fonctions pures qui lisent l'état du moteur, sans recalculer ses règles.
 */

type QuestionBase = {
  miniGame: MiniGame
  question: EngineQuestion
  questionIndex: number
  questionsCount: number
}

/** Tout le monde répond en même temps (rapidité, vrai/faux, série, mort subite…). */
export type AnswerAllView = QuestionBase & {
  mode: 'answer_all'
  remainingMs: number
  /** Part de temps restante, de 0 à 1. */
  remainingRatio: number
  /** Joueurs qui peuvent répondre (mort subite : les survivants). */
  playerIds: number[]
  answeredIds: number[]
  eliminatedIds: number[]
  /** Étiquette par joueur : multiplicateur de série, mise de quitte ou double. */
  tags: Record<number, { kind: 'multiplier' | 'stake' | 'all_in' | 'pass'; value: number }>
}

/** Quitte ou double : chacun mise avant de voir la question. */
export type BetView = QuestionBase & {
  mode: 'bet'
  remainingMs: number
  remainingRatio: number
  betIds: number[]
  /** Mise que représenterait le tapis, par joueur (son score, au moins 300). */
  scores: Record<number, number>
}

/** Vol de points : le plus rapide des bons choisit sa cible. */
export type StealView = QuestionBase & {
  mode: 'steal'
  thiefId: number
  /** Cibles possibles (adversaires qui ont des points). */
  targetIds: number[]
  remainingRatio: number
}

/** On buzze, puis on répond seul (premier buzz, révélation progressive). */
export type BuzzView = QuestionBase & {
  mode: 'buzz'
  status: 'open' | 'answering'
  /** Avancement de la fenêtre de buzz (0 → 1), figé pendant une réponse. */
  progress: number
  answeringParticipantId: number | null
  answerRemainingRatio: number
  lockedOutIds: number[]
  /** Points en jeu si on trouve maintenant (révélation progressive). */
  pointsAtStake: number | null
}

export type MiniGameView = AnswerAllView | BetView | StealView | BuzzView

function ratio(remainingMs: number, totalMs: number): number {
  return totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0
}

function answeringBase(answering: SimultaneousAnswering, now: number) {
  const remainingMs = getRemaining(answering.deadline, now)

  return {
    remainingMs,
    remainingRatio: ratio(remainingMs, answering.deadline - answering.startedAt),
    playerIds: answering.playerIds,
    answeredIds: answering.choices.map((choice) => choice.participantId),
  }
}

function getTags(mini: MiniGameState): AnswerAllView['tags'] {
  const tags: AnswerAllView['tags'] = {}

  if (mini.kind === MINI_GAME_STREAK) {
    for (const [participantId, value] of Object.entries(mini.extra.multipliers)) {
      tags[Number(participantId)] = { kind: 'multiplier', value }
    }
  }

  if (mini.kind === MINI_GAME_DOUBLE_OR_NOTHING) {
    for (const bet of mini.bets) {
      let kind: 'stake' | 'all_in' | 'pass' = 'stake'
      if (bet.stake === 0) {
        kind = 'pass'
      } else if (bet.button === 3) {
        kind = 'all_in'
      }
      tags[bet.participantId] = { kind, value: bet.stake }
    }
  }

  return tags
}

export function getMiniGameView(state: GameState, now: number): MiniGameView | null {
  const { phase } = state

  if (phase.name !== 'question' || phase.miniGameState.kind === MINI_GAME_FLASH_BLIND_TEST) {
    return null
  }

  const mini = phase.miniGameState
  const round = getCurrentRound(state)
  const base = {
    miniGame: mini.kind,
    questionIndex: phase.questionIndex,
    questionsCount: round?.questions.length ?? 0,
  }

  if (mini.kind === MINI_GAME_FIRST_BUZZ || mini.kind === MINI_GAME_PROGRESSIVE_REVEAL) {
    const elapsedMs = getBuzzElapsedMs(mini, now)
    const answerTimeoutMs =
      mini.kind === MINI_GAME_FIRST_BUZZ
        ? FIRST_BUZZ_ANSWER_TIMEOUT_MS
        : PROGRESSIVE_REVEAL_ANSWER_TIMEOUT_MS

    return {
      ...base,
      mode: 'buzz',
      question: mini.question,
      status: mini.status === 'answering' ? 'answering' : 'open',
      progress: ratio(elapsedMs, mini.windowMs),
      answeringParticipantId: mini.answeringParticipantId,
      answerRemainingRatio:
        mini.answerDeadline === null
          ? 0
          : ratio(getRemaining(mini.answerDeadline, now), answerTimeoutMs),
      lockedOutIds: mini.lockedOutIds,
      pointsAtStake:
        mini.kind === MINI_GAME_PROGRESSIVE_REVEAL ? getProgressiveRevealPoints(elapsedMs) : null,
    }
  }

  if (mini.kind === MINI_GAME_DOUBLE_OR_NOTHING && mini.status === 'betting') {
    const remainingMs = getRemaining(mini.betDeadline, now)
    const scores: Record<number, number> = {}
    for (const line of mini.scoresAtStart) {
      scores[line.participantId] = line.score
    }

    return {
      ...base,
      mode: 'bet',
      question: mini.answering.question,
      remainingMs,
      remainingRatio: ratio(remainingMs, DOUBLE_OR_NOTHING_BET_MS),
      betIds: mini.bets.map((bet) => bet.participantId),
      scores,
    }
  }

  if (mini.kind === MINI_GAME_POINT_STEAL && mini.status === 'targeting') {
    return {
      ...base,
      mode: 'steal',
      question: mini.answering.question,
      thiefId: mini.thiefId ?? 0,
      targetIds: mini.participants
        .filter((participant) => participant.id !== mini.thiefId)
        .filter((participant) => {
          const gained = mini.records
            .filter((record) => record.participantId === participant.id)
            .reduce((total, record) => total + record.points, 0)
          const start =
            mini.scoresAtStart.find((line) => line.participantId === participant.id)?.score ?? 0
          return start + gained > 0
        })
        .map((participant) => participant.id),
      remainingRatio:
        mini.targetDeadline === null
          ? 0
          : ratio(getRemaining(mini.targetDeadline, now), POINT_STEAL_TARGET_MS),
    }
  }

  // Seuls les mini-jeux « tout le monde répond » ont encore une fenêtre `answering`.
  const answering = 'answering' in mini ? mini.answering : null

  if (!answering) {
    return null
  }

  const participantIds = state.setup.participants.map((participant) => participant.id)
  const eliminatedIds =
    mini.kind === MINI_GAME_SUDDEN_DEATH
      ? participantIds.filter((participantId) => !answering.playerIds.includes(participantId))
      : []

  return {
    ...base,
    mode: 'answer_all',
    question: answering.question,
    ...answeringBase(answering, now),
    eliminatedIds,
    tags: getTags(mini),
  }
}
