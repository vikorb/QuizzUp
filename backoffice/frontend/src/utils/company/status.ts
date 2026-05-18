import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  type CompanyStatus,
} from '@quizzup/shared'

import type { CompanySwitchStatus } from '@/types/company'

export function isCompanyStatus(value: unknown): value is CompanyStatus {
  const status = Number(value)

  return (
    status === COMPANY_STATUS_INACTIVE ||
    status === COMPANY_STATUS_ACTIVE ||
    status === COMPANY_STATUS_DELETED
  )
}

export function toCompanyStatus(value: unknown): CompanyStatus | null {
  const status = Number(value)

  return isCompanyStatus(status) ? status : null
}

export function getCompanyUpdateSuccessCode(status: CompanyStatus | null): string {
  if (status === COMPANY_STATUS_ACTIVE) {
    return 'companyActivated'
  }

  if (status === COMPANY_STATUS_INACTIVE) {
    return 'companyDeactivated'
  }

  return 'companyUpdated'
}

export function getNextCompanySwitchStatus(isActive: boolean): CompanySwitchStatus {
  return isActive ? COMPANY_STATUS_INACTIVE : COMPANY_STATUS_ACTIVE
}
