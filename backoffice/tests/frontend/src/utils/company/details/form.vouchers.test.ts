import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as CompanyDetailsForm from '@/utils/company/details/form'

const updateCompanyServiceMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/companiesService', () => ({
  updateCompanyService: updateCompanyServiceMock,
}))

// Le module est moqué globalement pour les composants : ici on teste les vrais réglages des bons.
const form = await vi.importActual<typeof CompanyDetailsForm>('@/utils/company/details/form')

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as Parameters<
  typeof form.saveClientDetailCompany
>[2]

const company = {
  id: 1,
  name: 'Acme Corp',
  email: 'contact@acme.test',
  status: COMPANY_STATUS_ACTIVE,
}

function values(overrides: Partial<ReturnType<typeof form.getClientDetailFormValues>> = {}) {
  return { ...form.getClientDetailFormValues(company), ...overrides }
}

beforeEach(() => {
  updateCompanyServiceMock.mockReset()
  updateCompanyServiceMock.mockResolvedValue({ ok: true, status: 200, data: { company } })
})

describe('utils/company/details/form — voucher settings', () => {
  it('reads the saved settings, or off with the default validity', () => {
    expect(form.getClientDetailFormValues(company)).toMatchObject({
      voucherLabel: '',
      voucherValidityDays: '90',
    })
    expect(
      form.getClientDetailFormValues({
        ...company,
        voucherLabel: 'Une partie offerte',
        voucherValidityDays: 45,
      })
    ).toMatchObject({ voucherLabel: 'Une partie offerte', voucherValidityDays: '45' })
  })

  it('detects a change of the label or of the validity, and only for those who can manage', () => {
    const saved = { ...company, voucherLabel: 'Une partie offerte', voucherValidityDays: 45 }
    const unchanged = form.getClientDetailFormValues(saved)

    expect(form.hasClientDetailCompanyChanges(unchanged, saved, true)).toBe(false)
    expect(
      form.hasClientDetailCompanyChanges({ ...unchanged, voucherLabel: 'Autre' }, saved, true)
    ).toBe(true)
    expect(
      form.hasClientDetailCompanyChanges({ ...unchanged, voucherValidityDays: '46' }, saved, true)
    ).toBe(true)
    expect(
      form.hasClientDetailCompanyChanges({ ...unchanged, voucherLabel: 'Autre' }, saved, false)
    ).toBe(false)
  })

  it('sends the label and the validity as a number', async () => {
    const result = await form.saveClientDetailCompany(
      1,
      values({ voucherLabel: '  Une partie offerte ', voucherValidityDays: ' 30 ' }),
      t
    )

    expect(result.ok).toBe(true)
    expect(updateCompanyServiceMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ voucherLabel: 'Une partie offerte', voucherValidityDays: 30 })
    )
  })

  it('sends a null label when it is emptied, which turns vouchers off', async () => {
    await form.saveClientDetailCompany(1, values({ voucherLabel: '   ' }), t)

    expect(updateCompanyServiceMock.mock.calls[0]?.[1]).toMatchObject({ voucherLabel: null })
  })

  it.each(['0', '731', '1.5', 'abc', ''])(
    'refuses the validity %j without calling the API',
    async (days) => {
      const result = await form.saveClientDetailCompany(1, values({ voucherValidityDays: days }), t)

      expect(result).toMatchObject({
        ok: false,
        fieldErrors: {
          voucherValidityDays: expect.stringContaining('vouchers.settings.invalidValidity'),
        },
      })
      expect(updateCompanyServiceMock).not.toHaveBeenCalled()
    }
  )

  it.each(['1', '730'])('accepts the validity bound %s', async (days) => {
    const result = await form.saveClientDetailCompany(1, values({ voucherValidityDays: days }), t)

    expect(result.ok).toBe(true)
  })

  it('refuses a label longer than the limit', async () => {
    const result = await form.saveClientDetailCompany(
      1,
      values({ voucherLabel: 'x'.repeat(121) }),
      t
    )

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { voucherLabel: expect.stringContaining('vouchers.settings.labelTooLong') },
    })
    expect(updateCompanyServiceMock).not.toHaveBeenCalled()
  })
})
