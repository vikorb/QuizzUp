import type { Account } from '@/types/account'
import type { ActionBanner } from '@/types/banner'
import { findAccountById, getAccountDisplayName } from '@/utils/account/list'
import { getAccountUpdateSuccessCode, toAccountStatus } from '@/utils/account/status'
import { createSuccessBanner } from '@/utils/banner'

export function createAccountUpdatedBanner(
  accounts: Account[],
  updatedAccount: Account
): ActionBanner {
  const currentAccount = findAccountById(accounts, updatedAccount.id)
  const updatedStatus = toAccountStatus(updatedAccount.status)
  const accountName = getAccountDisplayName(updatedAccount, currentAccount)

  return createSuccessBanner(getAccountUpdateSuccessCode(updatedStatus), {
    name: accountName,
  })
}

export function createAccountDeletedBanner(accounts: Account[], accountId: number): ActionBanner {
  const deletedAccount = findAccountById(accounts, accountId)

  return createSuccessBanner('accountDeleted', {
    name: deletedAccount?.username ?? `#${accountId}`,
  })
}
