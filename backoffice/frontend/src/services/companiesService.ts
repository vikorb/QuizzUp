import type { CompanyDetailsResponse, CompanySwitchStatus, CreateCompanyPayload, CreateCompanyResponse, DeleteCompanyResponse, DeleteCompanyResult, LoadCompaniesResult, UpdateCompanyPayload, UpdateCompanyResponse, UpdateCompanyStatusResponse, UpdateCompanyStatusResult } from '@/types/company'
import { apiRequestJson } from '@/utils/api'
import { parseCompaniesResponse } from '@/utils/company/parser'

export async function loadCompaniesService(): Promise<LoadCompaniesResult> {
  const result = await apiRequestJson<unknown>({
    path: '/companies',
    method: 'GET',
    authenticated: true,
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    }
  }

  const parsed = parseCompaniesResponse(result.data)

  return {
    ok: true,
    companies: parsed?.companies ?? [],
  }
}


export async function deleteCompanyPermanentlyService(
  companyId: number,
): Promise<DeleteCompanyResult> {
  const result = await apiRequestJson<DeleteCompanyResponse>({
    path: `/companies/${companyId}/permanent`,
    method: 'DELETE',
    authenticated: true,
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    }
  }

  return {
    ok: true,
    data: result.data,
  }
}


export async function updateCompanyStatusService(
  companyId: number,
  status: CompanySwitchStatus,
): Promise<UpdateCompanyStatusResult> {
  const result = await apiRequestJson<UpdateCompanyStatusResponse>({
    path: `/companies/${companyId}/status`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status,
    }),
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    }
  }

  return {
    ok: true,
    company: result.data.company,
  }
}

export function createCompany(payload: CreateCompanyPayload) {
  return apiRequestJson<CreateCompanyResponse>({
    path: '/companies',
    method: 'POST',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function loadCompanyDetailsService(companyId: number) {
  return apiRequestJson<CompanyDetailsResponse>({
    path: `/companies/${companyId}`,
    method: 'GET',
    authenticated: true,
  })
}

export function updateCompanyService(companyId: number, payload: UpdateCompanyPayload) {
  return apiRequestJson<UpdateCompanyResponse>({
    path: `/companies/${companyId}`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}
