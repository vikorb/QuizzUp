import type { GameState } from '@quizzup/game-engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readBackofficeGameId,
  rememberBackofficeGameId,
  reportFinishedGame,
} from '@/game/backofficeGame'
import { PENDING_FINISHES_KEY, readPendingFinishes } from '@/game/pendingFinishes'
import { setDemoMode, setRoomToken } from '@/utils/auth'
import type * as RoomApi from '@/utils/roomApi'
import { finishRoomGame, RoomApiError } from '@/utils/roomApi'

vi.mock('@/utils/roomApi', async (importOriginal) => ({
  ...(await importOriginal<typeof RoomApi>()),
  finishRoomGame: vi.fn(),
}))
vi.mock('@/game/selectors', () => ({
  getLeaderboard: () => [
    { participantId: 2, podium: 3, displayName: 'B', score: 900, rank: 1, roundPoints: 0 },
    { participantId: 1, podium: 1, displayName: 'A', score: 100, rank: 2, roundPoints: 0 },
  ],
}))

const SEED = 42
const state = { setup: { seed: SEED } } as GameState
const SCORES = [
  { podium: 3, score: 900 },
  { podium: 1, score: 100 },
]

describe('fin de partie envoyée au backoffice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    setDemoMode(false)
    setRoomToken('tok')
    vi.mocked(finishRoomGame).mockReset()
    vi.mocked(finishRoomGame).mockResolvedValue({ id: 7 } as never)
  })
  afterEach(() => vi.useRealTimers())

  it('met les scores par pupitre en file, les envoie une seule fois, puis oublie la partie', async () => {
    rememberBackofficeGameId(7, SEED)

    const first = reportFinishedGame(state)
    const second = reportFinishedGame(state)
    await vi.advanceTimersByTimeAsync(0)

    // Le second appel retrouve la même partie en file : un seul envoi, un seul état.
    expect([first, second]).toEqual([7, 7])
    expect(finishRoomGame).toHaveBeenCalledOnce()
    expect(finishRoomGame).toHaveBeenCalledWith('tok', 7, SCORES)
    expect(readBackofficeGameId()).toBeNull()
    expect(readPendingFinishes()).toEqual([])
  })

  it('oublie la partie retenue dès la mise en file et garde le rapport jusqu’à l’envoi', async () => {
    rememberBackofficeGameId(7, SEED)
    vi.mocked(finishRoomGame).mockRejectedValue(new Error('offline'))

    expect(reportFinishedGame(state)).toBe(7)
    await vi.advanceTimersByTimeAsync(0)

    expect(readBackofficeGameId()).toBeNull()
    expect(readPendingFinishes()).toEqual([{ gameId: 7, seed: SEED, scores: SCORES }])
  })

  it("n'envoie rien en mode démo, sans jeton, sans partie ou pour une autre partie", async () => {
    expect(reportFinishedGame(state)).toBeNull()

    rememberBackofficeGameId(7, SEED + 1)
    expect(reportFinishedGame(state)).toBeNull()

    rememberBackofficeGameId(7, SEED)
    setDemoMode(true)
    expect(reportFinishedGame(state)).toBeNull()

    setDemoMode(false)
    setRoomToken(null)
    expect(reportFinishedGame(state)).toBeNull()
    await vi.advanceTimersByTimeAsync(0)

    expect(finishRoomGame).not.toHaveBeenCalled()
    expect(localStorage.getItem(PENDING_FINISHES_KEY)).toBeNull()
    expect(readBackofficeGameId()).toBe('7')
  })

  it('relit une ancienne sauvegarde (id seul) sans rien envoyer', async () => {
    localStorage.setItem('quizzup_room_backoffice_game', '41')

    expect(readBackofficeGameId()).toBe('41')
    expect(reportFinishedGame(state)).toBeNull()
    await vi.advanceTimersByTimeAsync(0)
    expect(finishRoomGame).not.toHaveBeenCalled()
  })

  it('page rechargée au podium : retrouve la partie encore en file par sa graine', async () => {
    rememberBackofficeGameId(7, SEED)
    vi.mocked(finishRoomGame).mockRejectedValue(new Error('offline'))
    expect(reportFinishedGame(state)).toBe(7)
    await vi.advanceTimersByTimeAsync(0)
    expect(readBackofficeGameId()).toBeNull()
    vi.mocked(finishRoomGame).mockClear()

    expect(reportFinishedGame(state)).toBe(7)
    expect(reportFinishedGame({ setup: { seed: SEED + 1 } } as GameState)).toBeNull()
    expect(readPendingFinishes()).toHaveLength(1)
    // Aucun second rapport : un seul élément en file, pas d'envoi supplémentaire immédiat.
    expect(finishRoomGame).not.toHaveBeenCalled()
  })

  it('en démo, ne rattache pas le podium à une partie en file', () => {
    localStorage.setItem(
      PENDING_FINISHES_KEY,
      JSON.stringify([{ gameId: 7, seed: SEED, scores: [{ podium: 1, score: 1 }] }])
    )
    setDemoMode(true)

    expect(reportFinishedGame(state)).toBeNull()
  })

  it('ignore une sauvegarde illisible', () => {
    localStorage.setItem('quizzup_room_backoffice_game', '{oups')

    expect(readBackofficeGameId()).toBeNull()
    expect(reportFinishedGame(state)).toBeNull()
  })

  it('garde le rapport si le réseau est coupé et le renvoie aux délais prévus', async () => {
    rememberBackofficeGameId(7, SEED)
    vi.mocked(finishRoomGame)
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new RoomApiError(503, 'server_error'))

    reportFinishedGame(state)
    await vi.advanceTimersByTimeAsync(0)
    expect(finishRoomGame).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2000)
    expect(finishRoomGame).toHaveBeenCalledTimes(2)
    expect(readPendingFinishes()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(finishRoomGame).toHaveBeenCalledTimes(3)
    expect(finishRoomGame).toHaveBeenLastCalledWith('tok', 7, SCORES)
    expect(readPendingFinishes()).toEqual([])
  })

  it('abandonne le rapport si le backoffice a close la partie ou ne la connaît plus', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    rememberBackofficeGameId(7, SEED)
    vi.mocked(finishRoomGame).mockRejectedValueOnce(new RoomApiError(409, 'game_already_over'))

    expect(reportFinishedGame(state)).toBe(7)
    await vi.advanceTimersByTimeAsync(0)

    expect(readPendingFinishes()).toEqual([])
    expect(readBackofficeGameId()).toBeNull()

    rememberBackofficeGameId(8, SEED)
    vi.mocked(finishRoomGame).mockRejectedValueOnce(new RoomApiError(404, 'game_not_found'))
    reportFinishedGame(state)
    await vi.advanceTimersByTimeAsync(0)
    expect(readPendingFinishes()).toEqual([])
    expect(finishRoomGame).toHaveBeenCalledTimes(2)
  })

  it('garde le rapport quand une nouvelle partie démarre, puis envoie les deux dans l’ordre', async () => {
    rememberBackofficeGameId(7, SEED)
    vi.mocked(finishRoomGame).mockRejectedValue(new Error('offline'))
    reportFinishedGame(state)
    await vi.advanceTimersByTimeAsync(0)

    // Le staff lance la partie suivante : la sauvegarde de partie est remplacée.
    rememberBackofficeGameId(8, SEED + 1)
    expect(readBackofficeGameId()).toBe('8')
    expect(readPendingFinishes().map((item) => item.gameId)).toEqual([7])

    // Elle se termine à son tour, toujours hors ligne.
    reportFinishedGame({ setup: { seed: SEED + 1 } } as GameState)
    await vi.advanceTimersByTimeAsync(0)
    expect(readPendingFinishes().map((item) => item.gameId)).toEqual([7, 8])

    // Le réseau revient.
    vi.mocked(finishRoomGame).mockReset()
    vi.mocked(finishRoomGame).mockResolvedValue({ id: 1 } as never)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(vi.mocked(finishRoomGame).mock.calls.map((call) => call[1])).toEqual([7, 8])
    expect(readPendingFinishes()).toEqual([])
  })
})
