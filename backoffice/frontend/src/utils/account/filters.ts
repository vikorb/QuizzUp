import {
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
} from '@quizzup/shared'

import type { TranslateFn } from '@/types'
import type { Account, AccountStatusFilter } from '@/types/account'
import type { SelectFieldOption } from '@/types/form'

export const DEFAULT_ACCOUNT_STATUS_FILTER: AccountStatusFilter = ADMIN_STATUS_ACTIVE

export function getAccountStatusFilterOptions(t: TranslateFn): SelectFieldOption[] {
  return [
    {
      value: String(ADMIN_STATUS_ACTIVE),
      label: t('accounts.filters.status.active'),
    },
    {
      value: String(ADMIN_STATUS_INACTIVE),
      label: t('accounts.filters.status.inactive'),
    },
    {
      value: String(ADMIN_STATUS_DELETED),
      label: t('accounts.filters.status.deleted'),
    },
    {
      value: 'all',
      label: t('accounts.filters.status.all'),
    },
  ]
}

export function parseAccountStatusFilter(
  value: string,
  fallback: AccountStatusFilter,
): AccountStatusFilter {
  if (value === 'all') {
    return 'all'
  }

  const numericValue = Number(value)

  if (
    numericValue === ADMIN_STATUS_ACTIVE ||
    numericValue === ADMIN_STATUS_INACTIVE ||
    numericValue === ADMIN_STATUS_DELETED
  ) {
    return numericValue
  }

  return fallback
}

export function hasAccountToolbarActiveFilters(
  searchQuery: string,
  statusFilter: AccountStatusFilter,
): boolean {
  return searchQuery.trim().length > 0 || statusFilter !== DEFAULT_ACCOUNT_STATUS_FILTER
}

export function filterAccounts(accounts: Account[], searchQuery: string): Account[] {
  const normalizedQuery = searchQuery.trim().toLowerCase()

  if (!normalizedQuery) {
    return accounts
  }

  return accounts.filter((account) => {
    const searchable = [
      account.firstname,
      account.lastname,
      account.username,
      account.email,
      account.role,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchable.includes(normalizedQuery)
  })
}

export function filterAccountsByStatus(
  accounts: Account[],
  statusFilter: AccountStatusFilter,
): Account[] {
  if (statusFilter === 'all') {
    return accounts
  }

  return accounts.filter((account) => account.status === statusFilter)
}
