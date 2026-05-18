import type { AdminStatus } from '@quizzup/shared'

export type AccountStatus = AdminStatus

export type AccountStatusFilter = AccountStatus | 'all'

export type Account = {
  id: number
  companyId: number
  role: string
  firstname: string | null
  lastname: string | null
  username: string
  email: string
  status: AccountStatus
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}

export type AccountTableRow = Account & {
  displayName: string
}

export type LoadCompanyAccountsResponse = {
  accounts: Account[]
}

export type AccountStatusUpdatePayload = {
  status: AccountStatus
}

export type AccountStatusUpdateResponse = {
  account: Account
}
