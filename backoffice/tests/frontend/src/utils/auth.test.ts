import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as authUtilsModule from '@/utils/auth'

// Le setup global remplace utils/auth par un mock : on charge ici l'implémentation réelle.
const { loginApi, loginReasonToI18nKey } =
  await vi.importActual<typeof authUtilsModule>('@/utils/auth')

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

  it('returns the token on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: 'jwt' }))

    await expect(loginApi({ identifier: 'a', password: 'b' })).resolves.toEqual({
      ok: true,
      token: 'jwt',
    })
  })

  it('maps the too_many_requests reason to its own i18n key', () => {
    expect(loginReasonToI18nKey('too_many_requests')).toBe('auth.errors.tooManyRequests')
    expect(loginReasonToI18nKey('invalid_credentials')).toBe('auth.errors.invalidCredentials')
  })
})
