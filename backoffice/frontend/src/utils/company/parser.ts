import type { CompaniesResponse, Company } from '@/types/company'
import { isRecord, toNumber, toString } from '@/utils'
import { isCompanyStatus } from '@/utils/company/status'

export function parseCompaniesResponse(value: unknown): CompaniesResponse | null {
  if (!isRecord(value)) return null

  const rawCompanies = value.companies
  if (!Array.isArray(rawCompanies)) return { companies: [] }

  const parsedCompanies: Company[] = rawCompanies
    .map((row): Company | null => {
      if (!isRecord(row)) {
        return null
      }

      const id = toNumber(row.id)
      const name = toString(row.name).trim()
      const email = toString(row.email).trim()
      const rawStatus = toNumber(row.status)

      const accountsCount =
        typeof row.accountsCount === 'number'
          ? row.accountsCount
          : typeof row.admins_count === 'number'
            ? row.admins_count
            : undefined

      if (
        id === null ||
        name.length === 0 ||
        email.length === 0 ||
        !isCompanyStatus(rawStatus)
      ) {
        return null
      }

      return {
        id,
        name,
        email,
        status: rawStatus,
        accountsCount,
      }
    })
    .filter((company): company is Company => company !== null)

  return { companies: parsedCompanies }
}
