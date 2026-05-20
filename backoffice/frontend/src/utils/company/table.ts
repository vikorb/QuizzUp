import { COMPANY_STATUS_ACTIVE, COMPANY_STATUS_DELETED, COMPANY_STATUS_INACTIVE } from '@quizzup/shared'

import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import type { TranslateFn } from '@/types'
import type { CompanyTableRow } from '@/types/company'
import { isCompanyStatus, toCompanyStatus } from '@/utils/company/status'

export function isCompanyTableRow(value: Record<string, unknown>): value is CompanyTableRow {
  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    isCompanyStatus(value.status)
  )
}

export function toCompanyTableRow(item: Record<string, unknown>): CompanyTableRow {
  return item as CompanyTableRow
}

export function getClientTableColumns(t: TranslateFn): BaseTableColumn[] {
  return [
    {
      key: 'name',
      label: t('clients.table.columns.name'),
    },
    {
      key: 'email',
      label: t('clients.table.columns.email'),
    },
    {
      key: 'accountsCount',
      label: t('clients.table.columns.accounts'),
      align: 'center',
    },
    {
      key: 'status',
      label: t('clients.table.columns.status'),
    },
    {
      key: 'actions',
      label: t('clients.table.columns.actions'),
      align: 'right',
    },
  ]
}

export function getClientStatusLabel(value: unknown, t: TranslateFn): string {
  const status = toCompanyStatus(value)

  if (status === COMPANY_STATUS_ACTIVE) {
    return t('clients.status.active')
  }

  if (status === COMPANY_STATUS_INACTIVE) {
    return t('clients.status.inactive')
  }

  if (status === COMPANY_STATUS_DELETED) {
    return t('clients.status.deleted')
  }

  return t('clients.status.unknown')
}
