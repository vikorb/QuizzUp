import { vi } from 'vitest'

type CompanyDetailValues = {
  name: string
  email: string
  status: number
  voucherLabel?: string | null
  voucherValidityDays?: number
}

// saveClientDetailCompany est la seule fonction à effet de bord (appel service) :
// c'est un mock réinitialisable. Les autres exports sont des helpers purs déterministes
// réutilisés tels quels par ClientDetailForm.vue.
export const saveClientDetailCompanyMock = vi.fn()

export const companyDetailFormModuleMock = {
  createClientDetailFieldErrors: () => ({
    name: null,
    email: null,
    voucherLabel: null,
    voucherValidityDays: null,
  }),
  createClientDetailFormValues: () => ({
    name: '',
    email: '',
    status: 1,
    voucherLabel: '',
    voucherValidityDays: '90',
  }),
  getClientDetailFormValues: (company: CompanyDetailValues) => ({
    name: company.name,
    email: company.email,
    status: company.status,
    voucherLabel: company.voucherLabel ?? '',
    voucherValidityDays: String(company.voucherValidityDays ?? 90),
  }),
  getClientDetailNextStatus: (status: number) => (status === 1 ? 0 : 1),
  getClientDetailPermissions: (role: string | null) => ({
    canManageCompany: role === 'admin' || role === 'superadmin',
    canShowStatusSwitch: role === 'admin' || role === 'superadmin',
    isCompanyReadonly: role !== 'admin' && role !== 'superadmin',
  }),
  hasClientDetailCompanyChanges: (
    form: CompanyDetailValues,
    company: CompanyDetailValues,
    canManageCompany: boolean
  ) =>
    canManageCompany &&
    (form.name !== company.name ||
      form.email !== company.email ||
      form.status !== company.status ||
      (form.voucherLabel ?? '') !== (company.voucherLabel ?? '') ||
      String(form.voucherValidityDays) !== String(company.voucherValidityDays ?? 90)),
  saveClientDetailCompany: saveClientDetailCompanyMock,
}

export function resetCompanyDetailFormMock(): void {
  saveClientDetailCompanyMock.mockReset()
}
