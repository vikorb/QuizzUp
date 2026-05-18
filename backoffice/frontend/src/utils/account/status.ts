import {
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
} from '@quizzup/shared'

import type { AccountStatus } from '@/types/account'

export function toAccountStatus(value: unknown): AccountStatus {
  if (value === ADMIN_STATUS_INACTIVE) {
    return ADMIN_STATUS_INACTIVE
  }

  if (value === ADMIN_STATUS_DELETED) {
    return ADMIN_STATUS_DELETED
  }

  return ADMIN_STATUS_ACTIVE
}

export function isAccountActive(status: AccountStatus): boolean {
  return status === ADMIN_STATUS_ACTIVE
}

export function isAccountDeleted(status: AccountStatus): boolean {
  return status === ADMIN_STATUS_DELETED
}

export function getAccountUpdateSuccessCode(status: AccountStatus): string {
  if (status === ADMIN_STATUS_ACTIVE) {
    return 'accountActivated'
  }

  if (status === ADMIN_STATUS_INACTIVE) {
    return 'accountDisabled'
  }

  if (status === ADMIN_STATUS_DELETED) {
    return 'accountDeleted'
  }

  return 'accountUpdated'
}
