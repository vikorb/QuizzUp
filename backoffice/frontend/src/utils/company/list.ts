import type { Company, CompanyTableRow } from '@/types/company'
import { toCompanyStatus } from '@/utils/company/status'

export function updateCompanyInList(
  companies: Company[],
  updatedCompany: CompanyTableRow,
): Company[] {
  const updatedStatus = toCompanyStatus(updatedCompany.status)

  return companies.map((company) => {
    if (Number(company.id) !== Number(updatedCompany.id)) {
      return company
    }

    return {
      ...company,
      ...updatedCompany,
      status: updatedStatus ?? company.status,
    }
  })
}

export function removeCompanyFromList(companies: Company[], companyId: number): Company[] {
  return companies.filter((company) => Number(company.id) !== Number(companyId))
}

export function findCompanyById(companies: Company[], companyId: number): Company | undefined {
  return companies.find((company) => Number(company.id) === Number(companyId))
}
