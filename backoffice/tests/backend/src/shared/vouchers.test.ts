import {
  formatVoucherCode,
  getVoucherState,
  normalizeVoucherCode,
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_LENGTH,
  VOUCHER_CODE_PATTERN,
  VOUCHER_STATUS_ACTIVE,
  VOUCHER_STATUS_DELETED,
  VOUCHER_STATUS_INACTIVE,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

describe('normalizeVoucherCode', () => {
  it.each([
    ['7K2M-9QXD', '7K2M9QXD'],
    ['7k2m-9qxd', '7K2M9QXD'],
    ['  7k2m 9qxd\n', '7K2M9QXD'],
    ['7K2M9QXD', '7K2M9QXD'],
    ['7K2M--9QXD', '7K2M9QXD'],
    ['OOOO-OOOO', '00000000'],
    ['IIII-LLLL', '11111111'],
    ['oi1l-0o', '011100'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeVoucherCode(input)).toBe(expected)
  })

  it('leaves the letter U alone: it is not part of the alphabet and must stay refused', () => {
    expect(normalizeVoucherCode('UUUU-UUUU')).toBe('UUUUUUUU')
  })
})

describe('formatVoucherCode', () => {
  it.each([
    ['7K2M-9QXD', '7K2M-9QXD'],
    ['7k2m9qxd', '7K2M-9QXD'],
    ['7k2m 9qxd', '7K2M-9QXD'],
    ['oo11-OOLL', '0011-0011'],
  ])('%j -> %j', (input, expected) => {
    expect(formatVoucherCode(input)).toBe(expected)
  })

  it.each([
    ['empty', ''],
    ['too short', '7K2M-9QX'],
    ['too long', '7K2M-9QXD0'],
    ['letter U', '7K2M-9QXU'],
    ['symbol', '7K2M-9QX!'],
    ['accent', '7K2M-9QXÉ'],
    ['only separators', '- - -'],
  ])('refuses %s', (_label, input) => {
    expect(formatVoucherCode(input)).toBeNull()
  })

  it('always gives a code that matches the stored pattern', () => {
    for (const input of ['7K2M-9QXD', 'abcd1234', 'zzzz zzzz', '0000-0000']) {
      expect(formatVoucherCode(input)).toMatch(VOUCHER_CODE_PATTERN)
    }
  })
})

describe('voucher code constants', () => {
  it('has 32 distinct symbols, none of the ambiguous ones, and a pattern that accepts exactly them', () => {
    expect(VOUCHER_CODE_ALPHABET).toHaveLength(32)
    expect(new Set(VOUCHER_CODE_ALPHABET).size).toBe(32)

    for (const forbidden of 'ILOU') {
      expect(VOUCHER_CODE_ALPHABET).not.toContain(forbidden)
      expect(VOUCHER_CODE_PATTERN.test(`${forbidden}AAA-AAAA`)).toBe(false)
    }

    for (const symbol of VOUCHER_CODE_ALPHABET) {
      expect(VOUCHER_CODE_PATTERN.test(`${symbol.repeat(4)}-${symbol.repeat(4)}`)).toBe(true)
    }

    expect(VOUCHER_CODE_LENGTH).toBe(8)
  })
})

describe('getVoucherState', () => {
  const now = new Date('2027-03-10T08:00:00.000Z')
  const future = '2027-04-10T08:00:00.000Z'
  const past = '2027-03-01T08:00:00.000Z'
  const base = { status: VOUCHER_STATUS_ACTIVE, redeemedAt: null, expiresAt: future }

  it('is valid before the end date', () => {
    expect(getVoucherState(base, now)).toBe('valid')
  })

  it('is expired from the end date on (the end instant is not valid any more)', () => {
    expect(getVoucherState({ ...base, expiresAt: now }, now)).toBe('expired')
    expect(getVoucherState({ ...base, expiresAt: past }, now)).toBe('expired')
    expect(getVoucherState({ ...base, expiresAt: new Date(now.getTime() + 1) }, now)).toBe('valid')
  })

  it('is redeemed once used, even after the end date', () => {
    expect(getVoucherState({ ...base, redeemedAt: past }, now)).toBe('redeemed')
    expect(getVoucherState({ ...base, redeemedAt: past, expiresAt: past }, now)).toBe('redeemed')
  })

  it('is cancelled whatever the rest: cancelled wins over used and expired', () => {
    expect(getVoucherState({ ...base, status: VOUCHER_STATUS_INACTIVE }, now)).toBe('cancelled')
    expect(
      getVoucherState({ status: VOUCHER_STATUS_INACTIVE, redeemedAt: past, expiresAt: past }, now)
    ).toBe('cancelled')
    expect(getVoucherState({ ...base, status: VOUCHER_STATUS_DELETED }, now)).toBe('cancelled')
  })

  it('reads the dates as text too, as they come out of JSON', () => {
    expect(getVoucherState({ ...base, redeemedAt: past }, now)).toBe('redeemed')
    expect(getVoucherState(base, now)).toBe('valid')
  })

  it('uses the current time when none is given', () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

    expect(getVoucherState({ ...base, expiresAt: farFuture })).toBe('valid')
    expect(getVoucherState({ ...base, expiresAt: new Date(0) })).toBe('expired')
  })
})
