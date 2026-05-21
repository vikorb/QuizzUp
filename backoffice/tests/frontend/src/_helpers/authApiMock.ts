import { vi } from 'vitest'

type LoginPayload = {
  identifier: string
  password: string
}

type LoginSuccess = {
  ok: true
  token: string
}

type LoginFailure = {
  ok: false
  reason: string
}

export type LoginResult = LoginSuccess | LoginFailure

export const loginApiMock = vi.fn(
  async (_payload: LoginPayload): Promise<LoginResult> => ({
    ok: true,
    token: 'test-login-token',
  }),
)

export const setTokenMock = vi.fn((_token: string): void => {})

export const loginReasonToI18nKeyMock = vi.fn(
  (reason: string): string => `auth.errors.${reason}`,
)

export function mockLoginSuccess(token = 'test-login-token'): void {
  loginApiMock.mockResolvedValue({
    ok: true,
    token,
  })
}

export function mockLoginFailure(reason = 'invalid_credentials'): void {
  loginApiMock.mockResolvedValue({
    ok: false,
    reason,
  })
}

export function resetAuthApiMock(): void {
  loginApiMock.mockReset()
  setTokenMock.mockReset()
  loginReasonToI18nKeyMock.mockReset()

  loginApiMock.mockResolvedValue({
    ok: true,
    token: 'test-login-token',
  })

  loginReasonToI18nKeyMock.mockImplementation(
    (reason: string): string => `auth.errors.${reason}`,
  )
}
