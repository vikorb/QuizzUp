import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_USER,
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
  type AdminRole,
  type AdminStatus,
} from '@quizzup/shared'
import { vi } from 'vitest'

export type AccountMock = {
  id: number
  companyId: number
  firstname: string | null
  lastname: string | null
  displayName: string
  username: string
  email: string
  role: AdminRole
  status: AdminStatus
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
}

type ServiceErrorResult = {
  ok: false
  error: string
}

export type LoadCompanyAccountsResult =
  | {
      ok: true
      data: {
        accounts: AccountMock[]
      }
    }
  | ServiceErrorResult

export type LoadCompanyAccountResult =
  | {
      ok: true
      data: {
        account: AccountMock
      }
    }
  | ServiceErrorResult

export type CreateCompanyAccountResult =
  | {
      ok: true
      data: {
        account: AccountMock
      }
    }
  | ServiceErrorResult

export type UpdateCompanyAccountResult =
  | {
      ok: true
      data: {
        account: AccountMock
      }
    }
  | ServiceErrorResult

export type UpdateAccountStatusResult =
  | {
      ok: true
      data: {
        account: AccountMock
      }
    }
  | ServiceErrorResult

export type DeleteAccountResult =
  | {
      ok: true
      data: {
        account: AccountMock
      }
    }
  | ServiceErrorResult

export const accountsFixture: AccountMock[] = [
  {
    id: 1,
    companyId: 1,
    firstname: 'Alice',
    lastname: 'Admin',
    displayName: 'Alice Admin',
    username: 'alice',
    email: 'alice@quizzup.test',
    role: ADMIN_ROLE_ADMIN,
    status: ADMIN_STATUS_ACTIVE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 2,
    companyId: 1,
    firstname: 'Bob',
    lastname: 'User',
    displayName: 'Bob User',
    username: 'bob',
    email: 'bob@quizzup.test',
    role: ADMIN_ROLE_USER,
    status: ADMIN_STATUS_INACTIVE,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    deletedAt: null,
  },
]

export const createdAccountFixture: AccountMock = {
  id: 42,
  companyId: 1,
  firstname: 'Created',
  lastname: 'User',
  displayName: 'Created User',
  username: 'created',
  email: 'created@quizzup.test',
  role: ADMIN_ROLE_USER,
  status: ADMIN_STATUS_ACTIVE,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  deletedAt: null,
}

export function createAccountFixture(overrides: Partial<AccountMock> = {}): AccountMock {
  return {
    ...createdAccountFixture,
    ...overrides,
  }
}

export const loadCompanyAccountsServiceMock = vi.fn(
  async (_companyId: number): Promise<LoadCompanyAccountsResult> => ({
    ok: true,
    data: {
      accounts: accountsFixture,
    },
  }),
)

export const loadCompanyAccountServiceMock = vi.fn(
  async (_companyId: number, accountId: number): Promise<LoadCompanyAccountResult> => ({
    ok: true,
    data: {
      account: createAccountFixture({
        id: accountId,
        username: 'loaded',
        email: 'loaded@quizzup.test',
      }),
    },
  }),
)

export const createCompanyAccountServiceMock = vi.fn(
  async (companyId: number, payload: Record<string, unknown>): Promise<CreateCompanyAccountResult> => ({
    ok: true,
    data: {
      account: createAccountFixture({
        companyId,
        firstname: typeof payload.firstname === 'string' ? payload.firstname : null,
        lastname: typeof payload.lastname === 'string' ? payload.lastname : null,
        username: String(payload.username ?? 'created'),
        email: String(payload.email ?? 'created@quizzup.test'),
        role: (payload.role as AdminRole | undefined) ?? ADMIN_ROLE_USER,
      }),
    },
  }),
)

export const updateCompanyAccountServiceMock = vi.fn(
  async (
    companyId: number,
    accountId: number,
    payload: Record<string, unknown>,
  ): Promise<UpdateCompanyAccountResult> => ({
    ok: true,
    data: {
      account: createAccountFixture({
        id: accountId,
        companyId,
        firstname: typeof payload.firstname === 'string' ? payload.firstname : 'Updated',
        lastname: typeof payload.lastname === 'string' ? payload.lastname : 'User',
        displayName: 'Updated User',
        username: String(payload.username ?? 'updated'),
        email: String(payload.email ?? 'updated@quizzup.test'),
        role: (payload.role as AdminRole | undefined) ?? ADMIN_ROLE_USER,
      }),
    },
  }),
)

export const updateAccountStatusServiceMock = vi.fn(
  async (
    companyId: number,
    accountId: number,
    status: AdminStatus,
  ): Promise<UpdateAccountStatusResult> => ({
    ok: true,
    data: {
      account: createAccountFixture({
        id: accountId,
        companyId,
        status,
        deletedAt: status === ADMIN_STATUS_DELETED ? '2026-03-01T00:00:00.000Z' : null,
      }),
    },
  }),
)

export const deleteAccountServiceMock = vi.fn(
  async (companyId: number, accountId: number): Promise<DeleteAccountResult> => ({
    ok: true,
    data: {
      account: createAccountFixture({
        id: accountId,
        companyId,
        status: ADMIN_STATUS_DELETED,
        deletedAt: '2026-03-01T00:00:00.000Z',
      }),
    },
  }),
)

export function mockLoadCompanyAccountsSuccess(accounts: AccountMock[] = accountsFixture): void {
  loadCompanyAccountsServiceMock.mockResolvedValue({
    ok: true,
    data: {
      accounts,
    },
  })
}

export function mockLoadCompanyAccountsFailure(error = 'server_error'): void {
  loadCompanyAccountsServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockLoadCompanyAccountSuccess(account: AccountMock = accountsFixture[0]): void {
  loadCompanyAccountServiceMock.mockResolvedValue({
    ok: true,
    data: {
      account,
    },
  })
}

export function mockLoadCompanyAccountFailure(error = 'not_found'): void {
  loadCompanyAccountServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockCreateCompanyAccountSuccess(account: AccountMock = createdAccountFixture): void {
  createCompanyAccountServiceMock.mockResolvedValue({
    ok: true,
    data: {
      account,
    },
  })
}

export function mockCreateCompanyAccountFailure(error = 'server_error'): void {
  createCompanyAccountServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockUpdateCompanyAccountSuccess(account: AccountMock = createdAccountFixture): void {
  updateCompanyAccountServiceMock.mockResolvedValue({
    ok: true,
    data: {
      account,
    },
  })
}

export function mockUpdateCompanyAccountFailure(error = 'server_error'): void {
  updateCompanyAccountServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockUpdateAccountStatusSuccess(account: Partial<AccountMock> = {}): void {
  updateAccountStatusServiceMock.mockImplementation(
    async (companyId, accountId, status): Promise<UpdateAccountStatusResult> => ({
      ok: true,
      data: {
        account: createAccountFixture({
          ...account,
          id: accountId,
          companyId,
          status,
          deletedAt: status === ADMIN_STATUS_DELETED ? '2026-03-01T00:00:00.000Z' : null,
        }),
      },
    }),
  )
}

export function mockUpdateAccountStatusFailure(error = 'server_error'): void {
  updateAccountStatusServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockDeleteAccountSuccess(account: Partial<AccountMock> = {}): void {
  deleteAccountServiceMock.mockImplementation(
    async (companyId, accountId): Promise<DeleteAccountResult> => ({
      ok: true,
      data: {
        account: createAccountFixture({
          ...account,
          id: accountId,
          companyId,
          status: ADMIN_STATUS_DELETED,
          deletedAt: '2026-03-01T00:00:00.000Z',
        }),
      },
    }),
  )
}

export function mockDeleteAccountFailure(error = 'server_error'): void {
  deleteAccountServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function resetAccountsServiceMock(): void {
  loadCompanyAccountsServiceMock.mockReset()
  loadCompanyAccountServiceMock.mockReset()
  createCompanyAccountServiceMock.mockReset()
  updateCompanyAccountServiceMock.mockReset()
  updateAccountStatusServiceMock.mockReset()
  deleteAccountServiceMock.mockReset()

  mockLoadCompanyAccountsSuccess()
  mockLoadCompanyAccountSuccess()
  mockCreateCompanyAccountSuccess()
  mockUpdateCompanyAccountSuccess()
  mockUpdateAccountStatusSuccess()
  mockDeleteAccountSuccess()
}
