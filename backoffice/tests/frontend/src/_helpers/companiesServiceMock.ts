import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  type CompanyStatus,
} from '@quizzup/shared'
import { vi } from 'vitest'

export type CompanyMock = {
  id: number
  name: string
  email: string
  status: CompanyStatus
  accountsCount?: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
}

export type CompanyTableRowMock = CompanyMock & {
  accountsCount: number
}

type ServiceErrorResult = {
  ok: false
  error: string
}

type LoadCompaniesResult =
  | {
      ok: true
      companies: CompanyMock[]
    }
  | ServiceErrorResult

type LoadCompanyDetailsResult =
  | {
      ok: true
      data: {
        company: CompanyMock
      }
    }
  | ServiceErrorResult

export type CreateCompanyResult =
  | {
      ok: true
      data: {
        company: CompanyMock
      }
    }
  | ServiceErrorResult

type UpdateCompanyStatusResult =
  | {
      ok: true
      company: Partial<CompanyMock> & {
        id: number
        status: CompanyStatus
        updatedAt: string
        deletedAt: string | null
      }
    }
  | ServiceErrorResult

type DeleteCompanyResult =
  | {
      ok: true
      deleted: {
        companyId: number
        adminsCount: number
        companiesCount: number
      }
    }
  | ServiceErrorResult

export const companiesFixture: CompanyMock[] = [
  {
    id: 1,
    name: 'Acme Corp',
    email: 'contact@acme.test',
    status: COMPANY_STATUS_ACTIVE,
    accountsCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 2,
    name: 'Beta Studio',
    email: 'hello@beta.test',
    status: COMPANY_STATUS_INACTIVE,
    accountsCount: 1,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    deletedAt: null,
  },
]

export const createdCompanyFixture: CompanyMock = {
  id: 42,
  name: 'Created Client',
  email: 'created@client.test',
  status: COMPANY_STATUS_ACTIVE,
  accountsCount: 0,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  deletedAt: null,
}

export const loadCompaniesServiceMock = vi.fn(
  async (): Promise<LoadCompaniesResult> => ({
    ok: true,
    companies: companiesFixture,
  }),
)

export const loadCompanyDetailsServiceMock = vi.fn(
  async (_companyId: number): Promise<LoadCompanyDetailsResult> => ({
    ok: true,
    data: {
      company: companiesFixture[0],
    },
  }),
)

export const createCompanyMock = vi.fn(
  async (_payload: { name: string; email: string }): Promise<CreateCompanyResult> => ({
    ok: true,
    data: {
      company: createdCompanyFixture,
    },
  }),
)

export const updateCompanyStatusServiceMock = vi.fn(
  async (companyId: number, status: CompanyStatus): Promise<UpdateCompanyStatusResult> => ({
    ok: true,
    company: {
      id: companyId,
      status,
      updatedAt: '2026-03-01T00:00:00.000Z',
      deletedAt: status === COMPANY_STATUS_DELETED ? '2026-03-01T00:00:00.000Z' : null,
    },
  }),
)

export const deleteCompanyPermanentlyServiceMock = vi.fn(
  async (companyId: number): Promise<DeleteCompanyResult> => ({
    ok: true,
    deleted: {
      companyId,
      adminsCount: 0,
      companiesCount: 1,
    },
  }),
)

export function mockLoadCompaniesSuccess(companies: CompanyMock[] = companiesFixture): void {
  loadCompaniesServiceMock.mockResolvedValue({
    ok: true,
    companies,
  })
}

export function mockLoadCompaniesFailure(error = 'server_error'): void {
  loadCompaniesServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockLoadCompanyDetailsSuccess(company: CompanyMock = companiesFixture[0]): void {
  loadCompanyDetailsServiceMock.mockResolvedValue({
    ok: true,
    data: {
      company,
    },
  })
}

export function mockLoadCompanyDetailsFailure(error = 'not_found'): void {
  loadCompanyDetailsServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockCreateCompanySuccess(company: CompanyMock = createdCompanyFixture): void {
  createCompanyMock.mockResolvedValue({
    ok: true,
    data: {
      company,
    },
  })
}

export function mockCreateCompanyFailure(error = 'server_error'): void {
  createCompanyMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockUpdateCompanyStatusSuccess(company: Partial<CompanyMock> = {}): void {
  updateCompanyStatusServiceMock.mockImplementation(
    async (companyId, status): Promise<UpdateCompanyStatusResult> => ({
      ok: true,
      company: {
        ...company,
        id: companyId,
        status,
        updatedAt: '2026-03-01T00:00:00.000Z',
        deletedAt: status === COMPANY_STATUS_DELETED ? '2026-03-01T00:00:00.000Z' : null,
      },
    }),
  )
}

export function mockUpdateCompanyStatusFailure(error = 'server_error'): void {
  updateCompanyStatusServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockDeleteCompanySuccess(companyId = 1): void {
  deleteCompanyPermanentlyServiceMock.mockResolvedValue({
    ok: true,
    deleted: {
      companyId,
      adminsCount: 0,
      companiesCount: 1,
    },
  })
}

export function mockDeleteCompanyFailure(error = 'server_error'): void {
  deleteCompanyPermanentlyServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function resetCompaniesServiceMock(): void {
  loadCompaniesServiceMock.mockReset()
  loadCompanyDetailsServiceMock.mockReset()
  createCompanyMock.mockReset()
  updateCompanyStatusServiceMock.mockReset()
  deleteCompanyPermanentlyServiceMock.mockReset()

  mockLoadCompaniesSuccess()
  mockLoadCompanyDetailsSuccess()
  mockCreateCompanySuccess()
  mockUpdateCompanyStatusSuccess()
  mockDeleteCompanySuccess()
}
