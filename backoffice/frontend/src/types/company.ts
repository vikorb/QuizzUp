export type Company = {
  id: number
  name: string
  email: string
  accountsCount?: number
  status: number
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
      }
    }
  | {
      ok: false
      status: number | null
      errorCode: CreateCompanyErrorCode
      apiError?: string
    }
