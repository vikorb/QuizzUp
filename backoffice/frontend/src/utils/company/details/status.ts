import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  type CompanyStatus,
} from '@quizzup/shared'

export function isCompanyActiveStatus(status: CompanyStatus): boolean {
  return status === COMPANY_STATUS_ACTIVE
}

export function isCompanyDeletedStatus(status: CompanyStatus): boolean {
  return status === COMPANY_STATUS_DELETED
}

export function hasCompanyStatusChanged(
  currentStatus: CompanyStatus,
  savedStatus: CompanyStatus | null | undefined,
): boolean {
  return savedStatus !== null && savedStatus !== undefined && currentStatus !== savedStatus
}

export function getNextCompanyStatus(status: CompanyStatus): CompanyStatus {
  if (status === COMPANY_STATUS_DELETED) {
    return COMPANY_STATUS_DELETED
  }

  return status === COMPANY_STATUS_ACTIVE ? COMPANY_STATUS_INACTIVE : COMPANY_STATUS_ACTIVE
}

export function getCompanyStatusHelpKey(
  currentStatus: CompanyStatus,
  savedStatus: CompanyStatus | null | undefined,
): string {
  if (hasCompanyStatusChanged(currentStatus, savedStatus)) {
    return currentStatus === COMPANY_STATUS_ACTIVE
      ? 'clients.details.form.fields.status.pendingActiveHelp'
      : 'clients.details.form.fields.status.pendingInactiveHelp'
  }

  if (currentStatus === COMPANY_STATUS_DELETED) {
    return 'clients.details.form.fields.status.deletedHelp'
  }

  return currentStatus === COMPANY_STATUS_ACTIVE
    ? 'clients.details.form.fields.status.activeHelp'
    : 'clients.details.form.fields.status.inactiveHelp'
}
