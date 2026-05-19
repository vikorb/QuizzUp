import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'

import type { ClientStatusFilter, Company, TranslateFn } from '@/types/company'
import { filterByQuery } from '@/utils/filter'

export function filterCompanies(companies: Company[], query: string): Company[] {
  return filterByQuery(companies, query, (company) => [company.name, company.email])
}

export function filterCompaniesByStatus(
  companies: Company[],
  statusFilter: ClientStatusFilter,
): Company[] {
  switch (statusFilter) {
    case COMPANY_STATUS_ACTIVE:
    case COMPANY_STATUS_INACTIVE:
    case COMPANY_STATUS_DELETED:
      return companies.filter((company) => company.status === statusFilter)

    case 'all':
    default:
      return companies
  }
}

export const DEFAULT_CLIENT_STATUS_FILTER = COMPANY_STATUS_ACTIVE

export function getClientStatusFilterOptions(t: TranslateFn) {
  return [
    {
      label: String(t('clients.filters.statusOptions.active')),
      value: COMPANY_STATUS_ACTIVE,
    },
    {
      label: String(t('clients.filters.statusOptions.inactive')),
      value: COMPANY_STATUS_INACTIVE,
    },
    {
      label: String(t('clients.filters.statusOptions.deleted')),
      value: COMPANY_STATUS_DELETED,
    },
    {
      label: String(t('clients.filters.statusOptions.all')),
      value: 'all',
    },
  ]
}

export function parseClientStatusFilter(
  value: unknown,
  fallback: ClientStatusFilter,
): ClientStatusFilter {
  switch (String(value)) {
    case String(COMPANY_STATUS_ACTIVE):
      return COMPANY_STATUS_ACTIVE

    case String(COMPANY_STATUS_INACTIVE):
      return COMPANY_STATUS_INACTIVE

    case String(COMPANY_STATUS_DELETED):
      return COMPANY_STATUS_DELETED

    case 'all':
      return 'all'

    default:
      return fallback
  }
}

export function hasClientToolbarActiveFilters(
  searchQuery: string,
  statusFilter: ClientStatusFilter,
): boolean {
  return searchQuery.trim() !== '' || statusFilter !== DEFAULT_CLIENT_STATUS_FILTER
}
