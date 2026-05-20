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

export type CreateAccountPayload = {
  role: string
  firstname: string | null
  lastname: string | null
  username: string
  email: string
  password: string
}

export type UpdateAccountPayload = {
  role?: string
  firstname?: string | null
  lastname?: string | null
  username?: string
  email?: string
  password?: string
  status?: AdminStatus
}

export type AccountResponse = {
  account: Account
}

export type AccountFormValues = {
  role: string
  firstname: string
  lastname: string
  username: string
  email: string
  password: string
  status: AdminStatus
}

export type AccountFieldErrors = {
  role?: string
  firstname?: string
  lastname?: string
  username?: string
  email?: string
  password?: string
}

export type AccountFormMode = 'create' | 'edit'

export type AccountFormUserContext = {
  id?: unknown
  companyId?: unknown
} | null

export type AccountFormPageContext = {
  isProfileRoute: boolean
  companyId: number
  accountId: number
  mode: AccountFormMode
  isEditMode: boolean
}

export type AccountFormPageTexts = {
  pageTitle: string
  pageSubtitle: string
  cardTitle: string
}
