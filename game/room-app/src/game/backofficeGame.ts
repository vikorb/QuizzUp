import { type GameState, getMiniGameDefinition, type RoundRecord } from '@quizzup/game-engine'

import {
  forgetBackofficeGameId,
  isRememberedForCurrentAccount,
  readBackofficeGameId,
  readSavedBackofficeGame,
  rememberBackofficeGameId,
} from '@/game/backofficeGameMemory'
import { enqueuePendingFinish, findPendingFinishBySeed } from '@/game/pendingFinishes'
import { getLeaderboard } from '@/game/selectors'
import { getRoomToken, isDemoMode } from '@/utils/auth'
import type { RoomGameRound } from '@/utils/roomApi'

export { readBackofficeGameId, rememberBackofficeGameId }

/**
 * Identifiants des questions effectivement posées dans la manche : toutes, sauf si le mini-jeu a
 * mis fin à la manche avant la dernière (mort subite). Même règle que le moteur, rejouée sur les
 * questions tirées et les réponses de la manche ; une question passée par l'animateur compte.
 */
function getAskedQuestionIds(state: GameState, round: RoundRecord): number[] {
  const isRoundOver = getMiniGameDefinition(round.miniGame).isRoundOver
  const skipped = round.skippedQuestionIds ?? []

  for (let asked = 1; isRoundOver && asked < round.questions.length; asked += 1) {
    const playedQuestions = round.questions
      .slice(0, asked)
      .filter((question) => !skipped.includes(question.id))

    if (
      isRoundOver({
        participants: state.setup.participants,
        playedQuestions,
        roundAnswers: round.answers,
      })
    ) {
      return round.questions.slice(0, asked).map((question) => question.id)
    }
  }

  return round.questions.map((question) => question.id)
}

/** Manches jouées d'une partie terminée, au format de `POST /room/games/:id/finish`. */
export function getPlayedRounds(state: GameState): RoomGameRound[] {
  return state.rounds.map((round) => ({
    position: round.position,
    miniGame: round.miniGame,
    themeId: round.themeId,
    questionIds: getAskedQuestionIds(state, round),
  }))
}

/**
 * Au podium, met en file la fin de la partie (scores des pupitres) à signaler au backoffice,
 * pour qu'elle ne reste pas « en cours » ; l'envoi se fait en arrière-plan et se répète tant
 * que le réseau manque (cf. `pendingFinishes.ts`). Sans effet en mode démo, hors partie du
 * backoffice ou si la partie jouée n'est pas celle retenue (graine différente) ou appartient à
 * un autre compte de salle.
 *
 * Retourne l'id de la partie du backoffice dont l'état d'envoi concerne ce podium, sinon `null` :
 * soit le rapport vient d'être mis en file (la partie retenue est alors oubliée, la file garde
 * le relais), soit il y est déjà (page rechargée au podium, même graine).
 */
export function reportFinishedGame(state: GameState): number | null {
  if (isDemoMode()) {
    return null
  }
  const saved = readSavedBackofficeGame()

  if (
    !getRoomToken() ||
    !saved ||
    saved.seed !== state.setup.seed ||
    !isRememberedForCurrentAccount(saved)
  ) {
    return findPendingFinishBySeed(state.setup.seed)?.gameId ?? null
  }

  const scores = getLeaderboard(state).map(({ podium, score }) => ({ podium, score }))
  void enqueuePendingFinish({
    gameId: saved.id,
    seed: saved.seed,
    scores,
    rounds: getPlayedRounds(state),
  })
  forgetBackofficeGameId()
  return saved.id
}
