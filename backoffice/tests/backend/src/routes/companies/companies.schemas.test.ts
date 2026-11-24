import '../_helpers/registerRouteMocks'

import {
  adminParamsSchema,
  createCompanySchema,
  updateAdminSchema,
  updateCompanySchema,
} from '@backend/routes/companies/_schemas'
import {
  VOUCHER_LABEL_MAX_LENGTH,
  VOUCHER_VALIDITY_MAX_DAYS,
  VOUCHER_VALIDITY_MIN_DAYS,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

describe('routes/companies/_schemas.ts', () => {
  it('normalizes company creation input', () => {
    const parsed = createCompanySchema.parse({
      name: '  Client Test  ',
      email: '  CLIENT@TEST.FR  ',
    })

    expect(parsed).toEqual({
      name: 'Client Test',
      email: 'client@test.fr',
    })
  })

  it('rejects empty company and account update payloads', () => {
    expect(updateCompanySchema.safeParse({}).success).toBe(false)
    expect(updateAdminSchema.safeParse({}).success).toBe(false)
  })

  it('reads the voucher settings of an update: label trimmed, empty or null disables, days bounded', () => {
    expect(updateCompanySchema.parse({ voucherLabel: '  Une partie offerte  ' })).toEqual({
      voucherLabel: 'Une partie offerte',
    })
    expect(updateCompanySchema.parse({ voucherLabel: '   ' })).toEqual({ voucherLabel: null })
    expect(updateCompanySchema.parse({ voucherLabel: null })).toEqual({ voucherLabel: null })
    expect(updateCompanySchema.parse({ voucherValidityDays: 30 })).toEqual({
      voucherValidityDays: 30,
    })
  })

  it('rejects a voucher label that is too long and a validity out of bounds', () => {
    expect(
      updateCompanySchema.safeParse({ voucherLabel: 'x'.repeat(VOUCHER_LABEL_MAX_LENGTH) }).success
    ).toBe(true)
    expect(
      updateCompanySchema.safeParse({ voucherLabel: 'x'.repeat(VOUCHER_LABEL_MAX_LENGTH + 1) })
        .success
    ).toBe(false)

    for (const voucherValidityDays of [0, VOUCHER_VALIDITY_MAX_DAYS + 1, 1.5, -3, '30', null]) {
      expect(updateCompanySchema.safeParse({ voucherValidityDays }).success).toBe(false)
    }

    for (const voucherValidityDays of [VOUCHER_VALIDITY_MIN_DAYS, VOUCHER_VALIDITY_MAX_DAYS]) {
      expect(updateCompanySchema.safeParse({ voucherValidityDays }).success).toBe(true)
    }
  })

  it('counts a voucher setting, even a null label, as a change', () => {
    expect(updateCompanySchema.safeParse({ voucherLabel: null }).success).toBe(true)
    expect(updateCompanySchema.safeParse({ voucherLabel: undefined }).success).toBe(false)
  })

  it('rejects invalid admin params and roles', () => {
    expect(adminParamsSchema.safeParse({ companyId: '1', adminId: '2' }).success).toBe(true)
    expect(adminParamsSchema.safeParse({ companyId: '0', adminId: '-1' }).success).toBe(false)
    expect(updateAdminSchema.safeParse({ role: 'owner' }).success).toBe(false)
  })
})
