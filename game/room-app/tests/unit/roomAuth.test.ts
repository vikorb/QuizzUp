import { PENDING_FINISHES_KEY, readPendingFinishes } from '@/game/pendingFinishes'
import {
  isRoomReady,
  refreshRoomAccount,
  roomAccount,
  signIn,
  signOut,
  syncRoomAuth,
} from '@/state/roomAuth'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('session du PC de la salle', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('déconnecte la salle si le jeton a expiré, en gardant la partie à reprendre', async () => {
    signIn('jwt', { id: 1, companyId: 1, role: 'room' })
    localStorage.setItem('quizzup_room_game', '{"version":1}')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})))

    await refreshRoomAccount()

    expect(isRoomReady.value).toBe(false)
    expect(localStorage.getItem('quizzup_room_token')).toBeNull()
    expect(localStorage.getItem('quizzup_room_game')).toBe('{"version":1}')
  })

  it('oublie la partie sauvegardée (et ses emails) à la déconnexion volontaire', async () => {
    signIn('jwt', { id: 1, companyId: 1, role: 'room' })
    localStorage.setItem('quizzup_room_game', '{"version":1}')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})))

    await signOut()

    expect(localStorage.getItem('quizzup_room_game')).toBeNull()
  })

  it('garde la salle connectée hors ligne et recharge le compte sinon', async () => {
    signIn('jwt', { id: 1, companyId: 1, role: 'room' })
    syncRoomAuth()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')))
    await refreshRoomAccount()
    expect(isRoomReady.value).toBe(true)

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { admin: { id: 1, companyId: 1, role: 'room', username: 'salle-1' } })
        )
    )
    await refreshRoomAccount()
    expect(roomAccount.value?.username).toBe('salle-1')
  })

  it('envoie les résultats de partie en attente dès que la salle se connecte', async () => {
    localStorage.setItem(
      PENDING_FINISHES_KEY,
      JSON.stringify([{ gameId: 9, seed: 1, scores: [{ podium: 2, score: 300 }] }])
    )
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { game: { id: 9 } }))
    vi.stubGlobal('fetch', fetchMock)

    signIn('jwt', { id: 1, companyId: 1, role: 'room' })
    await vi.waitFor(() => expect(readPendingFinishes()).toEqual([]))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3001/room/games/9/finish')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer jwt'
    )
  })

  it('garde les résultats en attente quand le jeton est refusé, sans réessayer en boucle', async () => {
    localStorage.setItem(
      PENDING_FINISHES_KEY,
      JSON.stringify([{ gameId: 9, seed: 1, scores: [{ podium: 2, score: 300 }] }])
    )
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }))
    vi.stubGlobal('fetch', fetchMock)

    signIn('expiré', { id: 1, companyId: 1, role: 'room' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(readPendingFinishes()).toHaveLength(1)
  })
})
