import { TOTP_CODE_LENGTH } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import type { MfaFailReason } from '@/types/auth'
import { INVALID_CODE_MESSAGE, mfaFailureMessage } from '@/utils/mfaMessage'

describe('utils/mfaMessage', () => {
  it.each<[MfaFailReason, string]>([
    ['totp_invalid', 'errors.totp_invalid'],
    ['mfa_challenge_invalid', 'errors.mfa_challenge_invalid'],
    ['too_many_attempts', 'errors.too_many_attempts'],
    ['too_many_requests', 'auth.errors.tooManyRequests'],
    ['totp_unavailable', 'errors.totp_unavailable'],
    ['totp_not_enrolled', 'errors.totp_not_enrolled'],
    ['totp_already_enrolled', 'errors.totp_already_enrolled'],
    ['totp_enrollment_changed', 'login.mfa.enrollmentChanged'],
    ['forbidden', 'login.mfa.forbidden'],
    ['server_error', 'errors.server_error'],
    ['api_unreachable', 'login.mfa.unreachable'],
  ])('translates %s into the key %s', (reason, key) => {
    expect(mfaFailureMessage({ ok: false, reason })).toEqual({ key, params: {} })
  })

  it('asks for the shared code length when the form is invalid', () => {
    expect(mfaFailureMessage({ ok: false, reason: 'invalid_form' })).toEqual(INVALID_CODE_MESSAGE)
    expect(INVALID_CODE_MESSAGE.params).toEqual({ length: TOTP_CODE_LENGTH })
  })

  it.each([
    [900, 15],
    [61, 2],
    [1, 1],
  ])('shows a Retry-After of %i s as %i min, rounded up', (retryAfterSeconds, minutes) => {
    expect(
      mfaFailureMessage({ ok: false, reason: 'too_many_attempts', retryAfterSeconds })
    ).toEqual({ key: 'login.mfa.retryIn', params: { minutes } })
  })
})
