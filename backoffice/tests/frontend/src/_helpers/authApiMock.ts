import { vi } from 'vitest'

type LoginPayload = {
  identifier: string
  password: string
}

type LoginSuccess = {
  ok: true
  token: string
}

type LoginChallenge = {
  ok: true
  mfa: 'totp' | 'enroll'
  challengeToken: string
}

type LoginFailure = {
  ok: false
  reason: string
  retryAfterSeconds?: number
}

export type LoginResult = LoginSuccess | LoginChallenge | LoginFailure

export const loginApiMock = vi.fn(async (_payload: LoginPayload): Promise<LoginResult> => ({
  ok: true,
  token: 'test-login-token',
}))

export const setTokenMock = vi.fn((_token: string): void => {})

export const loginReasonToI18nKeyMock = vi.fn((reason: string): string => `auth.errors.${reason}`)

type ChallengeArgs = { challengeToken: string }
type ChallengeCodeArgs = ChallengeArgs & { code: string }

export const loginTotpApiMock = vi.fn(
  async (_args: ChallengeCodeArgs): Promise<LoginSuccess | LoginFailure> => ({
    ok: true,
    token: 'test-totp-token',
  })
)

export const startTotpEnrollApiMock = vi.fn(
  async (
    _args: ChallengeArgs
  ): Promise<{ ok: true; secret: string; otpauthUrl: string } | LoginFailure> => ({
    ok: true,
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUrl: 'otpauth://totp/QuizzUp:root?secret=JBSWY3DPEHPK3PXP&issuer=QuizzUp',
  })
)

export const confirmTotpEnrollApiMock = vi.fn(
  async (
    _args: ChallengeCodeArgs
  ): Promise<{ ok: true; token: string; recoveryCodes: string[] } | LoginFailure> => ({
    ok: true,
    token: 'test-enroll-token',
    recoveryCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'],
  })
)

export const resetTotpApiMock = vi.fn(
  async (_args: { code: string }): Promise<{ ok: true } | LoginFailure> => ({ ok: true })
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

/** Superadmin : le serveur rend un défi (`totp` ou `enroll`) au lieu d'une session. */
export function mockLoginChallenge(mfa: 'totp' | 'enroll', challengeToken = 'challenge-jwt'): void {
  loginApiMock.mockResolvedValue({ ok: true, mfa, challengeToken })
}

export function resetAuthApiMock(): void {
  loginApiMock.mockReset()
  setTokenMock.mockReset()
  loginReasonToI18nKeyMock.mockReset()
  loginTotpApiMock.mockReset()
  startTotpEnrollApiMock.mockReset()
  confirmTotpEnrollApiMock.mockReset()
  resetTotpApiMock.mockReset()
  resetTotpApiMock.mockResolvedValue({ ok: true })

  loginApiMock.mockResolvedValue({
    ok: true,
    token: 'test-login-token',
  })

  loginReasonToI18nKeyMock.mockImplementation((reason: string): string => `auth.errors.${reason}`)

  loginTotpApiMock.mockResolvedValue({ ok: true, token: 'test-totp-token' })
  startTotpEnrollApiMock.mockResolvedValue({
    ok: true,
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUrl: 'otpauth://totp/QuizzUp:root?secret=JBSWY3DPEHPK3PXP&issuer=QuizzUp',
  })
  confirmTotpEnrollApiMock.mockResolvedValue({
    ok: true,
    token: 'test-enroll-token',
    recoveryCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'],
  })
}
