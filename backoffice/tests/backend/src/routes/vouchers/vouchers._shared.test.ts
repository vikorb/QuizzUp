import '../_helpers/registerDbMock'

import { randomBytes } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { VOUCHER_CODE_ALPHABET, VOUCHER_CODE_PATTERN } from '@quizzup/shared'
import { generateVoucherCode, toVoucherRow, voucherUrl } from '@backend/routes/vouchers/_shared'

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()

  return { ...actual, randomBytes: vi.fn(actual.randomBytes) }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(randomBytes).mockReset()
})

describe('generateVoucherCode', () => {
  it('turns the 40 random bits into 8 symbols, 5 bits each, big end first', () => {
    vi.mocked(randomBytes).mockReturnValueOnce(Buffer.from([0, 0, 0, 0, 0]) as never)
    expect(generateVoucherCode()).toBe('0000-0000')

    vi.mocked(randomBytes).mockReturnValueOnce(Buffer.from([255, 255, 255, 255, 255]) as never)
    expect(generateVoucherCode()).toBe('ZZZZ-ZZZZ')

    // 0b00001_00010_00011_00100_00101_00110_00111_01000 : symboles 1 2 3 4 5 6 7 8.
    vi.mocked(randomBytes).mockReturnValueOnce(Buffer.from([0x08, 0x86, 0x42, 0x98, 0xe8]) as never)
    expect(generateVoucherCode()).toBe('1234-5678')
  })

  it('asks the system generator for 5 bytes', () => {
    generateVoucherCode()

    expect(randomBytes).toHaveBeenCalledWith(5)
  })

  it('draws codes that match the stored pattern, all different', () => {
    vi.mocked(randomBytes).mockRestore()

    const codes = new Set(Array.from({ length: 200 }, () => generateVoucherCode()))

    expect(codes.size).toBe(200)

    for (const code of codes) {
      expect(code).toMatch(VOUCHER_CODE_PATTERN)
    }
  })

  it('uses every symbol of the alphabet and only them', () => {
    vi.mocked(randomBytes).mockRestore()

    const seen = new Set<string>()

    for (let index = 0; index < 400; index += 1) {
      for (const symbol of generateVoucherCode().replace('-', '')) {
        seen.add(symbol)
      }
    }

    expect([...seen].sort().join('')).toBe(VOUCHER_CODE_ALPHABET)
  })
})

describe('voucherUrl', () => {
  it('puts the code after the hash, so that it never reaches a server log', () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test')

    expect(voucherUrl('7K2M-9QXD')).toBe('https://bo.quizzup.test/bon/#7K2M-9QXD')
  })

  it('drops trailing slashes and surrounding spaces of the base', () => {
    vi.stubEnv('PUBLIC_APP_URL', '  https://bo.quizzup.test//  ')

    expect(voucherUrl('7K2M-9QXD')).toBe('https://bo.quizzup.test/bon/#7K2M-9QXD')
  })

  it('is null while no public address is set', () => {
    vi.stubEnv('PUBLIC_APP_URL', '')
    expect(voucherUrl('7K2M-9QXD')).toBeNull()

    vi.stubEnv('PUBLIC_APP_URL', '   ')
    expect(voucherUrl('7K2M-9QXD')).toBeNull()
  })
})

describe('toVoucherRow', () => {
  it('replaces the status by the computed state and adds the url', () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://bo.quizzup.test')

    const row = toVoucherRow(
      {
        id: 1,
        code: '7K2M-9QXD',
        status: 1,
        redeemedAt: null,
        expiresAt: new Date('2027-04-10T08:00:00.000Z'),
      },
      new Date('2027-03-10T08:00:00.000Z')
    )

    expect(row).toEqual({
      id: 1,
      code: '7K2M-9QXD',
      redeemedAt: null,
      expiresAt: new Date('2027-04-10T08:00:00.000Z'),
      state: 'valid',
      url: 'https://bo.quizzup.test/bon/#7K2M-9QXD',
    })
    expect(row).not.toHaveProperty('status')
  })
})
