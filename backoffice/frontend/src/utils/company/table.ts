import type { CompanyTableRow } from '@/types/company'
import { isCompanyStatus } from '@/utils/company/status'

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
