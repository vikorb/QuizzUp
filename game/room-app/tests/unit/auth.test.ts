import {
  getRoomToken,
  isDemoMode,
  loginReasonToI18nKey,
  loginRoomApi,
  setDemoMode,
  setRoomToken,
} from '@/utils/auth'

type FetchMock = ReturnType<typeof vi.fn>

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('connexion du compte de salle', () => {
  let fetchMock: FetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('accepte un compte de rôle room', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt' }))
      .mockResolvedValueOnce(jsonResponse(200, { admin: { id: 9, companyId: 1, role: 'room' } }))

    const result = await loginRoomApi({ identifier: 'salle-1', password: 'x' })

    expect(result).toEqual({
      ok: true,
      token: 'jwt',
      account: { id: 9, companyId: 1, role: 'room' },
    })
    const meCall = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(meCall[0]).toMatch(/\/me$/)
    expect(new Headers(meCall[1].headers).get('Authorization')).toBe('Bearer jwt')
  })

  it('refuse un compte du staff et le déconnecte aussitôt', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt' }))
      .mockResolvedValueOnce(jsonResponse(200, { admin: { id: 1, companyId: 1, role: 'admin' } }))
      .mockResolvedValueOnce(jsonResponse(200, {}))

    const result = await loginRoomApi({ identifier: 'admin', password: 'x' })

    expect(result).toEqual({ ok: false, reason: 'not_room_account' })
    expect(String(fetchMock.mock.calls[2]?.[0])).toMatch(/\/logout$/)
  })

  it.each([
    [401, 'invalid_credentials'],
    [400, 'invalid_form'],
    [500, 'server_error'],
  ])('traduit une réponse %i en %s', async (status, reason) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, {}))
    await expect(loginRoomApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
      ok: false,
      reason,
    })
  })

  it('signale une API injoignable ou une réponse sans jeton', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(loginRoomApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
      ok: false,
      reason: 'api_unreachable',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}))
    await expect(loginRoomApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
      ok: false,
      reason: 'server_error',
    })
  })

  it('a une clé i18n pour chaque raison d’échec', () => {
    expect(loginReasonToI18nKey('not_room_account')).toBe('auth.errors.notRoomAccount')
    expect(loginReasonToI18nKey('api_unreachable')).toBe('auth.errors.apiUnreachable')
    expect(loginReasonToI18nKey('server_error')).toBe('auth.errors.serverError')
  })

  it('stocke le jeton et le mode démo à part du backoffice', () => {
    setRoomToken('jwt')
    setDemoMode(true)
    expect(getRoomToken()).toBe('jwt')
    expect(localStorage.getItem('quizzup_token')).toBeNull()
    expect(isDemoMode()).toBe(true)

    setRoomToken(null)
    setDemoMode(false)
    expect(getRoomToken()).toBeNull()
    expect(isDemoMode()).toBe(false)
  })
})
