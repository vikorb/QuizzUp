import { COMPANY_STATUS_ACTIVE, COMPANY_STATUS_DELETED, COMPANY_STATUS_INACTIVE } from "@quizzup/shared"

export type CompanyRow = {
  id: number
  name: string
  email: string
  status: CompanyStatus
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
  accountsCount: number
}

export type CompanyCreateBody = {
  name: string
  email: string
}

export type CompanyStatusUpdateBody = {
  status: CompanyStatus
}

export type CompanyStatus =
  | typeof COMPANY_STATUS_INACTIVE
  | typeof COMPANY_STATUS_ACTIVE
  | typeof COMPANY_STATUS_DELETED


export type CompanyUpdateBody = {
  name?: string
  email?: string
  status?: CompanyStatus
}
