import type {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE} from '@quizzup/shared';
import {
  type CompanyStatus as SharedCompanyStatus,
} from '@quizzup/shared'

export type CompanyStatus = SharedCompanyStatus

export type CompanySwitchStatus =
  | typeof COMPANY_STATUS_INACTIVE
  | typeof COMPANY_STATUS_ACTIVE
  | typeof COMPANY_STATUS_DELETED

export type ClientStatusFilter = CompanySwitchStatus | 'all'

export type Company = {
  id: number
  name: string
  email: string
  accountsCount?: number
  status: CompanyStatus
}

export type CompaniesResponse = {
  companies: Company[]
}

export type CompanyTableRow = Company & Record<string, unknown>

export type CreateCompanyPayload = {
  name: string
  email: string
}

export type CreateCompanyFieldErrors = {
  name?: string
  email?: string
}

export type CreateCompanyResponse = {
  company: {
    id: number
    name: string
    email: string
    accountsCount: number
    status: CompanyStatus
  }
}

export type CreateCompanyErrorCode =
  | 'email_already_exists'
  | 'name_already_exists'
  | 'invalid_body'
  | 'unknown_error'

export type CreateCompanyResult =
  | {
      ok: true
      company: {
        id: number
        name: string
        email: string
        accountsCount: number
        status: CompanyStatus
      }
    }
  | {
      ok: false
      status: number | null
      errorCode: CreateCompanyErrorCode
      apiError?: string
    }

export type LoadCompaniesResult =
  | {
      ok: true
      companies: Company[]
    }
  | {
      ok: false
      error: string
    }

export type DeleteCompanyResult =
  | {
      ok: true
      data: DeleteCompanyResponse
    }
  | {
      ok: false
      error: string
    }

export type UpdateCompanyStatusResult =
  | {
      ok: true
      company: UpdateCompanyStatusResponse['company']
    }
  | {
      ok: false
      error: string
    }

export type TranslateFn = (key: string) => string

export type DeleteCompanyResponse = {
  success: boolean
  deleted: {
    companyId: number
    adminsCount: number
    companiesCount: number
  }
}

export type UpdateCompanyStatusResponse = {
  company: CompanyTableRow
}

export type CreateCompanyFormValues = {
  name: string
  email: string
}

export type CreateCompanyApiFieldError = {
  field: keyof CreateCompanyFieldErrors
  message: string
}

export type UpdateCompanyPayload = {
  name?: string
  email?: string
  status?: CompanyStatus
}

export type UpdateCompanyResponse = {
  company: Company
}

export type CompanyDetailsResponse = {
  company: Company
}

export type EditCompanyFormValues = {
  name: string
  email: string
  status: CompanyStatus
}

export type EditCompanyFieldErrors = {
  name?: string
  email?: string
}
