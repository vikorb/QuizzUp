import { vi } from 'vitest'

type CompanyDetailValues = {
  name: string
  email: string
  status: number
}

// saveClientDetailCompany est la seule fonction à effet de bord (appel service) :
// c'est un mock réinitialisable. Les autres exports sont des helpers purs déterministes
// réutilisés tels quels par ClientDetailForm.vue.
export const saveClientDetailCompanyMock = vi.fn()

export const companyDetailFormModuleMock = {
  createClientDetailFieldErrors: () => ({
    name: null,
    email: null,
  }),
  createClientDetailFormValues: () => ({
    name: '',
    email: '',
    status: 1,
  }),
  getClientDetailFormValues: (company: CompanyDetailValues) => ({
    name: company.name,
    email: company.email,
    status: company.status,
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
    (form.name !== company.name || form.email !== company.email || form.status !== company.status),
  saveClientDetailCompany: saveClientDetailCompanyMock,
}

export function resetCompanyDetailFormMock(): void {
  saveClientDetailCompanyMock.mockReset()
}
