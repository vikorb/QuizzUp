import type { CompaniesResponse, Company, CompanyTableRow } from '@/types/company'
import { isRecord, toNumber, toString } from '@/utils'
import { filterByQuery } from '@/utils/filter'

export function parseCompaniesResponse(value: unknown): CompaniesResponse | null {
  if (!isRecord(value)) return null

  const rawCompanies = value.companies
  if (!Array.isArray(rawCompanies)) return { companies: [] }

  const parsedCompanies: Company[] = rawCompanies
    .map((row) => (isRecord(row) ? row : null))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => {
      const id = toNumber(row.id)
      const name = toString(row.name).trim()
      const email = toString(row.email).trim()

      const accountsCount =
        typeof row.accountsCount === 'number'
          ? row.accountsCount
          : typeof row.admins_count === 'number'
            ? row.admins_count
            : undefined

      return {
        id: id ?? NaN,
        name,
        email,
        accountsCount: accountsCount,
      }
    })
    .filter((company) => {
      return Number.isFinite(company.id) && company.name.length > 0 && company.email.length > 0
    })

  return { companies: parsedCompanies }
}

export function filterCompanies(companies: Company[], query: string): Company[] {
  return filterByQuery(companies, query, (company) => [company.name, company.email])
}

export function isCompanyTableRow(value: Record<string, unknown>): value is CompanyTableRow {
  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string'
  )
}
