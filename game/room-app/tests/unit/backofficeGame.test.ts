import type { GameState } from '@quizzup/game-engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readBackofficeGameId,
  rememberBackofficeGameId,
  reportFinishedGame,
} from '@/game/backofficeGame'
import { setDemoMode, setRoomToken } from '@/utils/auth'
import type * as RoomApi from '@/utils/roomApi'
import { finishRoomGame, RoomApiError } from '@/utils/roomApi'

vi.mock('@/utils/roomApi', async (importOriginal) => ({
  ...(await importOriginal<typeof RoomApi>()),
  finishRoomGame: vi.fn().mockResolvedValue({ id: 7 }),
}))
vi.mock('@/game/selectors', () => ({
  getLeaderboard: () => [
    { participantId: 2, podium: 3, displayName: 'B', score: 900, rank: 1, roundPoints: 0 },
    { participantId: 1, podium: 1, displayName: 'A', score: 100, rank: 2, roundPoints: 0 },
  ],
}))

const SEED = 42
const state = { setup: { seed: SEED } } as GameState

describe('fin de partie envoyée au backoffice', () => {
  beforeEach(() => {
    localStorage.clear()
    setDemoMode(false)
    setRoomToken('tok')
  })
  afterEach(() => vi.mocked(finishRoomGame).mockClear())

  it('envoie les scores par pupitre une seule fois, puis oublie la partie', async () => {
    rememberBackofficeGameId(7, SEED)

    const [first, second] = await Promise.all([
      reportFinishedGame(state),
      reportFinishedGame(state),
    ])

    expect([first, second]).toEqual([true, true])
    expect(finishRoomGame).toHaveBeenCalledOnce()
    expect(finishRoomGame).toHaveBeenCalledWith('tok', 7, [
      { podium: 3, score: 900 },
      { podium: 1, score: 100 },
    ])
    expect(readBackofficeGameId()).toBeNull()
  })

  it("n'envoie rien en mode démo, sans jeton, sans partie ou pour une autre partie", async () => {
    expect(await reportFinishedGame(state)).toBe(false)

    rememberBackofficeGameId(7, SEED + 1)
    expect(await reportFinishedGame(state)).toBe(false)

    rememberBackofficeGameId(7, SEED)
    setDemoMode(true)
    expect(await reportFinishedGame(state)).toBe(false)

    setDemoMode(false)
    setRoomToken(null)
    expect(await reportFinishedGame(state)).toBe(false)
    expect(finishRoomGame).not.toHaveBeenCalled()
    expect(readBackofficeGameId()).toBe('7')
  })

  it('relit une ancienne sauvegarde (id seul) sans rien envoyer', async () => {
    localStorage.setItem('quizzup_room_backoffice_game', '41')

    expect(readBackofficeGameId()).toBe('41')
    expect(await reportFinishedGame(state)).toBe(false)
  })

  it("garde la partie si le réseau échoue, l'oublie si le backoffice l'a close", async () => {
    rememberBackofficeGameId(7, SEED)
    vi.mocked(finishRoomGame).mockRejectedValueOnce(new Error('offline'))

    await expect(reportFinishedGame(state)).rejects.toThrow('offline')
    expect(readBackofficeGameId()).toBe('7')

    vi.mocked(finishRoomGame).mockRejectedValueOnce(new RoomApiError(409, 'game_already_over'))

    expect(await reportFinishedGame(state)).toBe(false)
    expect(readBackofficeGameId()).toBeNull()
  })
})
