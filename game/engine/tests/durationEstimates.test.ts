import { DEFAULT_GAME_TIMINGS } from '@engine/engine'
import { getMiniGameDefinition } from '@engine/miniGames'
import {
  DOUBLE_OR_NOTHING_ANSWER_MS,
  DOUBLE_OR_NOTHING_BET_MS,
} from '@engine/miniGames/doubleOrNothing'
import { ESTIMATE_DURATION_MS } from '@engine/miniGames/estimate'
import { FIRST_BUZZ_WINDOW_MS } from '@engine/miniGames/firstBuzz'
import {
  FLASH_BLIND_TEST_BUZZ_WINDOW_MS,
  FLASH_BLIND_TEST_STAGE_DURATIONS_MS,
} from '@engine/miniGames/flashBlindTest'
import { POINT_STEAL_ANSWER_MS, POINT_STEAL_TARGET_MS } from '@engine/miniGames/pointSteal'
import { PROGRESSIVE_REVEAL_WINDOW_MS } from '@engine/miniGames/progressiveReveal'
import { QUICK_ANSWER_DURATION_MS } from '@engine/miniGames/quickAnswer'
import { STREAK_DURATION_MS } from '@engine/miniGames/streak'
import { SUDDEN_DEATH_DURATION_MS } from '@engine/miniGames/suddenDeath'
import { TRUE_FALSE_DURATION_MS } from '@engine/miniGames/trueFalse'
import {
  GAME_DEFAULT_TIMINGS_MS,
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_ESTIMATE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_QUESTION_ESTIMATES_MS,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_STREAK,
  MINI_GAME_SUDDEN_DEATH,
  MINI_GAME_TRUE_FALSE,
  MINI_GAMES,
  type MiniGame,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

/**
 * Contrat avec `MINI_GAME_QUESTION_ESTIMATES_MS` (durée estimée d'une partie) : pour chaque
 * mini-jeu, l'estimation haute couvre toutes les échéances du moteur atteintes, sans mauvaise
 * réponse. Le `Record` impose une ligne par nouveau mini-jeu.
 */
const PLAYING_MS: Record<MiniGame, number> = {
  [MINI_GAME_FLASH_BLIND_TEST]: FLASH_BLIND_TEST_STAGE_DURATIONS_MS.reduce(
    (sum, stageMs) => sum + stageMs + FLASH_BLIND_TEST_BUZZ_WINDOW_MS,
    0
  ),
  [MINI_GAME_QUICK_ANSWER]: QUICK_ANSWER_DURATION_MS,
  [MINI_GAME_FIRST_BUZZ]: FIRST_BUZZ_WINDOW_MS,
  [MINI_GAME_TRUE_FALSE]: TRUE_FALSE_DURATION_MS,
  [MINI_GAME_DOUBLE_OR_NOTHING]: DOUBLE_OR_NOTHING_BET_MS + DOUBLE_OR_NOTHING_ANSWER_MS,
  [MINI_GAME_SUDDEN_DEATH]: SUDDEN_DEATH_DURATION_MS,
  [MINI_GAME_POINT_STEAL]: POINT_STEAL_TARGET_MS + POINT_STEAL_ANSWER_MS,
  [MINI_GAME_STREAK]: STREAK_DURATION_MS,
  [MINI_GAME_ESTIMATE]: ESTIMATE_DURATION_MS,
  [MINI_GAME_PROGRESSIVE_REVEAL]: PROGRESSIVE_REVEAL_WINDOW_MS,
}

describe('délais par défaut du moteur', () => {
  it('sont ceux de @quizzup/shared', () => {
    expect(DEFAULT_GAME_TIMINGS).toEqual(GAME_DEFAULT_TIMINGS_MS)
  })

  it('ne partagent pas l’objet de shared (une modification locale ne le touche pas)', () => {
    expect(DEFAULT_GAME_TIMINGS).not.toBe(GAME_DEFAULT_TIMINGS_MS)
  })
})

describe('estimations de durée par mini-jeu', () => {
  it.each(MINI_GAMES)('%s : l’estimation haute couvre le calcul fait depuis le moteur', (id) => {
    const revealMs = getMiniGameDefinition(id).revealMs ?? DEFAULT_GAME_TIMINGS.revealMs

    expect(MINI_GAME_QUESTION_ESTIMATES_MS[id].highMs).toBeGreaterThanOrEqual(
      PLAYING_MS[id] + revealMs
    )
  })

  it.each(MINI_GAMES)('%s : le typique ne dépasse pas le haut et dépasse la révélation', (id) => {
    const { typicalMs, highMs } = MINI_GAME_QUESTION_ESTIMATES_MS[id]
    const revealMs = getMiniGameDefinition(id).revealMs ?? DEFAULT_GAME_TIMINGS.revealMs

    expect(typicalMs).toBeLessThanOrEqual(highMs)
    expect(typicalMs).toBeGreaterThan(revealMs)
  })

  it('a une ligne par mini-jeu du moteur', () => {
    expect([...Object.keys(MINI_GAME_QUESTION_ESTIMATES_MS)].sort()).toEqual([...MINI_GAMES].sort())
  })
})
