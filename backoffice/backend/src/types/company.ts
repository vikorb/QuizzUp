import { CompanyStatus } from "@quizzup/shared"

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
