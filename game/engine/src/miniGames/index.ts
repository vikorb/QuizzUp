import { MINI_GAME_FLASH_BLIND_TEST, type MiniGame } from '@quizzup/shared'

import { flashBlindTest, type FlashBlindTestState } from './flashBlindTest'
import type { MiniGameDefinition } from './miniGame'

/** État de la question en cours, discriminé par `kind` (un membre par mini-jeu). */
export type MiniGameState = FlashBlindTestState

/**
 * Registre des mini-jeux. Ajouter un mini-jeu : créer son module, l'ajouter ici,
 * dans `MiniGameState`, et dans `MINI_GAMES` de `@quizzup/shared` (+ migration CHECK).
 */
export const MINI_GAME_DEFINITIONS: Record<MiniGame, MiniGameDefinition<MiniGameState>> = {
  [MINI_GAME_FLASH_BLIND_TEST]: flashBlindTest,
}

export * from './flashBlindTest'
export type { MiniGameDefinition, QuestionStep } from './miniGame'
