import { COMPANY_STATUS_ACTIVE } from '@quizzup/shared'

import type { Company, EditCompanyFormValues } from '@/types/company'

export function createCompanyDetailsForm(): EditCompanyFormValues {
  return {
    name: '',
    email: '',
    status: COMPANY_STATUS_ACTIVE,
  }
}

export function getCompanyDetailsFormValues(company: Company): EditCompanyFormValues {
  return {
    name: company.name,
    email: company.email,
    status: company.status,
  }
}

export function hasCompanyDetailsChanges(
  form: EditCompanyFormValues,
  company: Company | null,
  canManageCompany: boolean,
): boolean {
  if (!company || !canManageCompany) {
    return false
  }

  return (
    form.name.trim() !== company.name ||
    form.email.trim().toLowerCase() !== company.email.toLowerCase() ||
    form.status !== company.status
  )
}
