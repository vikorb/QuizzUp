import type {
  AccountStatus,
  AccountStatusUpdateResponse,
  LoadCompanyAccountsResponse,
} from '@/types/account'
import { apiRequestJson } from '@/utils/api'

export function loadCompanyAccountsService(companyId: number) {
  return apiRequestJson<LoadCompanyAccountsResponse>({
    path: `/companies/${companyId}/admins`,
    method: 'GET',
    authenticated: true,
  })
}

export function updateAccountStatusService(companyId: number, accountId: number, status: AccountStatus) {
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
