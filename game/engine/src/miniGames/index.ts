import {
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_ESTIMATE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_STREAK,
  MINI_GAME_SUDDEN_DEATH,
  MINI_GAME_TRUE_FALSE,
  type MiniGame,
} from '@quizzup/shared'

import type { EngineQuestion } from '../types'
import { doubleOrNothing, type DoubleOrNothingState } from './doubleOrNothing'
import { estimate, type EstimateState } from './estimate'
import { firstBuzz, type FirstBuzzState } from './firstBuzz'
import { flashBlindTest, type FlashBlindTestState } from './flashBlindTest'
import type { MiniGameDefinition } from './miniGame'
import { pointSteal, type PointStealState } from './pointSteal'
import { progressiveReveal, type ProgressiveRevealState } from './progressiveReveal'
import { quickAnswer, type QuickAnswerState } from './quickAnswer'
import { streak, type StreakState } from './streak'
import { suddenDeath, type SuddenDeathState } from './suddenDeath'
import { trueFalse, type TrueFalseState } from './trueFalse'

/** État de la question en cours, discriminé par `kind` (un membre par mini-jeu). */
export type MiniGameState =
  | FlashBlindTestState
  | QuickAnswerState
  | FirstBuzzState
  | TrueFalseState
  | DoubleOrNothingState
  | SuddenDeathState
  | PointStealState
  | StreakState
  | EstimateState
  | ProgressiveRevealState

/**
 * Registre des mini-jeux. Ajouter un mini-jeu : créer son module, l'ajouter ici,
 * dans `MiniGameState`, et dans `MINI_GAMES` de `@quizzup/shared` (+ migration CHECK).
 */
export const MINI_GAME_DEFINITIONS = {
  [MINI_GAME_FLASH_BLIND_TEST]: flashBlindTest,
  [MINI_GAME_QUICK_ANSWER]: quickAnswer,
  [MINI_GAME_FIRST_BUZZ]: firstBuzz,
  [MINI_GAME_TRUE_FALSE]: trueFalse,
  [MINI_GAME_DOUBLE_OR_NOTHING]: doubleOrNothing,
  [MINI_GAME_SUDDEN_DEATH]: suddenDeath,
  [MINI_GAME_POINT_STEAL]: pointSteal,
  [MINI_GAME_STREAK]: streak,
  [MINI_GAME_ESTIMATE]: estimate,
  [MINI_GAME_PROGRESSIVE_REVEAL]: progressiveReveal,
} satisfies Record<MiniGame, unknown>

/** Question jouée par l'état d'un mini-jeu, quel qu'il soit. */
export function getMiniGameQuestion(state: MiniGameState): EngineQuestion {
  return 'answering' in state ? state.answering.question : state.question
}

/** Définition d'un mini-jeu, vue par le moteur (état générique). */
export function getMiniGameDefinition(miniGame: MiniGame): MiniGameDefinition<MiniGameState> {
  return MINI_GAME_DEFINITIONS[miniGame] as unknown as MiniGameDefinition<MiniGameState>
}

export * from './buzzToAnswer'
export * from './doubleOrNothing'
export * from './estimate'
export * from './firstBuzz'
export * from './flashBlindTest'
export type { MiniGameDefinition, QuestionContext, QuestionStep, RoundContext } from './miniGame'
export * from './pointSteal'
export * from './progressiveReveal'
export * from './questionRules'
export * from './quickAnswer'
export * from './simultaneous'
export * from './streak'
export * from './suddenDeath'
export * from './trueFalse'
