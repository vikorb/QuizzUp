import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as authUtilsModule from '@/utils/auth'

// Le setup global remplace utils/auth par un mock : on charge ici l'implémentation réelle.
const {
  confirmTotpEnrollApi,
  loginApi,
  loginReasonToI18nKey,
  loginTotpApi,
  resetTotpApi,
  startTotpEnrollApi,
} = await vi.importActual<typeof authUtilsModule>('@/utils/auth')

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('utils/auth — connexion', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([
    [401, 'invalid_credentials'],
    [400, 'invalid_form'],
    [429, 'too_many_requests'],
    [500, 'server_error'],
  ])('translates a %i response into %s', async (status, reason) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, {}))

    await expect(loginApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
      ok: false,
      reason,
    })
  })

  it('reports the second factor as unavailable only when a 503 carries that code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: 'totp_unavailable' }))

    await expect(loginApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
      ok: false,
      reason: 'totp_unavailable',
    })
  })

  it.each([
    ['an empty JSON body', () => jsonResponse(503, {})],
    ['another code', () => jsonResponse(503, { error: 'maintenance' })],
    ['a body that is not JSON', () => new Response('<html>Bad gateway</html>', { status: 503 })],
  ])('treats a 503 with %s as a server error', async (_label, response) => {
    fetchMock.mockResolvedValueOnce(response())

    await expect(loginApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
      ok: false,
      reason: 'server_error',
    })
  })

  it('returns the token on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: 'jwt' }))

    await expect(loginApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
      ok: true,
      token: 'jwt',
    })
  })

  it.each(['totp', 'enroll'])(
    'returns the challenge of a superadmin (%s) and no token',
    async (mfa) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { mfa, challengeToken: 'challenge-jwt' }))

      await expect(loginApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
        ok: true,
        mfa,
        challengeToken: 'challenge-jwt',
      })
    }
  )

  it.each([[{ mfa: 'totp' }], [{ mfa: 'unknown', challengeToken: 'x' }], [{}]])(
    'rejects a 200 answer that has neither a session nor a usable challenge (%j)',
    async (body) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, body))

      await expect(loginApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
        ok: false,
        reason: 'missing_token',
      })
    }
  )

  it('maps the too_many_requests reason to its own i18n key', () => {
    expect(loginReasonToI18nKey('too_many_requests')).toBe('auth.errors.tooManyRequests')
    expect(loginReasonToI18nKey('invalid_credentials')).toBe('auth.errors.invalidCredentials')
  })

  it('maps the unavailable second factor to an existing error key', () => {
    expect(loginReasonToI18nKey('totp_unavailable')).toBe('errors.totp_unavailable')
  })
})

describe('utils/auth — deuxième facteur du superadmin', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('sends the challenge and the code in the body only, never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: 'jwt', admin: {} }))

    await expect(
      loginTotpApi({ challengeToken: 'challenge-jwt', code: '123456' })
    ).resolves.toEqual({ ok: true, token: 'jwt' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/login\/totp$/)
    expect(url).not.toContain('challenge-jwt')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      challengeToken: 'challenge-jwt',
      code: '123456',
    })
  })

  it('starts the enrollment and returns the secret', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x' })
    )

    await expect(startTotpEnrollApi({ challengeToken: 'challenge-jwt' })).resolves.toEqual({
      ok: true,
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUrl: 'otpauth://totp/x',
    })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/login\/totp\/enroll$/)
  })

  it('confirms the enrollment and returns the token and the recovery codes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { token: 'jwt', admin: {}, recoveryCodes: ['aaaaa-bbbbb'] })
    )

    await expect(
      confirmTotpEnrollApi({ challengeToken: 'challenge-jwt', code: '123456' })
    ).resolves.toEqual({ ok: true, token: 'jwt', recoveryCodes: ['aaaaa-bbbbb'] })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/login\/totp\/enroll\/confirm$/)
  })

  it.each([
    ['without any field', {}],
    ['with a secret but no link', { secret: 'ABC' }],
  ])('treats an incomplete enrollment answer as a server error (%s)', async (_label, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body))

    await expect(startTotpEnrollApi({ challengeToken: 'c' })).resolves.toEqual({
      ok: false,
      reason: 'server_error',
    })
  })

  it('treats recovery codes that are not strings as a server error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: 'jwt', recoveryCodes: [1, 2] }))

    await expect(confirmTotpEnrollApi({ challengeToken: 'c', code: '123456' })).resolves.toEqual({
      ok: false,
      reason: 'server_error',
    })
  })

  it.each([
    [400, { error: 'invalid_body' }, 'invalid_form'],
    [401, { error: 'totp_invalid' }, 'totp_invalid'],
    [401, { error: 'mfa_challenge_invalid' }, 'mfa_challenge_invalid'],
    [401, { error: 'something_new' }, 'totp_invalid'],
    [401, null, 'totp_invalid'],
    [403, { error: 'forbidden' }, 'forbidden'],
    [409, { error: 'totp_not_enrolled' }, 'totp_not_enrolled'],
    [409, { error: 'totp_already_enrolled' }, 'totp_already_enrolled'],
    [409, { error: 'totp_enrollment_changed' }, 'totp_enrollment_changed'],
    [409, { error: 'something_new' }, 'server_error'],
    [429, { error: 'too_many_attempts' }, 'too_many_attempts'],
    [429, { error: 'too_many_requests' }, 'too_many_requests'],
    [429, {}, 'too_many_requests'],
    [503, { error: 'totp_unavailable' }, 'totp_unavailable'],
    [503, {}, 'server_error'],
    [503, { error: 'maintenance' }, 'server_error'],
    [500, { error: 'server_error' }, 'server_error'],
  ])('translates %i %j into %s', async (status, body, reason) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, body))

    await expect(loginTotpApi({ challengeToken: 'c', code: '123456' })).resolves.toEqual({
      ok: false,
      reason,
    })
  })

  it('treats a 503 whose body is not JSON as a server error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 503 }))

    await expect(loginTotpApi({ challengeToken: 'c', code: '123456' })).resolves.toEqual({
      ok: false,
      reason: 'server_error',
    })
  })

  it('keeps the Retry-After delay of a lock-out', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: 'too_many_attempts' }, { 'Retry-After': '900' })
    )

    await expect(loginTotpApi({ challengeToken: 'c', code: '123456' })).resolves.toEqual({
      ok: false,
      reason: 'too_many_attempts',
      retryAfterSeconds: 900,
    })
  })

  it('ignores a Retry-After that is not a number of seconds', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        429,
        { error: 'too_many_attempts' },
        { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }
      )
    )

    await expect(loginTotpApi({ challengeToken: 'c', code: '123456' })).resolves.toEqual({
      ok: false,
      reason: 'too_many_attempts',
    })
  })

  it('reports an unreachable API', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'))

    await expect(startTotpEnrollApi({ challengeToken: 'c' })).resolves.toEqual({
      ok: false,
      reason: 'api_unreachable',
    })
  })

  describe('resetTotpApi', () => {
    it('deletes the second factor with the session token and the code in the body', async () => {
      localStorage.setItem('quizzup_token', 'session-jwt')
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

      await expect(resetTotpApi({ code: '123456' })).resolves.toEqual({ ok: true })

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toMatch(/\/me\/totp$/)
      expect(init.method).toBe('DELETE')
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer session-jwt')
      expect(JSON.parse(init.body as string)).toEqual({ code: '123456' })
      localStorage.removeItem('quizzup_token')
    })

    it.each([
      [401, { error: 'totp_invalid' }, 'totp_invalid'],
      [409, { error: 'totp_not_enrolled' }, 'totp_not_enrolled'],
      [403, { error: 'forbidden' }, 'forbidden'],
      [503, { error: 'totp_unavailable' }, 'totp_unavailable'],
      [503, {}, 'server_error'],
      [500, null, 'server_error'],
    ])('maps %i %j to %s', async (status, body, reason) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, body))

      await expect(resetTotpApi({ code: '123456' })).resolves.toEqual({ ok: false, reason })
    })

    it.each([
      ['unauthorized'],
      ['session_invalid'],
      ['session_expired_inactive'],
      ['account_inactive'],
    ])('reports a 401 %s as the end of the session, not as a wrong code', async (error) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { error }))

      await expect(resetTotpApi({ code: '123456' })).resolves.toEqual({
        ok: false,
        reason: 'session_ended',
      })
    })

    it('reports a 401 without a readable body as the end of the session', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))

      await expect(resetTotpApi({ code: '123456' })).resolves.toEqual({
        ok: false,
        reason: 'session_ended',
      })
    })

    it('keeps the lock-out delay', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, { error: 'too_many_attempts' }, { 'Retry-After': '900' })
      )

      await expect(resetTotpApi({ code: '123456' })).resolves.toEqual({
        ok: false,
        reason: 'too_many_attempts',
        retryAfterSeconds: 900,
      })
    })

    it('reports an unreachable API', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('network'))

      await expect(resetTotpApi({ code: '123456' })).resolves.toEqual({
        ok: false,
        reason: 'api_unreachable',
      })
    })
  })
})
