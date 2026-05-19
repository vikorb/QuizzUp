import type {
  AccountResponse,
  AccountStatus,
  AccountStatusUpdateResponse,
  CreateAccountPayload,
  LoadCompanyAccountsResponse,
  UpdateAccountPayload,
} from '@/types/account'
import { apiRequestJson } from '@/utils/api'

export function loadCompanyAccountsService(companyId: number) {
  return apiRequestJson<LoadCompanyAccountsResponse>({
    path: `/companies/${companyId}/admins`,
    method: 'GET',
    authenticated: true,
  })
}

export function updateAccountStatusService(
  companyId: number,
  accountId: number,
  status: AccountStatus,
) {
  return apiRequestJson<AccountStatusUpdateResponse>({
    path: `/companies/${companyId}/admins/${accountId}/status`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  })
}

export function deleteAccountService(companyId: number, accountId: number) {
  return apiRequestJson<AccountStatusUpdateResponse>({
    path: `/companies/${companyId}/admins/${accountId}`,
    method: 'DELETE',
    authenticated: true,
  })
}

export function createCompanyAccountService(companyId: number, payload: CreateAccountPayload) {
  return apiRequestJson<AccountResponse>({
    path: `/companies/${companyId}/admins`,
    method: 'POST',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function loadCompanyAccountService(companyId: number, accountId: number) {
  return apiRequestJson<AccountResponse>({
    path: `/companies/${companyId}/admins/${accountId}`,
    method: 'GET',
    authenticated: true,
  })
}

export function updateCompanyAccountService(
  companyId: number,
  accountId: number,
  payload: UpdateAccountPayload,
) {
  return apiRequestJson<AccountResponse>({
    path: `/companies/${companyId}/admins/${accountId}`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}
