import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  VOUCHER_STATES,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { getVoucherErrorKey, readVoucherApiError } from '@/utils/voucher/errors'
import {
  canCancelVoucher,
  getVoucherHolderNames,
  getVoucherStateLabelKey,
  getVoucherStateTone,
  isVoucherState,
} from '@/utils/voucher/state'

describe('utils/voucher/state', () => {
  it('knows the four states and nothing else', () => {
    for (const state of VOUCHER_STATES) {
      expect(isVoucherState(state)).toBe(true)
    }

    expect(isVoucherState('')).toBe(false)
    expect(isVoucherState('deleted')).toBe(false)
  })

  it('has one label and one tone per state', () => {
    expect(VOUCHER_STATES.map(getVoucherStateLabelKey)).toEqual([
      'vouchers.state.valid',
      'vouchers.state.redeemed',
      'vouchers.state.expired',
      'vouchers.state.cancelled',
    ])
    expect(VOUCHER_STATES.map(getVoucherStateTone)).toEqual(['ok', 'muted', 'warn', 'danger'])
  })

  it.each([
    [ADMIN_ROLE_SUPERADMIN, 'valid', true],
    [ADMIN_ROLE_ADMIN, 'valid', true],
    [ADMIN_ROLE_ADMIN, 'expired', true],
    [ADMIN_ROLE_ADMIN, 'redeemed', false],
    [ADMIN_ROLE_ADMIN, 'cancelled', false],
    [ADMIN_ROLE_USER, 'valid', false],
    [undefined, 'valid', false],
  ] as const)('%s cancelling a %s voucher: %s', (role, state, expected) => {
    expect(canCancelVoucher(role, state)).toBe(expected)
  })

  it('joins the names of a desk', () => {
    expect(getVoucherHolderNames({ displayName: 'Team A', secondDisplayName: null })).toBe('Team A')
    expect(getVoucherHolderNames({ displayName: 'Team A', secondDisplayName: 'Alex' })).toBe(
      'Team A · Alex'
    )
  })
})

describe('utils/voucher/errors', () => {
  it('reads the known codes of an answer and ignores the others', () => {
    expect(readVoucherApiError({ error: 'voucher_expired' })).toBe('voucher_expired')
    expect(readVoucherApiError({ error: 'nope' })).toBeNull()
    expect(readVoucherApiError(null)).toBeNull()
  })

  it('builds the translation key of a code, with the server error for an unknown one', () => {
    expect(getVoucherErrorKey('voucher_already_redeemed')).toBe(
      'vouchers.errors.voucherAlreadyRedeemed'
    )
    expect(getVoucherErrorKey('voucher_expired')).toBe('vouchers.errors.voucherExpired')
    expect(getVoucherErrorKey('???')).toBe('vouchers.errors.serverError')
    expect(getVoucherErrorKey(null)).toBe('vouchers.errors.serverError')
  })

  it('keeps the disabled vouchers message for roles that can edit the settings', () => {
    expect(getVoucherErrorKey('vouchers_disabled')).toBe('vouchers.errors.vouchersDisabled')
    expect(getVoucherErrorKey('vouchers_disabled', ADMIN_ROLE_ADMIN)).toBe(
      'vouchers.errors.vouchersDisabled'
    )
    expect(getVoucherErrorKey('vouchers_disabled', ADMIN_ROLE_SUPERADMIN)).toBe(
      'vouchers.errors.vouchersDisabled'
    )
  })

  it('sends staff to an administrator when the vouchers are disabled', () => {
    expect(getVoucherErrorKey('vouchers_disabled', ADMIN_ROLE_USER)).toBe(
      'vouchers.errors.vouchersDisabledStaff'
    )
    expect(getVoucherErrorKey('voucher_expired', ADMIN_ROLE_USER)).toBe(
      'vouchers.errors.voucherExpired'
    )
  })
})
