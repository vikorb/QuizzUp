import {
  MINI_GAME_ESTIMATE,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_QUICK_ANSWER,
} from '@quizzup/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MINI_GAMES_STORAGE_KEY,
  readMiniGamesSetting,
  sanitizeMiniGames,
} from '@/game/miniGamesSetting'

describe('readMiniGamesSetting', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('returns undefined (every mini-game) when nothing is stored', () => {
    expect(readMiniGamesSetting()).toBeUndefined()
  })

  it('keeps the known mini-games, in the engine order', () => {
    localStorage.setItem(
      MINI_GAMES_STORAGE_KEY,
      JSON.stringify([MINI_GAME_ESTIMATE, 'unknown', MINI_GAME_FLASH_BLIND_TEST])
    )
    expect(readMiniGamesSetting()).toEqual([MINI_GAME_FLASH_BLIND_TEST, MINI_GAME_ESTIMATE])
  })

  it.each(['not json', '{}', '[]', '["unknown"]', '"quick_answer"'])(
    'ignores an unusable value %s',
    (raw) => {
      localStorage.setItem(MINI_GAMES_STORAGE_KEY, raw)
      expect(readMiniGamesSetting()).toBeUndefined()
    }
  )

  it('ignores an unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readMiniGamesSetting()).toBeUndefined()
  })

  it('reads a single mini-game', () => {
    localStorage.setItem(MINI_GAMES_STORAGE_KEY, JSON.stringify([MINI_GAME_QUICK_ANSWER]))
    expect(readMiniGamesSetting()).toEqual([MINI_GAME_QUICK_ANSWER])
  })
})

describe('sanitizeMiniGames', () => {
  it('keeps the known mini-games, in the engine order and without duplicates', () => {
    expect(
      sanitizeMiniGames([
        MINI_GAME_ESTIMATE,
        'unknown',
        MINI_GAME_FLASH_BLIND_TEST,
        MINI_GAME_ESTIMATE,
      ])
    ).toEqual([MINI_GAME_FLASH_BLIND_TEST, MINI_GAME_ESTIMATE])
  })

  it.each([[undefined], [null], [[]], [['unknown']], ['quick_answer'], [{}], [42]])(
    'returns undefined (every mini-game) for %j',
    (value) => {
      expect(sanitizeMiniGames(value)).toBeUndefined()
    }
  )
})
