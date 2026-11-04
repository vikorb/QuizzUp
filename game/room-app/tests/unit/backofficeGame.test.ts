import type { GameState } from '@quizzup/game-engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readBackofficeGameId,
  rememberBackofficeGameId,
  reportFinishedGame,
} from '@/game/backofficeGame'
import { setDemoMode, setRoomToken } from '@/utils/auth'
import { finishRoomGame } from '@/utils/roomApi'

vi.mock('@/utils/roomApi', () => ({ finishRoomGame: vi.fn().mockResolvedValue({ id: 7 }) }))
vi.mock('@/game/selectors', () => ({
  getLeaderboard: () => [
    { participantId: 2, podium: 3, displayName: 'B', score: 900, rank: 1, roundPoints: 0 },
    { participantId: 1, podium: 1, displayName: 'A', score: 100, rank: 2, roundPoints: 0 },
  ],
}))

const state = {} as GameState

describe('fin de partie envoyée au backoffice', () => {
  beforeEach(() => {
    localStorage.clear()
    setDemoMode(false)
    setRoomToken('tok')
  })
  afterEach(() => vi.mocked(finishRoomGame).mockClear())

  it('envoie les scores par pupitre puis oublie la partie', async () => {
    rememberBackofficeGameId(7)

    expect(await reportFinishedGame(state)).toBe(true)
    expect(finishRoomGame).toHaveBeenCalledWith('tok', 7, [
      { podium: 3, score: 900 },
      { podium: 1, score: 100 },
    ])
    expect(readBackofficeGameId()).toBeNull()
  })

  it("n'envoie rien en mode démo, sans jeton ou sans partie du backoffice", async () => {
    expect(await reportFinishedGame(state)).toBe(false)

    rememberBackofficeGameId(7)
    setDemoMode(true)
    expect(await reportFinishedGame(state)).toBe(false)

    setDemoMode(false)
    setRoomToken(null)
    expect(await reportFinishedGame(state)).toBe(false)
    expect(finishRoomGame).not.toHaveBeenCalled()
    expect(readBackofficeGameId()).toBe('7')
  })

  it("garde la partie si l'envoi échoue", async () => {
    rememberBackofficeGameId(7)
    vi.mocked(finishRoomGame).mockRejectedValueOnce(new Error('offline'))

    await expect(reportFinishedGame(state)).rejects.toThrow('offline')
    expect(readBackofficeGameId()).toBe('7')
  })
})
