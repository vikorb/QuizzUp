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
})
