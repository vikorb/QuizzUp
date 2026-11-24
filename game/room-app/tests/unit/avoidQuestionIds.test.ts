import { MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'

import { createSilentExtractPlayer } from '@/audio/player'
import { createMemorySessionStorage } from '@/game/session'
import {
  closeGame,
  configureRoomGame,
  resumeSavedGame,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'
import { setDemoMode } from '@/utils/auth'

import { createManualClock, getPlayableThemes, REGISTRATIONS } from '../_helpers/fixtures'

const start = (avoidQuestionIds?: number[]) =>
  startNewGame({
    registrations: REGISTRATIONS,
    themes: getPlayableThemes(),
    seed: 7,
    miniGames: [MINI_GAME_FLASH_BLIND_TEST],
    avoidQuestionIds,
  })

describe('useRoomGame : questions déjà vues (lot 8e)', () => {
  beforeEach(() => {
    configureRoomGame({
      storage: createMemorySessionStorage(),
      player: createSilentExtractPlayer(),
      now: createManualClock().now,
    })
    setDemoMode(true)
  })

  afterEach(() => {
    closeGame()
    setDemoMode(false)
    localStorage.clear()
  })

  it('hands the received list to the engine, which counts those questions as already asked', () => {
    start([3, 5, 3])

    expect(useRoomGame().state.value?.setup.avoidQuestionIds).toEqual([3, 5])
  })

  it('leaves the game unchanged without a list, as with an older backoffice', () => {
    start()

    expect(useRoomGame().state.value?.setup.avoidQuestionIds).toEqual([])
  })

  it('keeps the list when the saved game is resumed after a reload', async () => {
    start([3, 5])

    // La session rechargée rejoue ses commandes depuis le setup sauvegardé, liste comprise.
    expect(await resumeSavedGame()).toBe(true)
    expect(useRoomGame().state.value?.setup.avoidQuestionIds).toEqual([3, 5])
  })
})
