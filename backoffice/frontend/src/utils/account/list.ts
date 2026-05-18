import type { Account, AccountTableRow } from '@/types/account'

export function findAccountById(accounts: Account[], accountId: number): Account | undefined {
  return accounts.find((account) => account.id === accountId)
}

export function updateAccountInList(accounts: Account[], updatedAccount: Account): Account[] {
  return accounts.map((account) => (account.id === updatedAccount.id ? updatedAccount : account))
}

export function removeAccountFromList(accounts: Account[], accountId: number): Account[] {
  return accounts.filter((account) => account.id !== accountId)
}

export function getAccountDisplayName(account: Account): string {
  const fullname = [account.firstname, account.lastname].filter(Boolean).join(' ').trim()

  return fullname || account.username
}

export function toAccountTableRow(account: Account): AccountTableRow {
  return {
    ...account,
    displayName: getAccountDisplayName(account),
  }
}
